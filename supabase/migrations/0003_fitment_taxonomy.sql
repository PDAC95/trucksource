-- 0003_fitment_taxonomy.sql
-- Phase 3 — Fitment Taxonomy & Slang Library.
-- Defines the complete 8-level fitment schema as REFERENCE DATA (no rows here — the
-- data ships in seed.sql, Plan 03-02). The eight levels are:
--   L1 makes → L2 models → L3 configurations → L4 common search terms (trucker slang)
--   L5 part_categories → L6 materials → L7 conditions → L8 special_filters
--
-- Privacy / RLS invariants preserved (CLAUDE.md invariant 2):
--   - Every table enables RLS in the SAME migration that creates it (default-deny).
--   - Each table gets exactly ONE `for select to anon, authenticated using (true)` policy:
--     the taxonomy is browsable by everyone (anon + authenticated).
--   - NO insert/update/delete policy on ANY table: writes are service-role-only by
--     default-deny (exactly as otp_send_attempts / abuse_events do it in 0002). The seed
--     and admin tooling run with the service role; the public anon key can never mutate
--     reference data.
--
-- Style mirrors 0001/0002 verbatim:
--   - lowercase SQL keywords; PK = `id bigint generated always as identity primary key`
--     (reference data — no need for unguessable ids); `created_at timestamptz not null default now()`.
--   - `citext` (enabled in 0001) is used for search_terms.term so slang uniqueness is
--     case-insensitive.

-- ===========================================================================
-- Hierarchical core: makes → models → configurations (+ model_configurations join)
-- ===========================================================================

-- L1) makes (FITL-01) — top of the fitment tree (e.g. 'Peterbilt', 'Kenworth').
-- UNIQUE(name) makes the seed idempotent via `on conflict (name)`.
create table public.makes (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.makes enable row level security;
create policy "makes public-readable"
  on public.makes for select
  to anon, authenticated using (true);

-- L2) models (FITL-02) — scoped UNDER a make. Composite UNIQUE(make_id, name) both
-- enforces model uniqueness within a make and enables `on conflict (make_id, name)` seeding.
create table public.models (
  id bigint generated always as identity primary key,
  make_id bigint not null references public.makes(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (make_id, name)
);
create index models_make_id_idx on public.models (make_id);

alter table public.models enable row level security;
create policy "models public-readable"
  on public.models for select
  to anon, authenticated using (true);

-- L3) configurations (FITL-03) — SHARED MASTER set (Day Cab, Sleeper, Flat-top,
-- Aerodyne, Extended, …), NOT per-model.
-- NOTE: this DIVERGES from ARCHITECTURE.md's `configurations.model_id` sketch. It is a
-- deliberate, decision-backed refinement (03-CONTEXT: "a shared standard set applied to
-- relevant models"): keeping configurations a canonical master means
-- search_term_targets.config_id points at ONE canonical config row, not a per-model
-- duplicate. Applicability (which configs apply to which model) lives in the
-- model_configurations join below. UNIQUE(name) → idempotent `on conflict (name)` seed.
create table public.configurations (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.configurations enable row level security;
create policy "configurations public-readable"
  on public.configurations for select
  to anon, authenticated using (true);

-- model_configurations — applicability join (which shared config applies to which model).
-- UNIQUE(model_id, configuration_id) enables `on conflict (model_id, configuration_id)` seeding.
create table public.model_configurations (
  id bigint generated always as identity primary key,
  model_id bigint not null references public.models(id) on delete cascade,
  configuration_id bigint not null references public.configurations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (model_id, configuration_id)
);
create index model_configurations_model_id_idx on public.model_configurations (model_id);
create index model_configurations_configuration_id_idx on public.model_configurations (configuration_id);

alter table public.model_configurations enable row level security;
create policy "model_configurations public-readable"
  on public.model_configurations for select
  to anon, authenticated using (true);
