-- 0012_fitment_rules.sql
-- Phase 6 — Fitment Intelligence (data foundation).
-- Creates the THREE Phase-6 tables, EACH with RLS enabled in THIS migration
-- (CLAUDE.md invariant #2, default-deny). Mirrors 0003 (exclusive-arc reference
-- table) + 0006 (listing public-read / owner-write-via-EXISTS) verbatim:
-- lowercase SQL, `id bigint generated always as identity primary key`, the
-- num_nonnulls(...) = 1 exclusive-arc CHECK, the coalesce(...,0) unique-index trick
-- for idempotent seeding, and the (select auth.uid()) wrapper on owner policies.
--
-- WHAT THIS SHIPS:
--   1) fitment_rules — the FINT-01 rules backbone. A reference / inference table:
--      PUBLIC-READ, SEED/SERVICE-ROLE-WRITE only (NO write policy — exactly like every
--      Phase-3 taxonomy table). A rule is "(exactly one trigger) IMPLIES (exactly one
--      consequence)", modelled as an EXCLUSIVE ARC of REAL FKs (like search_term_targets
--      in 0003), NOT a `trigger_value text` discriminator (RESEARCH State-of-the-Art +
--      Anti-Patterns Pitfall 1 — a text discriminator cannot FK-enforce the target row
--      exists). The CONTEXT "primary trigger = Part Category" lives here as
--      trigger_category_id → implies_search_term_id rows; the garage→flat expansion
--      ("359 Guys", "Long Hood") is encoded as trigger_model_id → implies_search_term_id
--      rows in the SAME table (RESEARCH Pattern 1).
--   2) listing_categories — the FINT-03 "appears in every applicable part category"
--      persistence: a listing↔part_category join. PUBLIC-READ + OWNER-WRITE-via-EXISTS
--      on listings.seller_id (copied verbatim from listing_fitment in 0006).
--   3) listing_search_terms — the FINT-03 slang-tag landing zone: a listing↔search_term
--      join. Same posture as listing_categories.
--
-- DEFERRED (per the 06-CONTEXT scope lock — NOT created here):
--   - trigger_part_number_pattern (a regex/text part-number trigger arm) — v1 triggers are
--     real-entity FKs only; part-number-pattern inference is a documented future upgrade.
--   - listing_special_filters / listing_materials join tables — v1 has no listing join for
--     these dimensions. NOTE: special_filters CAN still be the consequence of a rule
--     (implies_special_filter_id arm below); it simply has no per-listing join table in v1.

-- ===========================================================================
-- fitment_rules (FINT-01) — public-read / seed-write inference rules.
-- Exclusive arc on BOTH sides: exactly one trigger arm + exactly one implies arm.
-- ===========================================================================
create table public.fitment_rules (
  id bigint generated always as identity primary key,
  -- TRIGGER arms (the antecedent — exactly one set; num_nonnulls CHECK below).
  -- CONTEXT names part category the PRIMARY trigger; model/config triggers carry the
  -- garage→flat expansion (a chosen model implies its slang term).
  trigger_category_id bigint references public.part_categories(id) on delete cascade,
  trigger_model_id bigint references public.models(id) on delete cascade,
  trigger_config_id bigint references public.configurations(id) on delete cascade,
  -- IMPLIES arms (the consequence — exactly one set).
  implies_model_id bigint references public.models(id) on delete cascade,
  implies_config_id bigint references public.configurations(id) on delete cascade,
  implies_category_id bigint references public.part_categories(id) on delete cascade,
  implies_search_term_id bigint references public.search_terms(id) on delete cascade,
  implies_special_filter_id bigint references public.special_filters(id) on delete cascade,
  -- Confidence (0..100). Sparse, high-precision seed defaults to 100 (CONTEXT/Pitfall 6).
  confidence smallint not null default 100,
  created_at timestamptz not null default now(),
  -- Exclusive-arc CHECKs (the 0003 search_term_targets idiom): exactly one arm per side.
  constraint exactly_one_trigger check (
    num_nonnulls(trigger_category_id, trigger_model_id, trigger_config_id) = 1
  ),
  constraint exactly_one_implies check (
    num_nonnulls(
      implies_model_id,
      implies_config_id,
      implies_category_id,
      implies_search_term_id,
      implies_special_filter_id
    ) = 1
  ),
  constraint confidence_range check (confidence between 0 and 100)
);
-- Trigger-side lookup indexes (the inference engine resolves rules BY trigger).
create index fitment_rules_trigger_category_idx on public.fitment_rules (trigger_category_id);
create index fitment_rules_trigger_model_idx on public.fitment_rules (trigger_model_id);
create index fitment_rules_trigger_config_idx on public.fitment_rules (trigger_config_id);
-- Idempotent-seed enabler: fold every NULL arm with coalesce(...,0) so a full
-- (trigger, implies) tuple is unique and 0013 can `on conflict do nothing` (the
-- repo's 0003/0006 coalesce(...,0) trick — a unique INDEX, since constraints can't
-- use expressions).
create unique index fitment_rules_uniq on public.fitment_rules (
  coalesce(trigger_category_id, 0),
  coalesce(trigger_model_id, 0),
  coalesce(trigger_config_id, 0),
  coalesce(implies_model_id, 0),
  coalesce(implies_config_id, 0),
  coalesce(implies_category_id, 0),
  coalesce(implies_search_term_id, 0),
  coalesce(implies_special_filter_id, 0)
);

alter table public.fitment_rules enable row level security;
-- PUBLIC-READ only. NO insert/update/delete policy → writes are seed/service-role only
-- (exactly like every Phase-3 reference table). Do NOT add a `using (true)` write
-- policy — an anon-writable rules table is a Pitfall-3 warning sign.
create policy "fitment_rules public-readable"
  on public.fitment_rules for select
  to anon, authenticated using (true);

-- ===========================================================================
-- listing_categories (FINT-03) — listing ↔ part_category join.
-- Public-read + owner-write-via-EXISTS (mirrors listing_fitment in 0006 verbatim).
-- ===========================================================================
create table public.listing_categories (
  id bigint generated always as identity primary key,
  listing_id bigint not null references public.listings(id) on delete cascade,
  category_id bigint not null references public.part_categories(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index listing_categories_listing_id_idx on public.listing_categories (listing_id);
create unique index listing_categories_uniq on public.listing_categories (listing_id, category_id);

alter table public.listing_categories enable row level security;

-- Read follows the listing (public). Writes only by the listing's owner — via EXISTS.
create policy "listing_categories public-read" on public.listing_categories for
select
  to anon,
  authenticated using (true);

create policy "listing_categories owner-write" on public.listing_categories for all to authenticated using (
  exists (
    select
      1
    from
      public.listings l
    where
      l.id = listing_id
      and l.seller_id = (select auth.uid())
  )
)
with
  check (
    exists (
      select
        1
      from
        public.listings l
      where
        l.id = listing_id
        and l.seller_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- listing_search_terms (FINT-03) — listing ↔ search_term join (slang tags).
-- Identical posture to listing_categories.
-- ===========================================================================
create table public.listing_search_terms (
  id bigint generated always as identity primary key,
  listing_id bigint not null references public.listings(id) on delete cascade,
  term_id bigint not null references public.search_terms(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index listing_search_terms_listing_id_idx on public.listing_search_terms (listing_id);
create unique index listing_search_terms_uniq on public.listing_search_terms (listing_id, term_id);

alter table public.listing_search_terms enable row level security;

create policy "listing_search_terms public-read" on public.listing_search_terms for
select
  to anon,
  authenticated using (true);

create policy "listing_search_terms owner-write" on public.listing_search_terms for all to authenticated using (
  exists (
    select
      1
    from
      public.listings l
    where
      l.id = listing_id
      and l.seller_id = (select auth.uid())
  )
)
with
  check (
    exists (
      select
        1
      from
        public.listings l
      where
        l.id = listing_id
        and l.seller_id = (select auth.uid())
    )
  );
