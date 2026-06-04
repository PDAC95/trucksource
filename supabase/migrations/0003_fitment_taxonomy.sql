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

-- ===========================================================================
-- L4) Slang link: search_terms + search_term_targets (polymorphic exclusive arc)
-- ===========================================================================

-- search_terms (FITL-04) — the canonical trucker-slang / common-search term
-- ('359 Guys', 'Aerodyne', 'Large Car'). `citext` (enabled in 0001) gives
-- case-insensitive uniqueness so 'aerodyne' and 'Aerodyne' collide. UNIQUE on term
-- enables `on conflict (term)` seeding.
create table public.search_terms (
  id bigint generated always as identity primary key,
  term citext not null unique,
  created_at timestamptz not null default now()
);

alter table public.search_terms enable row level security;
create policy "search_terms public-readable"
  on public.search_terms for select
  to anon, authenticated using (true);

-- search_term_targets (FITL-04) — the load-bearing polymorphic M2M link (RESEARCH
-- Pattern 2). A slang term resolves to EXACTLY ONE real entity: a make, a model, OR a
-- configuration. We model this as three NULLABLE FKs guarded by an exclusive-arc CHECK
-- (`num_nonnulls(...) = 1`). This is deliberately NOT a loose discriminator-plus-id
-- polymorphic pattern — that anti-pattern (RESEARCH Pitfall 1) cannot FK-enforce that the
-- target row exists, so slang could point at a deleted/nonexistent entity. Real FKs +
-- the CHECK guarantee every slang term resolves to one existing, real entity.
create table public.search_term_targets (
  id bigint generated always as identity primary key,
  search_term_id bigint not null references public.search_terms(id) on delete cascade,
  make_id bigint references public.makes(id) on delete cascade,
  model_id bigint references public.models(id) on delete cascade,
  config_id bigint references public.configurations(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint exactly_one_target check (num_nonnulls(make_id, model_id, config_id) = 1)
);
-- Idempotent seed key: a given (term → entity) link is unique. coalesce(...,0) folds the
-- two NULL arms so the unique index spans the active target regardless of which arm is set.
create unique index search_term_targets_uniq
  on public.search_term_targets (search_term_id, coalesce(make_id,0), coalesce(model_id,0), coalesce(config_id,0));

alter table public.search_term_targets enable row level security;
create policy "search_term_targets public-readable"
  on public.search_term_targets for select
  to anon, authenticated using (true);

-- ===========================================================================
-- Flat dimensions L5–L8
-- ===========================================================================

-- L5) part_categories (FITL-05) — self-referencing adjacency tree. parent_id NULL = a
-- root category; `on delete restrict` prevents orphaning children by deleting a parent.
-- UNIQUE(parent_id, name) makes name unique within a parent and supports on-conflict seeding.
create table public.part_categories (
  id bigint generated always as identity primary key,
  parent_id bigint references public.part_categories(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  unique (parent_id, name)
);
create index part_categories_parent_id_idx on public.part_categories (parent_id);

alter table public.part_categories enable row level security;
create policy "part_categories public-readable"
  on public.part_categories for select
  to anon, authenticated using (true);

-- L6) materials (FITL-06) — flat dimension. sort_order drives display order; UNIQUE(name)
-- for on-conflict seeding.
create table public.materials (
  id bigint generated always as identity primary key,
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.materials enable row level security;
create policy "materials public-readable"
  on public.materials for select
  to anon, authenticated using (true);

-- L7) conditions (FITL-07) — same shape as materials.
create table public.conditions (
  id bigint generated always as identity primary key,
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.conditions enable row level security;
create policy "conditions public-readable"
  on public.conditions for select
  to anon, authenticated using (true);

-- L8) special_filters (FITL-08) — same shape as materials/conditions.
create table public.special_filters (
  id bigint generated always as identity primary key,
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.special_filters enable row level security;
create policy "special_filters public-readable"
  on public.special_filters for select
  to anon, authenticated using (true);
