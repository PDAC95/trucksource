---
phase: 03-fitment-taxonomy-slang-library
plan: 01
subsystem: database
tags: [postgres, supabase, rls, fitment-taxonomy, citext, polymorphic-fk]

# Dependency graph
requires:
  - phase: 01-foundation-privacy-model
    provides: "citext extension, RLS-in-migration convention, anon/authenticated SELECT policy pattern"
provides:
  - "8-level fitment schema as reference tables (makes→models→configurations→search_terms / part_categories, materials, conditions, special_filters)"
  - "FK-enforced slang link: search_term_targets exclusive arc resolving every term to exactly one make OR model OR config"
  - "model_configurations applicability join (shared-config master applied to relevant models)"
  - "All 10 tables anon-readable, write-locked to service-role, applied to Staging"
affects: [03-02-seed, 03-03-tests, 06-fitment-intelligence, 07-search-feed-public-profile]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exclusive-arc polymorphic FK (three nullable FKs + num_nonnulls(...)=1 CHECK) instead of discriminator+loose-id"
    - "Shared-config master + applicability join (configurations is canonical, model_configurations maps applicability)"
    - "Reference-data RLS: enable RLS in-migration + one anon/authenticated SELECT policy + zero write policies (service-role-only)"

key-files:
  created:
    - supabase/migrations/0003_fitment_taxonomy.sql
  modified: []

key-decisions:
  - "configurations is a SHARED MASTER (unique name), diverging from ARCHITECTURE.md's configurations.model_id sketch; applicability lives in model_configurations so search_term_targets.config_id points at one canonical row"
  - "Slang link uses three nullable FKs + exactly_one_target CHECK (num_nonnulls=1), never a target_type/target_id discriminator — real FKs guarantee the target entity exists (RESEARCH Pitfall 1)"
  - "search_terms.term is citext so slang uniqueness is case-insensitive"
  - "search_term_targets_uniq unique index over coalesce(make_id,0),coalesce(model_id,0),coalesce(config_id,0) makes the seed idempotent across the exclusive arc"

patterns-established:
  - "Exclusive-arc polymorphic link: nullable FKs + num_nonnulls=1 CHECK + coalesce(...,0) unique index for idempotent seeding"
  - "Reference table = RLS enabled in-migration, one anon+authenticated SELECT policy, no write policy (writes service-role-only)"

requirements-completed: [FITL-01, FITL-02, FITL-03, FITL-04, FITL-05, FITL-06, FITL-07, FITL-08]

# Metrics
duration: ~3min
completed: 2026-06-04
---

# Phase 3 Plan 01: Fitment Taxonomy Schema Summary

**8-level fitment reference schema (makes→models→configurations, slang exclusive-arc link, and flat L5–L8 dimensions) — all RLS default-deny with public SELECT, applied to Staging.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-04T17:10:05Z
- **Completed:** 2026-06-04T17:12:58Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Hierarchical core: `makes` (L1) → `models` (L2, FK make_id + unique make_id+name) → `configurations` (L3, shared master) plus the `model_configurations` applicability join.
- Load-bearing slang link: `search_terms` (citext unique) + `search_term_targets` with three nullable FKs guarded by `exactly_one_target` CHECK (`num_nonnulls(make_id, model_id, config_id) = 1`) and an idempotent unique index.
- Flat dimensions: `part_categories` (self-referencing tree, on delete restrict), `materials`, `conditions`, `special_filters` (name unique + sort_order).
- All 10 tables: RLS enabled in-migration, one anon+authenticated SELECT policy each, zero write policies. Migration applied to Supabase Staging; anon SELECT confirmed on all 10, anon INSERT confirmed blocked by RLS.

## Task Commits

Each task was committed atomically:

1. **Task 1: Hierarchical core (makes, models, configurations, model_configurations)** - `43367a1` (feat)
2. **Task 2: Slang exclusive-arc link + flat dimensions L5–L8** - `d7fddbf` (feat)
3. **Task 3: Apply migration 0003 to Staging** - no code change (applied via `supabase db push`; schema committed in Tasks 1–2)

**Plan metadata:** (final docs commit below)

## Files Created/Modified
- `supabase/migrations/0003_fitment_taxonomy.sql` - The complete 8-level fitment reference schema: 8 reference tables + the model_configurations join + the search_term_targets exclusive arc, all RLS default-deny with public SELECT.

## Decisions Made
- **Shared-config master:** `configurations` is a canonical master keyed on a unique name, diverging (by decision, per 03-CONTEXT) from ARCHITECTURE.md's `configurations.model_id` sketch. Applicability lives in `model_configurations`, so `search_term_targets.config_id` always resolves to one canonical config row.
- **Exclusive-arc over discriminator:** Slang resolution uses three nullable FKs + a `num_nonnulls=1` CHECK rather than a loose discriminator/id pair, so the database guarantees the referenced entity exists (avoids RESEARCH Pitfall 1).
- **citext for slang term** so 'Aerodyne'/'aerodyne' collide on uniqueness.

## Deviations from Plan

None - plan executed exactly as written. (The Task-2 verifier flagged the literal phrase `target_type` inside an explanatory comment; the comment was reworded to describe the avoided anti-pattern without the literal token — no schema change, same intent.)

## Issues Encountered
- The verification guard for the "no target_type pattern" check matched my explanatory SQL comment (which named the anti-pattern it was rejecting). Reworded the comment so the guard passes against actual schema, not prose. No structural impact.
- IDE diagnostics flagged the file as invalid T-SQL — false positives from a SQL Server parser; the syntax is valid Postgres and mirrors 0001/0002 verbatim. The real proof is that `supabase db push` applied it cleanly to Staging.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema is live on Staging and ready for the seed (Plan 03-02) and tests (Plan 03-03).
- All tables are empty until seeded; `on conflict` targets (unique constraints / indexes) are in place for idempotent seeding.

## Self-Check: PASSED

- FOUND: supabase/migrations/0003_fitment_taxonomy.sql
- FOUND commit: 43367a1 (Task 1)
- FOUND commit: d7fddbf (Task 2)
- All 10 tables anon-readable on Staging; anon INSERT blocked by RLS.

---
*Phase: 03-fitment-taxonomy-slang-library*
*Completed: 2026-06-04*
