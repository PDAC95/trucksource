-- 0015_social.sql
-- Phase 8 — Social Layer (SOCL-01 comments, SOCL-02 saves) schema root.
--
-- ONE migration lands the entire Phase-8 schema so every downstream plan
-- (actions, queries, UI) builds against a stable surface:
--   1. listing_comments      — public-read comments; self-attribution, ACTIVE-only
--                              inserts ("comments closed when sold") and structural
--                              depth-1 replies are ALL enforced in the INSERT RLS
--                              policy, not just app code (Pitfalls 2 & 3).
--   2. saved_listings        — private bookmarks; owner-only on EVERY operation,
--                              no anon policy of any kind.
--   3. comment_deletion_log  — default-deny audit table (RLS on, ZERO policies);
--                              written only by the definer trigger below, read only
--                              by the service role (Phase 10). Mirrors the
--                              listing_view_events posture.
--   4. log_comment_deletion()/listing_comments_audit — BEFORE DELETE row trigger;
--                              row triggers fire per FK-cascaded reply delete, so
--                              replies are audited with the same deleted_by.
--   5. my_listing_save_counts() — seller-facing save COUNT (never WHO). SECURITY
--                              DEFINER to aggregate past the owner-only RLS, but
--                              hard-scoped to listings the CALLER sells; revoked
--                              from anon (0008 definer hygiene).
--   6. listings.comments_seen_at — new-comment watermark; additive, NO new RLS
--                              policy (the 0006 owner-update policy covers it;
--                              0009/0010 precedent).
--
-- Invariant #2: RLS is enabled in this SAME migration for every new table.
-- No UPDATE policy on listing_comments — "no editing" is a locked decision and
-- the ABSENCE of the policy is the enforcement.

-- ===========================================================================
-- 1. listing_comments (SOCL-01)
-- ===========================================================================
create table public.listing_comments (
  id bigint generated always as identity primary key,
  listing_id bigint not null references public.listings(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_id bigint references public.listing_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index listing_comments_listing_idx
  on public.listing_comments (listing_id, created_at desc);
create index listing_comments_parent_idx
  on public.listing_comments (parent_id);

alter table public.listing_comments enable row level security;

-- Public-read: comments are public social interaction (attribution resolves via
-- profiles_public ONLY in the readers — author_id is a uuid, not PII).
create policy "comments public-read" on public.listing_comments
  for select to anon, authenticated using (true);

-- Insert: must be self-attributed, the listing must be ACTIVE and unexpired
-- (sold/expired = comments closed, Pitfall 2), and a reply's parent must itself
-- be top-level AND on the same listing (depth-1 + no cross-listing graft,
-- Pitfall 3). The depth-1 subquery on listing_comments routes through the
-- table's own SELECT policy (using (true)) — no recursion.
--
-- IMPORTANT: inside the depth-1 EXISTS the NEW row's columns MUST be qualified
-- as listing_comments.* — an unqualified `parent_id`/`listing_id` binds to the
-- subquery table `p` (innermost scope wins), turning the check into
-- `p.id = p.parent_id`, which is never true and rejects every legitimate reply.
create policy "comments author-insert" on public.listing_comments
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and exists (
      select 1 from public.listings l
      where l.id = listing_comments.listing_id
        and l.status = 'active'
        and (l.expires_at is null or l.expires_at > now())
    )
    and (
      parent_id is null
      or exists (
        select 1 from public.listing_comments p
        where p.id = listing_comments.parent_id
          -- reply stays on the same listing:
          and p.listing_id = listing_comments.listing_id
          -- depth-1: parent must be top-level:
          and p.parent_id is null
      )
    )
  );

-- Delete: own comment OR any comment on a listing you sell.
-- NO update policy (locked: no editing).
create policy "comments author-or-seller-delete" on public.listing_comments
  for delete to authenticated using (
    (select auth.uid()) = author_id
    or exists (
      select 1 from public.listings l
      where l.id = listing_id and l.seller_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- 2. saved_listings (SOCL-02) — owner-only EVERYTHING, no anon policy at all.
-- ===========================================================================
create table public.saved_listings (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id bigint not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index saved_listings_listing_idx on public.saved_listings (listing_id);

alter table public.saved_listings enable row level security;

create policy "saves owner-select" on public.saved_listings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "saves owner-insert" on public.saved_listings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saves owner-delete" on public.saved_listings
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ===========================================================================
-- 3. comment_deletion_log — default-deny audit (RLS on, ZERO policies).
--    Only the definer trigger writes; only the service role (Phase 10) reads.
-- ===========================================================================
create table public.comment_deletion_log (
  id bigint generated always as identity primary key,
  comment_id bigint not null,
  listing_id bigint not null,
  author_id uuid not null,
  parent_id bigint,
  body text not null,                       -- snapshot for the Phase-10 audit
  comment_created_at timestamptz not null,
  deleted_by uuid,                          -- auth.uid() of the deleter
  deleted_at timestamptz not null default now()
);
alter table public.comment_deletion_log enable row level security;
-- NO policies at all: default-deny.

-- ===========================================================================
-- 4. Deletion audit trigger. SECURITY DEFINER so the insert bypasses the
--    default-deny RLS on the log table; search_path = '' → schema-qualify
--    everything (0008/0011 definer hygiene). Row-level BEFORE DELETE fires for
--    each FK-cascaded reply too, so replies are audited with the same deleted_by.
-- ===========================================================================
create or replace function public.log_comment_deletion()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.comment_deletion_log
    (comment_id, listing_id, author_id, parent_id, body, comment_created_at, deleted_by)
  values
    (old.id, old.listing_id, old.author_id, old.parent_id, old.body, old.created_at,
     (select auth.uid()));
  return old;
end $$;

drop trigger if exists listing_comments_audit on public.listing_comments;
create trigger listing_comments_audit
  before delete on public.listing_comments
  for each row execute function public.log_comment_deletion();

-- ===========================================================================
-- 5. Seller-facing save COUNT (never WHO). SECURITY DEFINER bypasses the
--    owner-only RLS to aggregate, but hard-scopes output to listings the
--    CALLER sells. Revoked from public/anon (definer hygiene, 0008 precedent).
-- ===========================================================================
create or replace function public.my_listing_save_counts()
returns table (listing_id bigint, save_count bigint)
language sql
stable
security definer set search_path = ''
as $$
  select s.listing_id, count(*)::bigint
  from public.saved_listings s
  join public.listings l on l.id = s.listing_id
  where l.seller_id = (select auth.uid())
  group by s.listing_id
$$;
revoke all on function public.my_listing_save_counts() from public, anon;
grant execute on function public.my_listing_save_counts() to authenticated;

-- ===========================================================================
-- 6. New-comment watermark (seen-at). Additive + nullable; NO new RLS policy —
--    the existing owner-update policy on listings already covers it.
-- ===========================================================================
alter table public.listings add column if not exists comments_seen_at timestamptz;
