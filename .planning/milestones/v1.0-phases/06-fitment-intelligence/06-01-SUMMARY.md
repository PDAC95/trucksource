---
phase: 06-fitment-intelligence
plan: 01
subsystem: database
tags: [postgres, supabase, rls, zod, fitment, migrations]

# Dependency graph
requires:
  - phase: 03-fitment-taxonomy-slang-library
    provides: part_categories / search_terms / models / configurations / special_filters reference tables + the search_term_targets exclusive-arc + coalesce(...,0) idempotent-seed idiom
  - phase: 05-listings-photos-exif-safe-storage
    provides: public.listings (seller_id) + listing_fitment public-read/owner-write-via-EXISTS pattern + listingSchema single source of truth
provides:
  - fitment_rules table (FINT-01 exclusive-arc inference rules, public-read/seed-write)
  - listing_categories + listing_search_terms join tables (FINT-03, public-read/owner-write-via-EXISTS)
  - seed rules (category-driven + Peterbilt-359 garage expansion)
  - listingSchema extended with categoryIds + searchTermIds (the persistence contract for Plan 06-02)
affects: [06-02 (persistence/actions), 06-03+ (inference engine / UI), 07-search-feed-public-profile]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inference rules as an exclusive arc of REAL FKs (trigger arm + implies arm, each num_nonnulls=1) — never a text discriminator"
    - "Garage→flat expansion encoded as trigger_model_id → implies_search_term_id rows in the SAME fitment_rules table"
    - "Idempotent rule seed: FK ids resolved by name, on conflict do nothing against the coalesce(...,0) unique index, do-block raises on zero rows"

key-files:
  created:
    - supabase/migrations/0012_fitment_rules.sql
    - supabase/migrations/0013_fitment_rules_seed.sql
    - tests/integration/fitment-intelligence.test.ts
  modified:
    - lib/listings/schema.ts
    - tests/unit/listing-schema.test.ts

key-decisions:
  - "fitment_rules uses real-FK exclusive arcs on BOTH sides (exactly_one_trigger + exactly_one_implies), not a trigger_value text discriminator — FKs guarantee the trigger/consequence entity exists (RESEARCH Pitfall 1)"
  - "Garage→flat expansion lives in the SAME fitment_rules table as category-driven rules (trigger_model_id → implies_search_term_id), not a separate table"
  - "categoryIds/searchTermIds are NOT part of the barnyard-or-fitment refine — categories/tags do not satisfy the fitment requirement"
  - "trigger_part_number_pattern + listing_special_filters/listing_materials DEFERRED per CONTEXT scope lock; special_filters can still be a rule consequence (implies arm) but has no listing join in v1"

patterns-established:
  - "fitment_rules public-read + NO write policy (seed/service-role only) — same posture as every Phase-3 reference table"
  - "listing_categories/listing_search_terms public-read + owner-write-via-EXISTS on listings.seller_id — copied verbatim from listing_fitment"

requirements-completed: [FINT-01, FINT-03]

# Metrics
duration: ~6min
completed: 2026-06-09
---

# Phase 6 Plan 01: Fitment Intelligence Data Foundation Summary

**fitment_rules exclusive-arc inference table + listing_categories/listing_search_terms join tables (RLS in-migration), seeded with category-driven and Peterbilt-359 garage-expansion rules, plus listingSchema extended with categoryIds/searchTermIds**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-09T14:05:46Z
- **Completed:** 2026-06-09T14:11:24Z
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- `fitment_rules` — the FINT-01 backbone: an exclusive arc of REAL FKs on both sides (3 trigger arms + 5 implies arms, each guarded by a `num_nonnulls(...) = 1` CHECK), confidence smallint, trigger-side lookup indexes, and a `coalesce(...,0)` unique index for idempotent seeding. Public-read, NO write policy (seed/service-role only).
- `listing_categories` + `listing_search_terms` — the FINT-03 persistence join tables: public-read + owner-write-via-EXISTS on `listings.seller_id`, copied verbatim from `listing_fitment`.
- Seed (0013): 3 category-driven rules (Bumpers→'Large Car', Hoods & Fenders→'Long Hood'/'Wide Hood') + the Peterbilt 359→'359 Guys' garage-expansion rule, all idempotent, with a zero-row do-block guard. Verified 4 rows on Staging.
- `listingSchema` extended with `categoryIds` + `searchTermIds` (default `[]`, coerced), the refine left unchanged — the single source of truth for Plan 06-02's persistence.
- New `fitment-intelligence.test.ts` integration gate proves public-read + write-denied + seed-presence for all three tables (live vs Staging).

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 0012 — fitment_rules + listing join tables** - `357610c` (feat)
2. **Task 2: Migration 0013 — idempotent seed rules** - `c640573` (feat)
3. **Task 3: Extend listingSchema + unit test + RLS/seed integration gate** - `15bc8da` (feat)

## Files Created/Modified
- `supabase/migrations/0012_fitment_rules.sql` - fitment_rules (exclusive-arc FK rules) + listing_categories + listing_search_terms, RLS-on in-migration
- `supabase/migrations/0013_fitment_rules_seed.sql` - idempotent seed: category→search-term rules + Peterbilt-359 garage expansion, do-block guard
- `lib/listings/schema.ts` - categoryIds + searchTermIds arrays (coerced, default []); refine unchanged
- `tests/unit/listing-schema.test.ts` - extended: coercion, id validation, "categories don't satisfy the fitment refine"
- `tests/integration/fitment-intelligence.test.ts` - NEW RLS/seed gate (public-read + write-denied + seed presence for the 3 tables)

## Decisions Made
- **Exclusive-arc real FKs, not a text discriminator** — both trigger and implies sides are sets of nullable real FKs with `num_nonnulls=1` CHECKs (the 0003 `search_term_targets` idiom). FKs guarantee the referenced entity exists; a `trigger_value text` discriminator could not (RESEARCH Pitfall 1 / Anti-Patterns).
- **Garage expansion in the same table** — `trigger_model_id → implies_search_term_id` rows live in `fitment_rules`, not a separate table (RESEARCH Pattern 1).
- **Categories/tags excluded from the fitment refine** — `categoryIds`/`searchTermIds` are additive dimensions; a non-Barnyard listing still needs ≥1 fitment, proven by an explicit unit test.
- **Scope deferrals honored** — `trigger_part_number_pattern` and `listing_special_filters`/`listing_materials` are NOT created (CONTEXT lock); `special_filters` remains available as a rule consequence arm only.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Both migrations applied to Staging non-destructively via `supabase db query --linked -f` (the established apply path) on the first attempt; the seed do-block did not raise (4 rows confirmed). Full suite green: 27 files, 144 passed, 1 skipped; `tsc --noEmit` clean.

(Note: the pre-commit hook reformatted the two test files via Prettier during the Task-3 commit — cosmetic only, no behavior change.)

## User Setup Required
None - no external service configuration required. Both migrations are already applied to Staging.

## Next Phase Readiness
- The schema root for all of Phase 6 is in place: `fitment_rules` (the inference source), the two listing-join landing zones, and the extended `listingSchema` contract.
- Plan 06-02 can now wire persistence (write categoryIds/searchTermIds into the join tables under owner RLS) and the inference read path (resolve rules by trigger) against a seeded, RLS-verified foundation.
- No blockers.

## Self-Check: PASSED

All 6 files present on disk; all 3 task commits (357610c, c640573, 15bc8da) present in history.

---
*Phase: 06-fitment-intelligence*
*Completed: 2026-06-09*
