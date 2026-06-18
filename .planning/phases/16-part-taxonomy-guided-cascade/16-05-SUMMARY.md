---
phase: 16-part-taxonomy-guided-cascade
plan: 05
subsystem: database
tags: [postgres, supabase, search, rls, rpc, vitest]

# Dependency graph
requires:
  - phase: 16-part-taxonomy-guided-cascade (16-01)
    provides: search_listings recursive-CTE subtree RPC (the function this plan recreates + extends)
  - phase: 04-my-garage (0005_garage_year)
    provides: the 1970..2027 model-year bounds precedent mirrored onto listings
provides:
  - listings.year_start / year_end smallint columns (both null = universal)
  - listings_year_bounds + listings_year_pairing CHECK constraints
  - search_listings recreated with a p_year filter arm (all 0025 arms preserved)
  - lib/listings/years.ts (YEAR_MIN/YEAR_MAX, yearOptions(), isValidYear())
  - search URL `year` param parse/clamp/serialize + p_year RPC forwarding
  - tests/integration/search.year.test.ts (universal-matches-any + range arms)
affects: [16-06 search year UI, 16-07 create/edit listing year inputs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Listing year as a nullable from-to RANGE; null pair = universal (fits all years); specific year = year_start = year_end"
    - "search_listings parameter added in the MIDDLE → drop the exact old signature first, then create-or-replace, to avoid a stale duplicate overload"
    - "Single source of truth for the year range (lib/listings/years.ts) consumed by both search UIs and the listing form"

key-files:
  created:
    - supabase/migrations/0026_listing_year.sql
    - lib/listings/years.ts
    - tests/integration/search.year.test.ts
  modified:
    - lib/search/params.ts
    - lib/search/queries.ts

key-decisions:
  - "Listing year is OPTIONAL (nullable, no backfill, no NOT NULL) — existing listings stay universal and remain findable for any year filter; contrast with garage year which is mandatory"
  - "Buyer filters by a SINGLE year; match = p_year null OR listing universal (year_start null) OR p_year between year_start and year_end"
  - "search_listings signature INTENTIONALLY changes to 0025+p_year (no longer byte-identical to 0024/0025); p_year placed after p_condition_id, before p_fits_model_id"
  - "Dropped the old 9-arg signature in the migration before create-or-replace so adding a middle parameter does not leave two coexisting overloads (ambiguous named calls)"
  - "Year counts as a search criterion in hasCriteria so a year-only filter is treated as a real search"

patterns-established:
  - "Year-options helper mirrors the garage picker (descending 2027..1970) — declared once, imported everywhere"
  - "Integration test self-skips arms when Staging lacks seed data (universal arm runs on existing listings; range arm skips until 16-07 adds ranged listings)"

requirements-completed: [FITL-05, SRCH-03, FINT-03]

# Metrics
duration: 6min
completed: 2026-06-18
---

# Phase 16 Plan 05: Listing Year Dimension Summary

**Per-listing year as a nullable from-to range (null = universal) wired through migration 0026, the search_listings p_year arm, a shared year-options helper, and the search URL `year` param + integration test.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-18T16:27:29Z
- **Completed:** 2026-06-18T16:33:25Z
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- Added `listings.year_start` / `year_end` (smallint, nullable) with bounds (1970..2027) + pairing CHECK constraints; null pair = universal so every existing listing stays findable.
- Recreated `search_listings` with a `p_year` arm reproducing ALL five 0025 arms unchanged (keyword/FTS+slang, condition, model/config, recursive-CTE category subtree, fits-my-truck); dropped the old 9-arg signature first to avoid a duplicate overload.
- Shipped `lib/listings/years.ts` as the single source of truth for the year range (consumed by 16-06 search + 16-07 form).
- Wired `year` through the URL contract (parse/clamp/serialize + hasCriteria) and forwarded `p_year` to the RPC; added a self-skipping integration test.

## Task Commits

1. **Task 1: Migration 0026 year columns + search p_year arm** - `f7ba0f0` (feat)
2. **Task 2: Shared year-options helper** - `9692507` (feat)
3. **Task 3: Search year param + RPC forwarding + integration test** - `ab67fce` (feat)

## Files Created/Modified
- `supabase/migrations/0026_listing_year.sql` - year columns + CHECKs + search_listings recreated with p_year (drop-old-signature-then-recreate)
- `lib/listings/years.ts` - YEAR_MIN/YEAR_MAX (1970..2027), yearOptions() descending, isValidYear()
- `lib/search/params.ts` - `year` added to SearchQuery, KEYS, parse (toYear clamp), serialize, hasCriteria
- `lib/search/queries.ts` - p_year forwarded in the searchListings RPC call (+ p_year:null in autocomplete)
- `tests/integration/search.year.test.ts` - universal-matches-any + range inside/outside arms, self-skip on thin data

## Decisions Made
- Listing year is optional (nullable, no backfill); existing listings = universal and stay findable. Garage year stays mandatory — the two surfaces differ by design.
- Buyer filters by a single year: `p_year is null or l.year_start is null or (p_year between l.year_start and l.year_end)`.
- Added `p_year` in the middle of the signature (after `p_condition_id`) per plan; this forced an explicit `drop function` of the exact 0025 signature before `create or replace` so PostgREST never sees two overloads.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Drop the old 9-arg search_listings signature before recreate**
- **Found during:** Task 1 (migration authoring)
- **Issue:** The plan said "recreate via `create or replace function`" and place `p_year` mid-signature. But `create or replace` keys on the full argument-type list — adding a parameter produces a DISTINCT function, leaving the old 9-arg `search_listings` AND the new 10-arg one coexisting. PostgREST named calls would then be ambiguous (or resolve to the stale function), a real correctness bug.
- **Fix:** Added `drop function if exists public.search_listings(text, bigint, bigint, bigint, bigint, bigint, bigint, int, int)` before the recreate, so exactly one definition is checked in.
- **Files modified:** supabase/migrations/0026_listing_year.sql
- **Verification:** All 14 existing search tests (search/contract/subtree) pass against the new signature; the new year test passes.
- **Committed in:** `f7ba0f0` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Forward p_year:null in the autocomplete RPC call**
- **Found during:** Task 3 (queries.ts wiring)
- **Issue:** queries.ts calls `search_listings` in TWO places — searchListings and autocomplete. The plan only named the searchListings call. Leaving autocomplete on the old named-arg set is fine while p_year defaults, but explicitly passing `p_year: null` keeps both call sites consistent and unambiguous against the new signature.
- **Fix:** Added `p_year: null` to the autocomplete title-suggestion RPC call.
- **Files modified:** lib/search/queries.ts
- **Verification:** tsc clean; search tests pass.
- **Committed in:** `ab67fce` (Task 3 commit)

**3. [Rule 2 - Missing Critical] Count year in hasCriteria**
- **Found during:** Task 3 (params.ts wiring)
- **Issue:** `hasCriteria()` drives the feed-vs-results distinction and gates search-event logging. A year-only filter would have been treated as "the feed" (not a search), under-counting and mis-rendering.
- **Fix:** Added `query.year !== null` to hasCriteria.
- **Files modified:** lib/search/params.ts
- **Verification:** tsc clean.
- **Committed in:** `ab67fce` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 missing-critical)
**Impact on plan:** All necessary for correctness/consistency. No scope creep — no new tables, no architectural change.

## Issues Encountered
- IDE flagged ~17 "syntax errors" on the migration; these were a T-SQL (SQL Server) parser misreading Postgres DDL (`add column if not exists`, `$$`, schema-qualified names). Confirmed false positives against the identical style in 0025/0005; ignored.
- No migration-history desync this time (16-01 had repaired 0004-0024). `db push` applied 0026 cleanly.

## User Setup Required
None - no external service configuration required. (Migration already pushed to Staging.)

## Next Phase Readiness
- Data + search layer for Year is complete. 16-06 (search year UI) imports `yearOptions()` and sets the `year` URL param; 16-07 (create/edit) imports the same helper and writes `year_start`/`year_end`.
- The range arm of the integration test will activate once 16-07 lets sellers store year ranges on Staging.

---
*Phase: 16-part-taxonomy-guided-cascade*
*Completed: 2026-06-18*

## Self-Check: PASSED

All 6 files verified on disk; all 3 task commits (f7ba0f0, 9692507, ab67fce) verified in git log.
