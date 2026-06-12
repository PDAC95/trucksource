# Phase 3: Fitment Taxonomy & Slang Library - Research

**Researched:** 2026-06-04
**Domain:** Postgres relational data modeling (8-level fitment taxonomy + polymorphic slang synonym library) on Supabase, RLS, versioned migrations + `seed.sql`, seed-integrity testing
**Confidence:** HIGH (table design, RLS pattern, seed mechanism, and polymorphic-FK pattern all verified against the existing repo migrations + Supabase/Postgres docs; only domain breadth of the seed dataset itself is MEDIUM and gated by user review)

## Summary

Phase 3 is a **pure database phase**: reference tables + join-table shapes + RLS + `supabase/seed.sql` + a seed-integrity check. No TypeScript, no UI, no search logic, no `listings` table. The schema is the product's quality ceiling, so correctness here gates everything downstream (search precision in Phase 7 is only as good as the slang→entity links seeded here).

The work splits cleanly into four concerns the planner can map to plans: (1) **the 8 reference tables** — hierarchical `makes → models → configurations` plus flat dimension tables `search_terms`, `part_categories` (self-referencing tree), `materials`, `conditions`, `special_filters`; (2) **the polymorphic many-to-many slang link** — a `search_term_targets` table using the Postgres **exclusive-arc pattern** (nullable `make_id`/`model_id`/`config_id` FKs + a `num_nonnulls(...) = 1` CHECK) so every slang term resolves to a *real, FK-enforced* entity at exactly one level; (3) **the listing↔fitment join tables** — designed now (shape locked) but **not created until Phase 5**, because they FK to the not-yet-existent `listings` table; (4) **`seed.sql` + an integrity check** proving valid FKs, no orphans, and every slang term resolving.

The repo already establishes every convention this phase needs: sequential `NNNN_name.sql` migrations with RLS enabled in the same file (default-deny), `(select auth.uid())`-style policies, `security definer set search_path = ''` functions granted to `anon, authenticated`, and a Vitest integration suite that hits Supabase Staging with the anon key to prove RLS. Phase 3 follows all of them. The one new convention is `supabase/seed.sql` (does not yet exist) — Supabase CLI auto-runs it after migrations on `db reset`/`start`.

**Primary recommendation:** One migration `0003_fitment_taxonomy.sql` creates the 8 reference tables + the `search_term_targets` exclusive-arc link, all with RLS enabled in the same file (public `anon, authenticated` SELECT; **no** INSERT/UPDATE/DELETE policy → writes are service-role-only by default-deny). Author `supabase/seed.sql` (idempotent, FK-ordered) for Peterbilt + Kenworth. Add the listing↔fitment join-table shapes as a documented spec the Phase 5 plan consumes (do **not** ship them as SQL in Phase 3). Use `pg_trgm` (already enabled) for typo tolerance in Phase 7 — do **not** seed explicit typo rows. Prove correctness with anon-RLS integration tests + a SQL/script seed-integrity assertion.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Seed scope (launch breadth)**
- **Makes:** Two only — **Peterbilt + Kenworth**. Other makes deferred to post-launch.
- **Models:** Iconic/popular per make (~5–15 each) — the ones buyers search (W900, 379, 389, T800). Not the full historical catalog.
- **Configurations (L3):** A **shared standard set** (Day Cab, Sleeper, Flat-top, Aerodyne, Extended, etc.) applied to relevant models — not researched per-model.
- **Levels L5–L8:** Claude's discretion on depth — define a sensible, domain-grounded set (materials/conditions are bounded lists; categories a sensible tree).
- **Slang dictionary:** **High-value curated set, ~20–40 terms** ('359 Guys', 'Flat Glass Kenworth', 'Aerodyne', 'Large Car', 'Glider', etc.). Quality over quantity.

**Slang modeling (L4)**
- **Resolution:** Each slang term **maps to real entities** (make/model/config). Structural, not just fuzzy text.
- **Cardinality:** **Many-to-many.** One term → N entities; one entity → N terms.
- **Level mapping:** **Polymorphic by level.** A term may resolve to a make, a model, OR a config. The link record records which level/entity it points to.
- **Data-driven invariant (LOCKED):** Slang is **100% data-driven** — zero terms hardcoded in queries. Adding a row must be enough to make a new slang term work in search. (CLAUDE.md §7.)
- **Spelling variants / typos** ('Areodyne', 'flatglass'): **Claude's discretion** — store explicit variants in Phase 3, or rely on `pg_trgm` in Phase 7.

**The Barnyard**
- **Model:** **Boolean flag `is_barnyard` on the listing** (not a sentinel category row).
- **Coexistence:** A Barnyard listing **may still carry normal fitment tags** but is never required to. Barnyard means "don't force me to tag," not "tagging forbidden."
- **Phase 3 deliverable:** **Data model only.** The `is_barnyard` column lives on `listings` (created in Phase 5). Phase 3 must define **how Barnyard fits the reference-data model and the taxonomy/seed**, NOT the listings table itself.

**Data source & maintenance**
- **Seed origin:** AI-generated + user review. Claude generates the dataset; user reviews/corrects before finalizing into `seed.sql`.
- **Seed delivery:** Versioned in **`supabase/seed.sql`**, reproducible across environments. Not buried in a schema migration.
- **Post-launch growth:** Via migration/seed edits by developer/admin. No admin UI in Phase 3 (that's Phase 10).
- **Seed integrity test (REQUIRED):** Verify seed loads clean — valid FKs, no orphans, **every slang term resolves to entities that actually exist.**

**Cross-cutting gate (from ROADMAP)**
- All new reference + join tables: **RLS enabled default-deny in the same migration that creates them.** Public reference reads allowed; writes restricted (admin/service-role). Re-verify the RLS gate this phase.

### Claude's Discretion
- Exact depth/shape of **L5 Part Categories** (top-level + subcategory tree), **L6 Materials**, **L7 Conditions**, **L8 Special Filters**.
- Whether to store **explicit slang variants/typos** in Phase 3 or defer to `pg_trgm` in Phase 7.
- Whether to tag/categorize slang terms by type (model-slang / config-slang / brand-slang) — optional, not required.
- Whether `listing_makes` is a real join table or derived via `models.make_id` (ARCHITECTURE.md leaves this open).
- Exact mechanism of the seed integrity check (SQL assertions, suite test, or verification script).

### Deferred Ideas (OUT OF SCOPE)
- Additional makes (Freightliner, Western Star, Volvo, Mack, International, Hino, etc.) — post-launch via seed/migration; schema already supports them.
- Admin UI to manage fitment/slang — Phase 10.
- Slang term type/categorization for ranking — optional future enhancement; only if it earns its keep in Phase 7.
- External dataset import (ACES/PIES) — declined for v1.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FITL-01 | Make as Level 1 | `makes` table. Seed Peterbilt + Kenworth only; schema scales to all NA makes (just add rows). |
| FITL-02 | Model as Level 2, scoped under each Make | `models` table with `make_id` FK (not null). Composite uniqueness `(make_id, name)`. |
| FITL-03 | Configuration as Level 3 | `configurations` table. **Decision needed** (see Open Q1): shared-set master table + per-model applicability join vs. per-model rows. Recommend a `configurations` master + `model_configurations` join to honor the "shared standard set applied to relevant models" decision. |
| FITL-04 | Common Search Terms / trucker slang as Level 4 | `search_terms` table (the canonical term) + `search_term_targets` polymorphic exclusive-arc link to make/model/config. M2M, data-driven, FK-enforced. |
| FITL-05 | Part Categories as Level 5 | `part_categories` table, self-referencing `parent_id` (adjacency-list tree). |
| FITL-06 | Materials as Level 6 | `materials` table (flat bounded list). |
| FITL-07 | Condition as Level 7 | `conditions` table (flat bounded list; New, NOS, New Take-Off, Like New, Used, Refurbished, Damaged, Core). |
| FITL-08 | Special Search Filters as Level 8 | `special_filters` table (flat list; Wide/Narrow Hood, Flat/Curved Glass, Heavy Haul, Universal Fit, etc.). |
| FITL-09 | "The Barnyard" anything-goes category | **Data model only.** `is_barnyard boolean` on `listings` (Phase 5). Phase 3 documents the design + accounts for it in seed (no sentinel row). No taxonomy table needed for Barnyard. |
| FITL-10 | A single part → many trucks/configs/terms/categories (M2M) | Listing↔fitment join-table **shapes designed now** (one join table per dimension), **created in Phase 5** with the `listings` table. Phase 3 delivers the locked spec, not the SQL. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL | 17 (Supabase-managed) | Relational store for the taxonomy + slang links | Already the project DB; native FKs + CHECK + `num_nonnulls` give the polymorphic integrity this phase requires. |
| Supabase CLI | `2.x` (devDep) | Migrations + `seed.sql` execution | Already used for `0001`/`0002`. `seed.sql` auto-runs after migrations on `db reset`/`start`. |
| `pg_trgm` | built-in (enabled in `0001`) | Trigram fuzzy/typo matching | Already enabled. Used in Phase 7 — Phase 3 only needs to **not** hand-roll typo rows. |
| `unaccent` | built-in (enabled in `0001`) | Accent-insensitive search | Already enabled. Phase 7 concern; no Phase 3 action. |
| `citext` | built-in (enabled in `0001`) | Case-insensitive text | Available if a reference name/term needs case-insensitive uniqueness (e.g. `search_terms.term`). |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | `4.1.x` (devDep) | Integration tests vs Supabase Staging (anon key) | RLS gate + seed-resolution assertions, mirroring `tests/integration/rls.test.ts`. |
| `@supabase/supabase-js` | `2.106.x` | Anon client in integration tests | Already the test client (`tests/integration/_supabase.ts`). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Exclusive-arc (nullable FKs + CHECK) for slang→entity | `target_type text` + `target_id uuid` (Rails-style polymorphic) | The `target_type/target_id` form **cannot have a real FK** → no DB-enforced "term resolves to a real entity," which is exactly the locked seed-integrity requirement. Reject it. (See Pattern 2.) |
| Adjacency-list `parent_id` for `part_categories` | `ltree` / closure table | Overkill for a small admin-curated 2-level category tree; adjacency list is simplest and the tree is read-mostly + shallow. `ltree` only earns its keep with deep dynamic hierarchies + frequent subtree queries (a Phase 7+ concern if ever). |
| `bigint generated always as identity` PKs | `uuid` PKs | Reference data is small, server/admin-managed, and never exposed by ID to anon clients in a guessable-sensitive way. `bigint identity` (as used by `otp_send_attempts` in `0002`) is fine and keeps seed files readable. Either is defensible; pick one and be consistent. |

**Installation:** None. All extensions already enabled in `0001`. No new npm packages.

## Architecture Patterns

### Recommended Project Structure (files this phase touches)
```
supabase/
├── migrations/
│   ├── 0001_foundation_privacy.sql   # exists
│   ├── 0002_verification.sql         # exists
│   └── 0003_fitment_taxonomy.sql     # NEW — 8 reference tables + slang link + RLS
└── seed.sql                          # NEW — Peterbilt+KW taxonomy + slang seed (idempotent)

tests/integration/
└── fitment.test.ts                   # NEW — anon-RLS gate + seed-resolution assertions

.planning/phases/05-.../              # (downstream) listing↔fitment join-table spec consumed here
```

> **Naming:** Follow the existing convention exactly — zero-padded `0003_` prefix, snake_case, descriptive suffix. Lowercase SQL keywords (the repo uses `create table`, `alter table ... enable row level security`, `create policy`).

### Pattern 1: Reference table with public-read / service-role-write RLS
**What:** Every reference table gets RLS enabled in the same migration. A single `anon, authenticated` SELECT policy makes it world-readable; **omitting** INSERT/UPDATE/DELETE policies makes writes impossible for both keys → only the service-role (which bypasses RLS) can seed/edit. This is the exact default-deny posture `0002` uses for service-role-only tables, inverted to add a public read.

**When to use:** All 8 reference tables + `search_term_targets` + (in Phase 5) the listing↔fitment join tables.

**Example:**
```sql
-- Source: pattern verified against repo 0001 (public read) + 0002 (write-deny by no policy)
create table public.makes (
  id bigint generated always as identity primary key,
  name text not null unique,           -- 'Peterbilt', 'Kenworth'
  created_at timestamptz not null default now()
);

alter table public.makes enable row level security;

-- Public read: anyone can browse the taxonomy.
create policy "fitment reference is public-readable"
  on public.makes for select
  to anon, authenticated using (true);

-- NO insert/update/delete policy → writes are service-role-only (default-deny).
-- Seeding happens via seed.sql (service-role/superuser context), not via the anon key.
```

> **Why no write policy is correct (not an oversight):** the CONTEXT decision is "writes restricted (admin/service-role only)" and "no admin UI in Phase 3." With no write policy, `anon`/`authenticated` writes are denied by RLS; the service-role bypasses RLS for seeding and future admin edits. This mirrors `otp_send_attempts`/`abuse_events` in `0002` ("Intentionally NO policies: service-role-only").

### Pattern 2: Polymorphic slang→entity link via exclusive arc (the load-bearing decision)
**What:** Model the M2M, polymorphic-by-level slang link as a join table where the *target* is one of three nullable FK columns, with a CHECK that **exactly one** is set. This gives real, DB-enforced FK integrity to each of make/model/config simultaneously — so "every slang term resolves to a real entity" is guaranteed by the schema, not by a test alone.

**When to use:** `search_term_targets` (FITL-04). This is the single most important schema choice in the phase.

**Example:**
```sql
-- Source: exclusive-arc pattern (PostgreSQL num_nonnulls) — Cybertec / Hashrocket (see Sources)
create table public.search_terms (
  id bigint generated always as identity primary key,
  term citext not null unique,          -- '359 Guys', 'Aerodyne', 'Large Car'
  created_at timestamptz not null default now()
);

create table public.search_term_targets (
  id bigint generated always as identity primary key,
  search_term_id bigint not null references public.search_terms(id) on delete cascade,
  -- exactly ONE of the next three is non-null (polymorphic by level):
  make_id   bigint references public.makes(id)          on delete cascade,
  model_id  bigint references public.models(id)         on delete cascade,
  config_id bigint references public.configurations(id) on delete cascade,
  constraint exactly_one_target
    check (num_nonnulls(make_id, model_id, config_id) = 1)
);

-- M2M is inherent: many rows per search_term_id, many per target. Add a uniqueness
-- guard so the same (term → entity) link can't be seeded twice (helps idempotency):
create unique index search_term_targets_uniq
  on public.search_term_targets (search_term_id,
       coalesce(make_id,0), coalesce(model_id,0), coalesce(config_id,0));
```

**Why exclusive arc over `target_type`+`target_id`:** the alternative stores the level as a string and the id as a bare `uuid`/`bigint` with **no foreign key** — Postgres cannot enforce that `target_id` points at a row that exists, so a typo'd seed row produces a silently dangling slang term (exactly the failure CONTEXT says must be impossible). The exclusive arc keeps three real FKs, so a bad reference fails at seed time. `num_nonnulls(...) = 1` enforces the "exactly one level" polymorphism. (Confirmed across multiple Postgres sources — see Sources.)

### Pattern 3: Configurations as a shared master + per-model applicability
**What:** The CONTEXT decision is "a **shared standard set** of configurations applied to relevant models." Two faithful encodings:
- (Recommended) **`configurations` master** (the shared set, e.g. Day Cab, Sleeper, Flat-top, Aerodyne, Extended) + a **`model_configurations` join** `(model_id, configuration_id)` marking which configs apply to which models. Avoids duplicating "Day Cab" per model; supports "all relevant models share this config."
- (Simpler, more denormalized) `configurations` rows each carrying a `model_id` FK (config belongs to one model). Faithful to ARCHITECTURE.md's literal sketch (`configurations.model_id`) but duplicates the shared set across models and makes "shared standard set" awkward.

**Recommendation:** master + `model_configurations` join. It matches the "shared set applied to relevant models" wording, keeps `search_term_targets.config_id` pointing at a single canonical config row (so 'Aerodyne' slang → one config, not N per-model duplicates), and scales cleanly. Note this **diverges from ARCHITECTURE.md's `configurations.model_id` sketch** — surface this to the user as a deliberate, decision-backed refinement.

> **Trade-off to flag in the plan:** the master+join approach means the listing↔config join (Phase 5) tags a listing with a canonical `configuration_id`; the planner should confirm the Phase 5 join references `configurations.id`, not a per-model config.

### Pattern 4: Listing↔fitment join tables — designed now, created in Phase 5
**What:** One join table per multi-valued dimension, each `(listing_id, <dim>_id)` composite PK, each with RLS. These FK to `listings`, which does not exist until Phase 5 — so **Phase 3 produces the locked spec, Phase 5 ships the SQL.** Locking the shape now satisfies FITL-10's design intent and de-risks Phase 5.

**Locked shapes (spec for the Phase 5 planner):**
```
listing_models           (listing_id FK, model_id FK)            PK(listing_id, model_id)
listing_configs          (listing_id FK, configuration_id FK)    PK(listing_id, configuration_id)
listing_search_terms     (listing_id FK, search_term_id FK)      PK(listing_id, search_term_id)
listing_categories       (listing_id FK, category_id FK)         PK(listing_id, category_id)
listing_materials        (listing_id FK, material_id FK)         PK(listing_id, material_id)
listing_conditions       (listing_id FK, condition_id FK)        PK(listing_id, condition_id)
listing_special_filters  (listing_id FK, special_filter_id FK)   PK(listing_id, special_filter_id)
```
- **`listing_makes`:** NOT a real table. Make is derivable via `listing_models → models.make_id`. (CONTEXT + ARCHITECTURE both allow deriving; only denormalize in Phase 7 if EXPLAIN proves it's a bottleneck.)
- **Index every FK column** (composite PK covers the leading column; add a secondary index on the trailing `<dim>_id` for reverse lookups — Phase 5/7 detail, noted now).
- RLS on each: public SELECT (a listing's fitment is public); writes scoped to the listing owner (`exists (select 1 from listings where id = listing_id and seller_id = (select auth.uid()))`) — a Phase 5 concern; documented so it isn't forgotten.

### Pattern 5: Idempotent, FK-ordered `seed.sql`
**What:** `seed.sql` runs after migrations on `db reset`/`start` (CLI). It must (a) insert parents before children (makes → models → configurations → model_configurations → search_terms → search_term_targets; the flat L5–L8 tables in any order), and (b) be re-runnable without duplicate-key errors.

**When to use:** The entire taxonomy + slang seed.

**Example (idempotency idioms):**
```sql
-- Source: Supabase seeding docs (seed.sql auto-runs after migrations) + standard upsert idioms
-- Parents first.
insert into public.makes (name) values ('Peterbilt'), ('Kenworth')
  on conflict (name) do nothing;

-- Children resolve parent by natural key (name) — never hardcode generated ids.
insert into public.models (make_id, name)
select m.id, v.name
from (values ('Peterbilt','379'), ('Peterbilt','389'), ('Kenworth','W900')) as v(make, name)
join public.makes m on m.name = v.make
on conflict (make_id, name) do nothing;

-- Slang link resolves BOTH the term and the target by natural key, then arc-inserts.
insert into public.search_term_targets (search_term_id, model_id)
select st.id, mo.id
from public.search_terms st
join public.models mo on mo.name = '359'        -- example resolution
join public.makes mk on mk.id = mo.make_id and mk.name = 'Peterbilt'
where st.term = '359 Guys'
on conflict do nothing;
```
> **Idempotency requires the right `on conflict` targets:** every table that seed.sql touches needs the unique constraint the `on conflict` clause names (`makes.name`, `models(make_id,name)`, `search_terms.term`, the `search_term_targets_uniq` index). Author those constraints in `0003` so the seed can be idempotent.

> **Reproducibility across environments:** resolve all FKs by **natural key lookups inside the insert** (as above), never by literal generated ids — ids differ between a fresh local reset and Staging. This is the single most common seed-portability bug.

### Anti-Patterns to Avoid
- **`target_type` + `target_id` (no FK) for the slang link** — dangling terms become possible; defeats the seed-integrity requirement. Use the exclusive arc.
- **Hardcoding any slang term in a query or in app code** — CLAUDE.md §7 + CONTEXT locked invariant. Slang lives only in `search_terms`/`search_term_targets`. (No app code ships this phase, but the schema must make data-driven the *only* path.)
- **Seeding explicit typo rows** ('Areodyne', 'flatglass') in Phase 3 — see Open Q2; recommendation is to rely on `pg_trgm` in Phase 7, not to pollute the curated dictionary with misspellings.
- **A sentinel "Barnyard" category row** — CONTEXT chose a boolean flag on `listings`. No taxonomy row.
- **Putting seed data in the migration** — CONTEXT requires `seed.sql`. The migration is schema only; data goes in `seed.sql`.
- **`USING (true)` write policies** — never. Writes get *no* policy (service-role-only), reads get `using (true)` for SELECT only.
- **Literal generated ids in seed FKs** — breaks cross-environment reproducibility.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Exactly one polymorphic target" | App-level validation / triggers | `check (num_nonnulls(...) = 1)` | Native, atomic, can't be bypassed by any client or seed path. |
| "Slang term resolves to a real entity" | A nightly job / app check | Real FKs (exclusive arc) | The FK *is* the guarantee; the integrity test becomes a thin double-check, not the primary defense. |
| Typo/spelling tolerance | Seeding misspelling rows by hand | `pg_trgm` similarity (Phase 7) | Already enabled; covers unbounded misspellings the hand list never could. |
| Category hierarchy queries | Custom recursion now | `parent_id` adjacency list (+ recursive CTE later if needed) | Tree is shallow + admin-curated; no dynamic deep-subtree querying in v1. |
| Seed idempotency | Custom "delete then insert" scripts | `on conflict ... do nothing` + natural-key resolution | Re-runnable, order-stable, environment-portable. |
| RLS write restriction | A "is_admin" check in policies | No write policy at all (service-role bypass) | Matches `0002` precedent; simplest correct default-deny; admin UI is Phase 10. |

**Key insight:** The phase's hardest requirement ("every slang term resolves") is best solved by *schema*, not by *testing*. Choose the exclusive arc and the database makes the bad state unrepresentable; the integrity test then only guards the things FKs can't (e.g. a make/model with zero slang or an empty seed).

## Common Pitfalls

### Pitfall 1: Choosing `target_type/target_id` and discovering slang can dangle
**What goes wrong:** A `varchar target_type` + bare `target_id` link compiles and "works," but a mistyped or stale `target_id` in `seed.sql` creates a slang term pointing at nothing. Search (Phase 7) then silently returns no/wrong results for that term — the exact precision failure PITFALLS #7 warns about, surfacing two phases later.
**Why it happens:** It's the most-Googled "polymorphic association" pattern (Rails default) and feels flexible.
**How to avoid:** Exclusive arc with three real FKs + `num_nonnulls = 1`. Reject `target_type/target_id`.
**Warning signs:** Any `text`/`varchar` column named `*_type` paired with an id column that has no `references`.

### Pitfall 2: `seed.sql` not idempotent / not portable across environments
**What goes wrong:** Seed uses literal ids or bare `insert` without `on conflict`; second `db reset` or applying to Staging throws duplicate-key errors or links to wrong rows.
**Why it happens:** Local fresh reset and Staging have different generated ids; `insert` isn't re-runnable by default.
**How to avoid:** Natural-key FK resolution inside every insert + `on conflict do nothing` against real unique constraints authored in `0003`. (Pattern 5.)
**Warning signs:** Numeric literals in FK columns of `seed.sql`; a re-run that errors; constraints the `on conflict` clause references not existing.

### Pitfall 3: RLS forgotten on a new reference/join table (CVE-2025-48757 class)
**What goes wrong:** A table created without `enable row level security` is wide-open to the public anon key (read AND write). PITFALLS #2.
**Why it happens:** RLS is opt-in per table; easy to miss one of ~9 new tables.
**How to avoid:** Make `alter table ... enable row level security;` part of the definition-of-done for every `create table` in `0003`. Add a CI/integration assertion that every `public` table has RLS on (the repo already tests this shape per-table in `rls.test.ts`).
**Warning signs:** A `create table` in `0003` without an adjacent `enable row level security`; Supabase dashboard "Unrestricted" badge.

### Pitfall 4: Accidentally adding a write policy "for convenience"
**What goes wrong:** Adding an `authenticated` INSERT/UPDATE policy to reference tables lets any logged-in user mutate the shared taxonomy.
**Why it happens:** Wanting the seed or a future admin to "just work" through the anon/authenticated client.
**How to avoid:** Reference tables get SELECT-only policies. Seeding uses service-role (`seed.sql` context bypasses RLS). Admin edits are Phase 10 via service-role.
**Warning signs:** Any `for insert`/`for update`/`for delete` policy on a fitment reference table in `0003`.

### Pitfall 5: Diverging from ARCHITECTURE.md silently
**What goes wrong:** ARCHITECTURE.md sketches `configurations.model_id` and a "Barnyard = sentinel category / boolean" either-or. This research recommends a `configurations` master + `model_configurations` join, and CONTEXT locked Barnyard as a boolean. Shipping the refinement without flagging it makes the docs inconsistent.
**How to avoid:** The plan should note these as deliberate, decision-backed refinements (CLAUDE.md: "When user requests conflict with [planning docs], surface the conflict"). Update ARCHITECTURE.md's fitment section or note the divergence in the plan.
**Warning signs:** A reviewer asking "why doesn't this match ARCHITECTURE.md?"

## Code Examples

### Self-referencing category tree (FITL-05)
```sql
-- Source: standard adjacency-list (Postgres); shallow admin-curated tree
create table public.part_categories (
  id bigint generated always as identity primary key,
  parent_id bigint references public.part_categories(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  unique (parent_id, name)   -- name unique within a parent; supports on-conflict seeding
);
alter table public.part_categories enable row level security;
create policy "categories public-readable"
  on public.part_categories for select to anon, authenticated using (true);
```

### Flat bounded dimension (FITL-06/07/08 share this shape)
```sql
create table public.conditions (
  id bigint generated always as identity primary key,
  name text not null unique,    -- New, NOS, New Take-Off, Like New, Used, Refurbished, Damaged, Core
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.conditions enable row level security;
create policy "conditions public-readable"
  on public.conditions for select to anon, authenticated using (true);
```

### Anon-RLS integration test (mirrors existing rls.test.ts)
```typescript
// tests/integration/fitment.test.ts — runs vs Staging with anon key; self-skips w/o env
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, anonClient } from "./_supabase";
const d = INTEGRATION_ENABLED ? describe : describe.skip;

d("fitment reference tables are anon-readable, anon-write-denied", () => {
  it("anon can read makes (seeded)", async () => {
    const { data, error } = await anonClient().from("makes").select("name");
    expect(error).toBeNull();
    expect((data ?? []).map((r) => r.name)).toEqual(
      expect.arrayContaining(["Peterbilt", "Kenworth"]),
    );
  });
  it("anon INSERT into makes is denied (no write policy)", async () => {
    const { error } = await anonClient().from("makes").insert({ name: "Hacker" });
    expect(error).not.toBeNull(); // RLS blocks the write
  });
});
```

### Seed-integrity assertion (every slang term resolves) — SQL form
```sql
-- Source: standard assertion idiom. The exclusive-arc FKs already prevent dangling
-- targets at insert time; this catches the orthogonal case "a search_term with NO target".
do $$
declare orphan_terms int;
begin
  select count(*) into orphan_terms
  from public.search_terms st
  where not exists (
    select 1 from public.search_term_targets t where t.search_term_id = st.id
  );
  if orphan_terms > 0 then
    raise exception 'Seed integrity: % slang term(s) resolve to no entity', orphan_terms;
  end if;
end $$;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Rails-style `target_type`+`target_id` polymorphic | Postgres exclusive arc (`num_nonnulls` CHECK + real FKs) | `num_nonnulls` since PG 9.6; current best practice | DB-enforced referential integrity for polymorphic links — directly serves the seed-integrity requirement. |
| `LIKE '%term%'` for slang/typos | Curated synonym table (Phase 3) + `pg_trgm` (Phase 7) | Established | No seq scans; typo tolerance without hand-listing misspellings. |
| Seed data inside migrations | Dedicated `supabase/seed.sql` auto-run after migrations | Supabase CLI (2023+) | Reproducible, separates schema from data per CONTEXT. |

**Deprecated/outdated:**
- Storing the slang dictionary in app code / query strings — forbidden by CLAUDE.md §7 and the CONTEXT data-driven invariant.

## Open Questions

1. **Configurations: master+join vs `configurations.model_id`?**
   - What we know: CONTEXT says "shared standard set applied to relevant models"; ARCHITECTURE.md sketches `configurations.model_id`.
   - What's unclear: whether the user prefers strict adherence to the ARCHITECTURE sketch or the cleaner shared-master model.
   - Recommendation: **master `configurations` + `model_configurations` join** (Pattern 3). Faithful to the "shared set" decision; keeps `search_term_targets.config_id` canonical. Flag the divergence from ARCHITECTURE.md in the plan for user sign-off.

2. **Store explicit slang typo/variant rows in Phase 3, or defer to `pg_trgm`?**
   - What we know: `pg_trgm` is enabled; search is Phase 7; CONTEXT leaves this to Claude's discretion.
   - What's unclear: nothing blocking.
   - Recommendation: **Defer to `pg_trgm`.** Keep `search_terms` a clean canonical dictionary (real terms only). Misspellings are unbounded and better handled by trigram similarity at query time than by an ever-growing hand list. (If a *deliberate* alternate spelling is itself a "real" term truckers type, seed it as a normal `search_terms` row pointing at the same entity — the M2M arc supports that.)

3. **PK type: `bigint identity` vs `uuid` for reference tables?**
   - What we know: `0001` uses `uuid` (tied to `auth.users`); `0002` uses `bigint identity` for `otp_send_attempts`.
   - Recommendation: **`bigint generated always as identity`** for reference + slang tables — small admin-managed data, readable seed files, no need for unguessable ids. Be consistent across all Phase 3 tables. (Either is defensible; this is low-stakes.)

4. **Seed-integrity check mechanism: SQL `do $$` block, Vitest integration test, or standalone script?**
   - What we know: CONTEXT leaves the mechanism to Claude's discretion; the repo already has a Vitest integration suite hitting Staging.
   - Recommendation: **Both, layered** — (a) FKs + `num_nonnulls` CHECK make dangling targets impossible at insert (primary defense); (b) a Vitest integration test (`fitment.test.ts`) asserts the public-read/anon-write-deny RLS gate AND that every seeded slang term resolves + Peterbilt/KW + expected models exist (catches "empty seed" / "term with no target"). A `do $$` assertion block can optionally live at the end of `seed.sql` for a fail-fast on `db reset`. The Vitest test is the CI-visible gate consistent with Phases 1–2.

## Validation Architecture

> `.planning/config.json` has no `nyquist_validation` key but sets `workflow.verifier: true`, and Phases 1–2 established a Vitest integration suite as the verification gate. This section maps Phase 3 to that existing infrastructure.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `4.1.x` (+ `@supabase/supabase-js` anon client) |
| Config file | `vitest.config.mts` (already includes `tests/integration/**`) |
| Quick run command | `npm test -- tests/integration/fitment.test.ts` |
| Full suite command | `npm test` |
| Env requirement | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`; suite self-skips if absent (see `_supabase.ts` `INTEGRATION_ENABLED`) |

> **Important environment note:** Integration tests run against **Supabase Staging** (the project points all envs at Staging until launch — see MEMORY). For these tests to pass, `0003_fitment_taxonomy.sql` must be applied to Staging AND `seed.sql` data must be present in Staging. `seed.sql` auto-runs only on local `db reset`/`start`; **applying the seed to Staging is a deliberate step the plan must include** (e.g. run the seed SQL against Staging, or document it as a deploy step). Flag this — it's the same "migration applied to Staging" cadence Phases 1–2 used.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FITL-01 | `makes` exists, anon-readable, seeded Peterbilt+KW | integration | `npm test -- tests/integration/fitment.test.ts` | ❌ Wave 0 |
| FITL-02 | `models` scoped by `make_id`; seeded models exist | integration | same | ❌ Wave 0 |
| FITL-03 | `configurations` (+ `model_configurations`) seeded + readable | integration | same | ❌ Wave 0 |
| FITL-04 | `search_terms` + `search_term_targets`; every term resolves; arc CHECK holds | integration + SQL CHECK | same (+ `num_nonnulls` CHECK in migration) | ❌ Wave 0 |
| FITL-05 | `part_categories` tree readable | integration | same | ❌ Wave 0 |
| FITL-06 | `materials` seeded + readable | integration | same | ❌ Wave 0 |
| FITL-07 | `conditions` seeded + readable | integration | same | ❌ Wave 0 |
| FITL-08 | `special_filters` seeded + readable | integration | same | ❌ Wave 0 |
| FITL-09 | Barnyard = boolean on `listings` (Phase 5); no sentinel row this phase | manual/doc | N/A (design assertion in PLAN; verified Phase 5) | N/A |
| FITL-10 | Listing↔fitment join-table shapes locked (created Phase 5) | manual/doc | N/A (spec reviewed; SQL gate is Phase 5) | N/A |
| Cross-cutting | RLS on every new table; anon write denied | integration | same (mirror `rls.test.ts`) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- tests/integration/fitment.test.ts` (fitment gate).
- **Per wave merge:** `npm test` (full suite — re-runs the existing privacy/RLS gates too, proving Phase 3 didn't regress them).
- **Phase gate:** Full suite green + seed applied to Staging before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/integration/fitment.test.ts` — covers FITL-01..08 + the RLS gate (does not exist).
- [ ] `supabase/seed.sql` — does not exist; must be created (idempotent, FK-ordered).
- [ ] No new shared fixtures needed — reuse `tests/integration/_supabase.ts` (`anonClient`, `INTEGRATION_ENABLED`).
- [ ] No framework install needed — Vitest + anon-client infra already in place.

## Sources

### Primary (HIGH confidence)
- Repo migrations `supabase/migrations/0001_foundation_privacy.sql`, `0002_verification.sql` — established conventions: sequential `NNNN_` naming, RLS-enabled-in-same-migration default-deny, public-read/`anon,authenticated` SELECT policy, service-role-only via no-policy, `bigint generated always as identity` PKs, `security definer set search_path=''` functions.
- Repo tests `tests/integration/rls.test.ts`, `_supabase.ts`, `vitest.config.mts`, `package.json` — verification infra (anon-client integration suite, self-skip pattern, `npm test`).
- Supabase docs — *Seeding your database* (`/supabase/supabase`, Context7): `seed.sql` auto-runs after migrations on `db reset`/`start`; `[db.seed] sql_paths` config; "only include data insertions in seed files."
- [PostgreSQL `num_nonnulls`](https://www.postgresql.org/docs/current/functions-comparison.html) — enforces exactly-one-of-N in a CHECK (exclusive arc).
- `.planning/research/ARCHITECTURE.md` (fitment taxonomy + join-table sketch), `.planning/research/PITFALLS.md` (#2 RLS, #7 fitment correctness, #1 PII), `.planning/research/STACK.md` (extensions, no external search engine).

### Secondary (MEDIUM confidence)
- [Cybertec — Conditional foreign keys and polymorphism in SQL: 4 Methods](https://www.cybertec-postgresql.com/en/conditional-foreign-keys-polymorphism-in-sql/) — exclusive arc with `num_nonnulls` recommended for polymorphic FKs.
- [Hashrocket — Modeling Polymorphic Associations in a Relational Database](https://hashrocket.com/blog/posts/modeling-polymorphic-associations-in-a-relational-database) — exclusive belongs-to (arc) preserves FK integrity; nulls are cheap in Postgres.

### Tertiary (LOW confidence)
- None requiring validation — all critical claims verified against repo conventions or Postgres/Supabase docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all extensions pre-enabled; conventions read directly from existing migrations.
- Architecture (table shapes, exclusive arc, RLS): HIGH — exclusive arc verified across multiple Postgres sources; RLS pattern is a direct inversion of the repo's existing service-role-only precedent.
- Seed mechanism: HIGH — Supabase `seed.sql` behavior confirmed via Context7; idempotency/portability idioms are standard.
- Seed dataset *breadth/accuracy* (which models, which slang→entity links): MEDIUM — AI-generated, explicitly gated by user review per CONTEXT before finalizing.
- Pitfalls: HIGH — drawn from the repo's own PITFALLS.md + verified polymorphic-FK failure mode.

**Research date:** 2026-06-04
**Valid until:** 2026-07-04 (stable domain; Postgres + Supabase CLI conventions are slow-moving)
