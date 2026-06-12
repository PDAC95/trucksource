---
phase: 06-fitment-intelligence
plan: 03
subsystem: fitment-intelligence
tags: [server-action, supabase, rls, fitment, suggestions, fint-01]

# Dependency graph
requires:
  - phase: 06-fitment-intelligence
    plan: 01
    provides: fitment_rules exclusive-arc inference table + seeded category-driven and Peterbilt-359 garage-expansion rules
  - phase: 04-my-garage
    provides: listMyTrucks() owner-RLS garage read contract (GarageTruck shape, names resolved, no PII)
  - phase: 05-listings-photos-exif-safe-storage
    provides: getListing fitment embed pattern (models:..(name, makes:..(name)), configurations) + cookie-bound createClient reader precedent
provides:
  - lib/fitment/types.ts — shared SuggestedFitment/SuggestedTag/SuggestionGroup/SuggestResult contract (client + server) + MIN_SUGGESTION_CONFIDENCE
  - lib/fitment/suggest.ts — the FINT-01 suggestFitment Server Action (grouped-by-source suggestions from seeded rules)
  - FINT-01 integration assertions (seeded category + garage-expansion rule backbone + empty-result contract)
affects: [06-04 (suggestion chip UI consumes suggestFitment + SuggestedFitment→FitmentSelection accept), 07-search-feed-public-profile]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Suggestions grouped BY SOURCE — the group label ('From your garage' / 'Common for <Category>') IS the explainability layer; no confidence score reaches the UI"
    - "Precision-over-recall filter: only rules at/above MIN_SUGGESTION_CONFIDENCE (80) surface; service returns { groups: [] } and never throws"
    - "ONE mechanism: category inference AND garage→flat expansion both read the SAME fitment_rules table (RESEARCH Pattern 1)"
    - "SuggestedFitment field names match FitmentSelection EXACTLY so 06-04's accept handler spreads with no second round-trip"

key-files:
  created:
    - lib/fitment/types.ts
    - lib/fitment/suggest.ts
  modified:
    - tests/integration/fitment-intelligence.test.ts

key-decisions:
  - "suggestFitment is a 'use server' Server Action (repo cascade-reader precedent), NOT an Edge Function (ARCHITECTURE.md: promotable later)"
  - "getClaims/RLS only — garage read delegated to listMyTrucks() (owner-RLS), fitment_rules public-read; NEVER lib/supabase/admin (invariant #3)"
  - "Garage group OMITTED entirely when the caller has no trucks (CONTEXT 'no garage → silent'); category group only when a chosen category has content"
  - "Garage→flat expansion emits ONLY flat tags (search_term/special_filter/category); model/config IMPLIES arms out of scope (exact garage fitments come from the truck itself, already in `fitments`)"
  - "Config-scoped garage rules (trigger_config_id not null) fire only when a truck with that model ALSO carries that config — filtered in JS over the trucks list"

patterns-established:
  - "lib/fitment/ shared-contract module: plain types importable by both the server action and the 06-04 client chip"
  - "Name resolution server-side via named PostgREST embeds (search_terms.term / special_filters.name / part_categories.name / models→makes), enumerated selects, null-tolerant (?? '')"

requirements-completed: [FINT-01]

# Metrics
duration: ~6min
completed: 2026-06-09
---

# Phase 6 Plan 03: FINT-01 Suggestion Engine Summary

**A `"use server"` `suggestFitment` Server Action that returns fitment suggestions GROUPED BY SOURCE (garage + category) derived from the seeded `fitment_rules` table — getClaims/RLS-only, precision-filtered, name-resolved, proposes-only (no writes, never throws) — plus a shared `lib/fitment/types.ts` contract the 06-04 chip UI consumes.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-09T14:16:32Z
- **Completed:** 2026-06-09T14:22:17Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `lib/fitment/types.ts` — the shared suggestion contract: `SuggestedFitment` (field names matching `FitmentSelection` exactly so 06-04 spreads on accept), `SuggestedTag` (search_term/special_filter/category), the discriminated `SuggestionGroup` (garage | category), `SuggestResult`, and `MIN_SUGGESTION_CONFIDENCE = 80`.
- `lib/fitment/suggest.ts` — the FINT-01 `suggestFitment({ partCategoryId })` Server Action. Builds up to two groups:
  - **garage** (omitted entirely when no trucks): exact fitments mapped from `listMyTrucks()` + flat tags from `garageExpansionTags()` (rules `trigger_model_id IN (model ids)`, config-scoped rules gated by a matching truck config).
  - **category** (only when a chosen category yields content): fitments from `implies_model_id` rows (make/model/config names via embeds) + flat tags from the flat implies arms, labelled `"Common for <category name>"`.
  - getClaims/RLS only (garage via `listMyTrucks`, rules public-read), no service-role import, precision-filtered, de-duped, name-resolved, never throws.
- FINT-01 integration assertions appended to `tests/integration/fitment-intelligence.test.ts`: ≥1 category-driven rule + ≥1 garage-expansion rule exist and resolve to real implied-term names (the engine's data backbone), plus the `{ groups: [] }` empty-result contract; live grouped output deferred to the 06-04 checkpoint.

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/fitment/types.ts — shared suggestion contract** - `5485198` (feat)
2. **Task 2: lib/fitment/suggest.ts — the FINT-01 Server Action** - `1cee492` (feat)
3. **Task 3: FINT-01 integration assertions** - `0a83dd4` (test)

## Files Created/Modified
- `lib/fitment/types.ts` - shared SuggestedFitment/SuggestedTag/SuggestionGroup/SuggestResult + MIN_SUGGESTION_CONFIDENCE
- `lib/fitment/suggest.ts` - FINT-01 suggestFitment ("use server"); garageExpansionTags + categorySuggestions helpers; ruleToFlatTag resolver
- `tests/integration/fitment-intelligence.test.ts` - appended FINT-01 describe block (category + garage rule backbone + empty-result contract)

## Decisions Made
- **Server Action, not Edge Function** — matches the repo's cascade-reader precedent; ARCHITECTURE.md notes it is promotable later.
- **getClaims/RLS only** — garage reads go through `listMyTrucks()` (owner-RLS); `fitment_rules` is public-read. No `@/lib/supabase/admin` anywhere (invariant #3, grep-verified in the task gate).
- **Group-by-source = explainability** — the label is the explanation; no confidence score reaches the UI (precision filter is purely server-side).
- **Garage = flat tags only** — exact garage fitments come from the truck itself (already in `fitments`); model/config implies arms are out of scope for v1 garage expansion.
- **Silent empty states** — no garage → no garage group; a category with no rules → no category group; nothing matches → `{ groups: [] }`, never a throw.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
**Parallel-wave tsc race (sibling 06-02, NOT 06-03 — now resolved).** Mid-execution, `npx tsc --noEmit` reported errors in `lib/listings/queries.ts` and `components/listings/listing-detail.tsx` — both sibling Plan 06-02 files whose `ListingDetail.categories`/`searchTerms` additions were briefly inconsistent across files during the parallel wave. I verified my own three files typecheck CLEAN in isolation (by stashing the sibling working-tree change), did NOT touch sibling files (scope boundary), and logged the observation to `deferred-items.md`. Sibling 06-02 then committed `11de6a4` and the full-project `npx tsc --noEmit` is now CLEAN.

Note: the husky stash/restore cross-attribution hazard fired — an unused `import { listingSchema } from "@/lib/listings/schema"` was injected into the shared test file from the sibling 06-02 work during a concurrent commit. It is cosmetic (no behavior change) and belongs to 06-02's surface; my three FINT-01 assertions are intact on disk. Verify by file-on-disk, not commit contents (MEMORY: precommit-hook-parallel-attribution).

My FINT-01 test file runs green (10/10 in the file, including the 3 new assertions, live vs Staging).

## User Setup Required
None - no external service configuration required. The engine reads the already-applied, already-seeded `fitment_rules` table on Staging.

## Next Phase Readiness
- The engine is ready for Plan 06-04: the chip UI calls `suggestFitment({ partCategoryId })` on every part-category change and renders the returned groups; accepting a `SuggestedFitment` spreads directly into a `FitmentSelection` (field names align), and accepting a `SuggestedTag` maps onto the `categoryIds`/`searchTermIds` persistence contract from 06-01/06-02.
- The live grouped output (garage group present with trucks, omitted without; "Common for <Category>" labels) is the explicit 06-04 human-verify checkpoint subject.
- No blockers.

## Self-Check: PASSED

All 3 files present on disk (`lib/fitment/types.ts`, `lib/fitment/suggest.ts`, `tests/integration/fitment-intelligence.test.ts`); all 3 task commits (5485198, 1cee492, 0a83dd4) present in history. Full-project `npx tsc --noEmit` clean; FINT-01 test file green.

---
*Phase: 06-fitment-intelligence*
*Completed: 2026-06-09*
