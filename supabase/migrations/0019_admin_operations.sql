-- 0019_admin_operations.sql
-- Phase 10 — Admin Operations & Analytics: ALL structural schema in ONE migration.
-- Enforcement is structural (RLS), never app-side filtering (CLAUDE.md invariant #2).
--
-- Sections (requirement IDs annotated per section):
--   1. user_restrictions          — ADMO-01 (suspend/ban state, lazy expiry, self-read)
--   2. admin_audit_log            — ADMO-01..06 (unified audit; default-deny both directions)
--   3. reports queue columns      — ADMO-03 (pending/resolved/dismissed + admin note)
--   4. listing moderation         — ADMO-02 ('draft' status, hidden_at/hidden_reason,
--                                   replaced public-read policy = the structural boundary)
--   5. thread freeze              — ADMO-04 (frozen_at/frozen_by on message_threads)
--   6. messages INSERT policy     — ADMO-01/04 (restricted users + frozen threads cannot send)
--   7. taxonomy is_active flags   — ADMO-05/06 (deactivate per value; existing listings intact)
--   8. analytics time indexes     — ADMA-02/03 (live-query dashboard at launch volume)
--   9. admin_user_activity_stats  — ADMA-01 (registered + MAU via definer RPC; auth schema
--                                   is not exposed to PostgREST)
--
-- Conventions preserved: lowercase SQL, text + CHECK over pg enums (0006/0010 precedent),
-- (select auth.uid()) wrapper, RLS enabled in the SAME migration as table creation,
-- policy subqueries qualify the policy table's columns (0015/0016 lesson).

-- ===========================================================================
-- 1. user_restrictions (ADMO-01) — one row per restricted user.
--    Written ONLY by the service role (no insert/update/delete policies →
--    default-deny). The user reads their OWN row: that powers the blocked page
--    ("Account suspended until [date] — reason: [X]").
--    Lazy expiry semantics (Pitfall 3 — pg_cron unscheduled on Staging):
--    "currently restricted" is ALWAYS computed as
--      state = 'banned' or (state = 'suspended' and suspended_until > now())
--    Never a cron-flipped flag.
-- ===========================================================================
create table public.user_restrictions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null check (state in ('suspended', 'banned')),
  reason text not null,
  suspended_until timestamptz, -- null for bans
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  -- a suspension MUST carry its expiry; bans carry none
  check (state <> 'suspended' or suspended_until is not null)
);

alter table public.user_restrictions enable row level security;

-- Self-read only (the blocked page). NO write policies: service-role-only writes.
create policy "restrictions self-select" on public.user_restrictions
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ===========================================================================
-- 2. admin_audit_log (ADMO-01..06) — every admin action (hide, suspend, rename,
--    taxonomy edits, thread-content access, csv import...) in ONE table.
--    RLS enabled with ZERO policies: default-deny in BOTH directions — only the
--    service role (the admin console) reads or writes. Retention: forever in v1
--    (an audit log you prune is not an audit log).
-- ===========================================================================
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users(id),
  action text not null,      -- e.g. 'listing_hide','user_suspend','thread_content_access'
  target_type text not null, -- 'user','listing','photo','report_group','thread','taxonomy','import'
  target_id text not null,   -- text: covers uuid + bigint + composite targets
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
-- ZERO policies — deliberate. Service-role only, both directions.

-- ===========================================================================
-- 3. Report queue columns (ADMO-03) — reports (0016) is append-only with
--    reporter-only RLS; the admin acts via the service role, so the new queue
--    columns need NO new policies (default-deny already protects them).
--    Grouping (multiple reports on one target = one queue entry) happens in the
--    QUERY, not the schema.
-- ===========================================================================
alter table public.reports
  add column status text not null default 'pending'
    check (status in ('pending', 'resolved', 'dismissed')),
  add column resolved_by uuid references auth.users(id),
  add column resolved_at timestamptz,
  add column admin_note text;

create index reports_status_idx on public.reports (status, created_at desc);

-- ===========================================================================
-- 4. Listing moderation (ADMO-02) — two orthogonal mechanisms:
--    a) status gains 'draft' (CSV imports land here; owner-only visibility);
--    b) moderation hiding is hidden_at + hidden_reason. The reason column exists
--       so reactivation restores ONLY suspension-hidden listings — never
--       admin-moderated ones; ban-hidden rows stay hidden permanently.
--    The REPLACED public-read SELECT policy is the single structural choke
--    point: search_listings is security invoker, the detail page and the 0008
--    count RPC read the table directly — the policy filters them ALL.
-- ===========================================================================
alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings add constraint listings_status_check
  check (status in ('draft', 'active', 'sold', 'expired'));

alter table public.listings
  add column hidden_at timestamptz,
  add column hidden_reason text
    check (hidden_reason in ('moderation', 'suspension', 'ban'));

-- Replace the 0006 public-read policy (`using (true)`): hidden/draft rows are
-- visible ONLY to their owner. Owner-insert/update/delete policies untouched.
drop policy "listings public-read" on public.listings;

create policy "listings public-read" on public.listings
  for select to anon, authenticated
  using (
    (hidden_at is null and status <> 'draft')
    or seller_id = (select auth.uid())
  );

-- ===========================================================================
-- 5. Thread freeze (ADMO-04) — admin closes a problematic thread; no one can
--    write further (enforced in section 6), both sides keep read access.
-- ===========================================================================
alter table public.message_threads
  add column frozen_at timestamptz,
  add column frozen_by uuid references auth.users(id);

-- ===========================================================================
-- 6. Messages INSERT policy (ADMO-01 suspended-cannot-send, ADMO-04 freeze).
--    Recreated with the FULL 0018 body (self-attributed sender + participant +
--    definer-backed pair-block check) PLUS two new arms:
--      - sender not currently restricted (lazy expiry predicate — the caller
--        CAN see their own user_restrictions row via the self-select policy,
--        so a plain subquery is correct here, unlike the 0018 block-visibility
--        bug);
--      - thread not frozen.
--    Both arms are index hits (user_restrictions PK, message_threads PK).
--    The SELECT policy is deliberately UNTOUCHED — it is the realtime hot path
--    (WALRUS, Pitfall 4).
-- ===========================================================================
drop policy "messages participant-insert" on public.messages;

create policy "messages participant-insert" on public.messages
  for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and exists (
      select 1 from public.message_threads t
      where t.id = messages.thread_id
        and (select auth.uid()) in (t.buyer_id, t.seller_id)
    )
    and not public.thread_pair_blocked(messages.thread_id)
    -- new arm: sender is not banned / actively suspended (ADMO-01)
    and not exists (
      select 1 from public.user_restrictions r
      where r.user_id = (select auth.uid())
        and (
          r.state = 'banned'
          or (r.state = 'suspended' and r.suspended_until > now())
        )
    )
    -- new arm: thread is not frozen by moderation (ADMO-04)
    and exists (
      select 1 from public.message_threads t2
      where t2.id = messages.thread_id
        and t2.frozen_at is null
    )
  );

-- ===========================================================================
-- 7. Taxonomy is_active (ADMO-05/06) — per-value deactivation on all 8 levels.
--    NEW-listing pickers filter is_active = true; search/read surfaces do NOT
--    filter (locked decision: existing listings stay visible/searchable with
--    old values). Hard delete remains FK-restrict-guarded; deactivate is the
--    safe default.
-- ===========================================================================
alter table public.makes           add column is_active boolean not null default true;
alter table public.models          add column is_active boolean not null default true;
alter table public.configurations  add column is_active boolean not null default true;
alter table public.search_terms    add column is_active boolean not null default true;
alter table public.part_categories add column is_active boolean not null default true;
alter table public.materials       add column is_active boolean not null default true;
alter table public.conditions      add column is_active boolean not null default true;
alter table public.special_filters add column is_active boolean not null default true;

-- ===========================================================================
-- 8. Analytics time indexes (ADMA-02/03) — the dashboard runs live, time-ranged
--    aggregates over the append-only event streams; these are the only missing
--    indexes for that access pattern.
-- ===========================================================================
create index search_events_created_idx on public.search_events (created_at desc);
create index listing_view_events_created_idx on public.listing_view_events (created_at desc);

-- ===========================================================================
-- 9. admin_user_activity_stats (ADMA-01) — registered + active-30d (MAU).
--    last_sign_in_at lives in the auth schema, which PostgREST does not expose;
--    a security-definer RPC with execute REVOKED from anon/authenticated/public
--    is the sanctioned pattern. Only service_role retains execute.
-- ===========================================================================
create or replace function public.admin_user_activity_stats()
returns table (registered bigint, active_30d bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.profiles_public),
    (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days');
$$;

revoke execute on function public.admin_user_activity_stats() from public;
revoke execute on function public.admin_user_activity_stats() from anon;
revoke execute on function public.admin_user_activity_stats() from authenticated;
-- service_role keeps execute → only the admin console (service-role client) can call it.
