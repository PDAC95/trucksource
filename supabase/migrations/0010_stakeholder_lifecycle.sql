-- 0010_stakeholder_lifecycle.sql
-- Phase 5.1 — Stakeholder Trust & Lifecycle (INSERTED).
--
-- One migration landing ALL FOUR features' schema at once so the Wave-2 feature
-- plans and the Wave-3 cron/notify plan build against a stable schema. This is a
-- schema-and-Server-Action evolution of two already-shipped tables
-- (profiles_public from 0001/0009, listings from 0006) — nothing here is greenfield.
--
-- Privacy posture (cross-cutting gate re-verified): seller_type + display_name are
-- additive NON-PII columns on the world-readable profiles_public. NO new RLS policy
-- is added for them — the 0001 "owner updates own public profile" policy
-- ((select auth.uid()) = id) already authorizes owner writes, and anon has no
-- update policy (the 0009 contact_preference precedent). PII still lives only on
-- profiles_private; nothing here reads it.
--
-- Idempotent: every statement uses if exists / if not exists / or replace so the
-- migration can be re-applied non-destructively via `supabase db query --linked -f`.

-- ===========================================================================
-- 1. profiles_public: seller_type + display_name (ACCT-07, ACCT-08)
--    Additive, NO new RLS policy (0009 precedent; 0001 owner-update covers them).
-- ===========================================================================

-- ACCT-07: single informational seller type. Nullable, no default → empty = no
-- badge (CONTEXT lock). text + CHECK, mirroring contact_preference (NOT a pg enum).
alter table public.profiles_public
  add column if not exists seller_type text
    check (seller_type in (
      'dealer','truck_dismantler','manufacturer','owner_operator',
      'fleet_mechanic','repair_shop','fleet_owner'
    ));

-- ACCT-08: opt-in public display name. Owner-typed FREE TEXT — NEVER auto-populated
-- from profiles_private (Pitfall 1: "display name" sounds like the real name, which
-- lives in profiles_private — it must not be sourced from there). `username` (the
-- immutable anonymous handle from 0001) is NEVER mutated by this feature; the public
-- name = coalesce(display_name, username), so reverting (display_name -> null)
-- structurally restores the ORIGINAL handle.
alter table public.profiles_public
  add column if not exists display_name text
    check (display_name is null or char_length(btrim(display_name)) between 1 and 50);

-- ===========================================================================
-- 2. listings: status CHECK + expires_at + backfill (LIST-09)
--    0006 deliberately used text + CHECK (not a pg enum) so adding 'expired' is a
--    one-line CHECK edit, no breaking migration. The real constraint name was
--    confirmed as `listings_status_check` at apply time (pg_constraint).
-- ===========================================================================
alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings add constraint listings_status_check
  check (status in ('active', 'sold', 'expired'));

-- 90-day clock. Backfill ONLY existing active rows (sold is terminal — no clock).
alter table public.listings add column if not exists expires_at timestamptz;
update public.listings
  set expires_at = date_listed + interval '90 days'
  where status = 'active' and expires_at is null;

-- ===========================================================================
-- 3. Indexes (LIST-09 daily cron scan + LIST-10 duplicate match)
-- ===========================================================================

-- Cheap daily cron scan: only active rows, ordered by expiry. The partial
-- predicate matches the flip's `where status='active'` (Pitfall 3).
create index if not exists listings_active_expires_idx
  on public.listings (expires_at) where status = 'active';

-- Trigram GIN index for the same-seller fuzzy duplicate-title match (LIST-10).
-- pg_trgm was enabled in 0001; no trigram index on listings.title existed yet
-- (search is Phase 7, not shipped). CLAUDE.md #7 forbids LIKE '%x%' (Pitfall 4).
create index if not exists listings_title_trgm_idx
  on public.listings using gin (title gin_trgm_ops);

-- ===========================================================================
-- 4. notifications (in-app surface for LIST-09 near-expiry)
--    RLS enabled in THIS migration (invariant #2). Owner reads own + owner marks
--    read; NO authenticated INSERT policy — rows are written by the service-role
--    near-expiry cron route handler (plan 5.1-05). `kind` is free text so Phase 9
--    (chat) / Phase 10 (admin) extend it non-breakingly.
-- ===========================================================================
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                       -- 'listing_expiring' (this phase); 'message'/'report' later
  listing_id bigint references public.listings(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "owner reads own notifications" on public.notifications;
create policy "owner reads own notifications" on public.notifications
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "owner updates own notifications" on public.notifications;
create policy "owner updates own notifications" on public.notifications
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
-- No INSERT policy for authenticated → only the service-role cron route writes rows.

-- ===========================================================================
-- 5. find_similar_own_listings (LIST-10 same-seller duplicate probe)
--    SECURITY INVOKER so owner RLS still applies (caller only ever sees their own
--    rows). Scoped to the caller's non-sold listings; never blocks publish (the
--    Server Action surfaces matches as a soft warning). empty search_path is the
--    repo convention for SECURITY-scoped functions.
-- ===========================================================================
-- NOTE: with `search_path = ''` every object MUST be schema-qualified, including
-- pg_trgm's similarity() (installed in the `public` schema on this project). An
-- unqualified similarity() fails to resolve at function-creation time.
create or replace function public.find_similar_own_listings(p_title text, p_threshold real)
returns table (id bigint, title text, sim real)
language sql stable security invoker set search_path = '' as $$
  select l.id, l.title, public.similarity(l.title, p_title) as sim
  from public.listings l
  where l.seller_id = (select auth.uid())
    and l.status <> 'sold'
    and public.similarity(l.title, p_title) >= p_threshold
  order by sim desc
  limit 5;
$$;
