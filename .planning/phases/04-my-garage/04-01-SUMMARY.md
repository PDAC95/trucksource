---
phase: 04-my-garage
plan: 01
subsystem: database
tags: [supabase, postgres, rls, zod, vitest, garage, fitment]

# Dependency graph
requires:
  - phase: 01-foundation-privacy-model
    provides: profiles split + RLS default-deny convention + (select auth.uid()) wrapper + integration test harness (_supabase.ts)
  - phase: 03-fitment-taxonomy-slang-library
    provides: makes/models/configurations reference tables + coalesce(...,0) NULL-arm unique index pattern
provides:
  - garage_trucks — the first owner-scoped read+write authenticated table (RLS owner-only)
  - shared truckSchema (Zod) — single client+server validation source of truth
  - listMyTrucks() / GarageTruck type — the stable owner-scoped read contract Phases 6 & 7 consume
  - anon RLS gate test (garage.test.ts) — the phase's privacy re-verification
affects: [05-listings, 06-fitment-intelligence, 07-search-feed-public-profile]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First owner-scoped read+write authenticated table: 4 owner policies (S/I/U/D) all (select auth.uid()) = user_id, NO anon policy"
    - "truck_id -> {make,model,config} resolution helper as the stable P6/P7 contract; config_id NULL => MODEL-level granularity"
    - "coalesce(config_id,0) unique index dedupes the NULL-config arm (reused from 0003 search_term_targets_uniq)"

key-files:
  created:
    - supabase/migrations/0004_garage.sql
    - lib/garage/schema.ts
    - lib/garage/queries.ts
    - tests/integration/garage.test.ts
    - tests/unit/garage-schema.test.ts
  modified: []

key-decisions:
  - "[DB] garage_trucks stores model_id + nullable config_id; make is DERIVED via models.make_id (no make_id column to avoid drift). config_id NULL = model-level truck."
  - "[DB] on delete CASCADE for user_id, RESTRICT for model_id/config_id — retiring a reference model/config never silently deletes a user's saved truck."
  - "[Privacy] First owner-scoped read+write authenticated table; RLS owner-only (4 policies, NO anon policy) IS the Phase-4 privacy gate, proven by garage.test.ts (anon SELECT 0 rows + anon INSERT denied)."
  - "[Contract] listMyTrucks() joins ONLY to fitment names (never profiles_*); config_id NULL => filter at MODEL granularity is the documented GRGE-03/04 rule for P6/P7."
  - "[Contract] No default/active-truck concept — explicit selector at filter time (per 04-CONTEXT)."

patterns-established:
  - "Owner-scoped authenticated table: 4 owner policies to authenticated, (select auth.uid()) = user_id, no anon policy, RLS in-migration."
  - "Stable owner-scoped read helper (lib/garage/queries.ts) imported by downstream phases instead of touching the table directly."

requirements-completed: [GRGE-01, GRGE-02, GRGE-03, GRGE-04]

# Metrics
duration: 4min
completed: 2026-06-04
---

# Phase 4 Plan 01: My Garage Data + Contract Foundation Summary

**garage_trucks — the project's first owner-scoped read+write authenticated table (RLS owner-only, no anon policy) — plus the shared truckSchema and the listMyTrucks() truck_id→{make,model,config} helper that Phases 6/7 consume, proven by an anon RLS gate.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-04T18:49:05Z
- **Completed:** 2026-06-04T18:53:29Z
- **Tasks:** 3
- **Files modified:** 5 (all created)

## Accomplishments
- `garage_trucks` table on Staging: first owner read+write authenticated table, RLS default-deny, 4 owner policies (S/I/U/D) all `(select auth.uid()) = user_id`, NO anon policy, NO SECURITY DEFINER.
- DB-enforced no-exact-duplicate (Make,Model,Config) per user including the NULL-config arm via `coalesce(config_id,0)` unique index; `user_id` index; cascade-on-user / restrict-on-fitment delete semantics.
- Shared `truckSchema` (Zod) — single client+server source of truth (model required, config optional/nullable, nickname ≤40, coerces string ids).
- `listMyTrucks(): Promise<GarageTruck[]>` — the stable owner-scoped read contract (joins only to fitment names, documents config-NULL ⇒ model granularity) for the garage list + Phase 6 pre-fill + Phase 7 "fits my truck".
- Anon RLS gate (`garage.test.ts`): proves anon SELECT returns 0 rows and anon INSERT is denied against Staging — the phase's privacy re-verification. Full suite green (15 files, 77 passed, 1 skipped), no regression.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 0004_garage.sql — owner-scoped table + RLS + 4 owner policies, applied to Staging** - `a41f263` (feat)
2. **Task 2: Shared truckSchema (Zod) + owner-scoped queries helper** - `a932966` (feat)
3. **Task 3: Wave-0 tests — anon RLS gate + truckSchema unit test** - `e758596` (test)

## Files Created/Modified
- `supabase/migrations/0004_garage.sql` - garage_trucks table, RLS in-migration, 4 owner policies, user_id index, coalesce(config_id,0) unique index. Applied to Staging (verified: RLS on, 4 policies, 3 indexes).
- `lib/garage/schema.ts` - shared `truckSchema` + `TruckInput`.
- `lib/garage/queries.ts` - `listMyTrucks()` + `GarageTruck` type; owner-scoped read via cookie client, joins only fitment names.
- `tests/integration/garage.test.ts` - anon RLS gate (0 rows + insert denied), mirrors rls.test.ts/fitment.test.ts.
- `tests/unit/garage-schema.test.ts` - truckSchema coverage (model-required, config optional/nullable, nickname ≤40, id-coercion, empty-nickname, positive-id).

## Decisions Made
- model_id + nullable config_id (no make_id column; make derived via models.make_id).
- on delete CASCADE (user) / RESTRICT (model_id, config_id).
- No default/active-truck concept (explicit selector at filter time, per CONTEXT).
- listMyTrucks() is the stable P6/P7 read surface; downstream phases never touch garage_trucks directly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The pre-commit lint-staged hook reported "could not find any staged files matching configured tasks" for the `.sql` migration (the known deferred item: `*.sql` is not in the lint-staged glob). No impact — the commit succeeded and the SQL was applied/verified on Staging. For `lib/` and `tests/` files lint-staged ran Prettier normally (it reformatted the `.insert()` chain in garage.test.ts, captured in the Task 3 commit).
- Migration applied via `npx supabase db query --linked -f` (the 03-02 non-destructive apply path), not `db push` — `db push --linked --dry-run` was used only as the parse/pending verification, avoiding any migration-history rewrite.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GRGE-01..04 data layer + contract complete. Ready for Plan 04-02 (add/edit/delete actions reusing truckSchema with the server-side model_configurations applicability re-check) and 04-03 (UI).
- `listMyTrucks()` is ready for Phase 6 (seller pre-fill) and Phase 7 ("fits my truck" chooser) without further data-layer changes.

## Self-Check: PASSED

All 5 created files exist on disk; all 3 task commits (a41f263, a932966, e758596) exist in git history.

---
*Phase: 04-my-garage*
*Completed: 2026-06-04*
