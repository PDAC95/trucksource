-- 0004_garage.sql
-- Phase 4 — My Garage.
-- garage_trucks is the FIRST owner-scoped read+write `authenticated` table in the
-- project: an authenticated user does INSERT/SELECT/UPDATE/DELETE on their OWN rows
-- only. Until now every table was either the privacy split (0001), service-role-only
-- abuse stores (0002), or public-read reference data (0003). This is the first place a
-- normal user mutates their own private account data, so its RLS owner-scoping IS the
-- phase's privacy gate (re-verified by tests/integration/garage.test.ts).
--
-- Privacy / RLS invariants preserved (CLAUDE.md invariants 1 & 2):
--   - RLS is enabled in the SAME migration that creates the table (default-deny).
--   - FOUR owner policies (select/insert/update/delete), all `to authenticated`, all
--     scoped with the `(select auth.uid()) = user_id` wrapper (perf-correct, repo-wide
--     convention from 0001/0002).
--   - NO anon policy and NO `to anon` grant: a garage is private account data and must
--     be structurally INVISIBLE to the public anon key (an anon SELECT yields 0 rows,
--     an anon INSERT is denied). The garage never appears on a public surface.
--   - NO SECURITY DEFINER anywhere here: a DEFINER read would bypass RLS and leak other
--     users' garages.
--
-- Modeling notes:
--   - We store model_id + a NULLABLE config_id; make is DERIVED via models.make_id (no
--     make_id column — that would be denormalized and could drift).
--   - config_id NULL = a model-level truck (the user saved "any 379", no specific config).
--   - on delete: CASCADE for user_id (deleting the user clears their garage) but RESTRICT
--     for model_id/config_id, so retiring a reference model/config never silently nukes a
--     user's saved truck.
--   - No-exact-duplicate (Make,Model,Config) per user. Because the dedup must fold the
--     NULL config arm and constraints can't use expressions, this is a UNIQUE INDEX over
--     coalesce(config_id, 0) — the same trick as 0003's search_term_targets_uniq.

create table public.garage_trucks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id bigint not null references public.models(id) on delete restrict,
  config_id bigint references public.configurations(id) on delete restrict,  -- NULL = model-level
  nickname text,
  created_at timestamptz not null default now(),
  constraint nickname_len check (nickname is null or char_length(nickname) <= 40)
);
create index garage_trucks_user_id_idx on public.garage_trucks (user_id);
-- No-exact-duplicate (Make,Model,Config) per user. coalesce folds the NULL config arm
-- (constraints can't use expressions; must be a unique INDEX — the 0003 trick).
create unique index garage_trucks_uniq
  on public.garage_trucks (user_id, model_id, coalesce(config_id, 0));

alter table public.garage_trucks enable row level security;

-- Four owner policies, all `to authenticated`, all using the (select auth.uid()) wrapper.
create policy "garage_trucks owner-select"
  on public.garage_trucks for select
  to authenticated using ((select auth.uid()) = user_id);

create policy "garage_trucks owner-insert"
  on public.garage_trucks for insert
  to authenticated with check ((select auth.uid()) = user_id);

create policy "garage_trucks owner-update"
  on public.garage_trucks for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "garage_trucks owner-delete"
  on public.garage_trucks for delete
  to authenticated using ((select auth.uid()) = user_id);
