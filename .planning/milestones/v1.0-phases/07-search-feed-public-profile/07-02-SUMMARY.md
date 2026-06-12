---
phase: 07-search-feed-public-profile
plan: 02
subsystem: api
tags: [search, postgres, fts, pg_trgm, supabase, rpc, privacy, server-actions]

# Dependency graph
requires:
  - phase: 07-search-feed-public-profile (07-01)
    provides: "search_listings / match_search_term / autocomplete_terms RPCs, search_events table, count(*) over() total_count contract"
  - phase: 05-listings-photos-exif-safe-storage
    provides: "listings/listing_photos/listing_fitment tables, listingPhotoPublicUrl, getListing seller-resolution pattern, recordListingView best-effort posture"
  - phase: 05.1-stakeholder-trust-lifecycle
    provides: "profiles_public.display_name + resolvePublicName public-name contract"
provides:
  - "lib/search/params.ts — typed SearchQuery URL parse/serialize (lossless round-trip) + hasCriteria"
  - "lib/search/queries.ts — searchListings (zero-PII batch card hydration + total_count), expandSlang, autocomplete"
  - "lib/search/events.ts — recordSearchEvent best-effort telemetry (SRCH-05)"
affects: [07-03, 07-04, search-feed-ui, public-profile-grid]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "All-search-state-in-URL: parseSearchParams ↔ serializeSearchQuery exact inverses (shareable/back-forward-safe)"
    - "Zero-PII batch card hydration: RPC returns no seller id; seller resolved via enumerated listings→profiles_public reads (no N+1, no *)"
    - "Single-query total via rows[0].total_count window column (no re-call, no cards.length)"
    - "Slang/autocomplete trgm path routes through public.similarity RPCs — never bare % / LIKE / ILIKE"

key-files:
  created:
    - lib/search/params.ts
    - lib/search/queries.ts
    - lib/search/events.ts
    - tests/unit/search-params.test.ts
    - tests/unit/search-events.test.ts
  modified: []

key-decisions:
  - "page param defaults to 0; sort defaults to 'relevance' when q present else 'recent' — derived default omitted from the URL for clean links"
  - "Numeric facet params coerce via Number() with NaN/non-integer/≤0 → null guards so junk querystrings degrade gracefully instead of poisoning the RPC"
  - "expandSlang resolves the taxonomy target by reading search_term_targets directly (exclusive arc make|model|config) — the RPC stays term-only/PII-minimal"
  - "autocomplete title suggestions reuse search_listings (p_limit:6) rather than a hand-rolled prefix query — keeps the no-LIKE/no-bare-% invariant"

patterns-established:
  - "SearchQuery is the single typed contract between URL, RPC args, and UI router.push"
  - "recordSearchEvent is a byte-for-byte posture clone of recordListingView (getClaims, swallow-errors, never block render)"

requirements-completed: [SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05]

# Metrics
duration: ~6min
completed: 2026-06-10
---

# Phase 7 Plan 02: Search lib/readers Summary

**The `lib/search/` read + event contract: a typed URL ↔ SearchQuery round-trip, `searchListings` that calls the `search_listings` RPC and batch-hydrates zero-PII cards (cover photo + Make/Model chip + public seller name) with a single-query `total_count`, `expandSlang`/`autocomplete` over the `public.similarity` RPCs, and a best-effort `recordSearchEvent` telemetry action.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-10T14:05:42Z
- **Completed:** 2026-06-10T14:11:29Z
- **Tasks:** 3
- **Files modified:** 5 (all created)

## Accomplishments
- `parseSearchParams` ↔ `serializeSearchQuery` are exact inverses (lossless round-trip across empty-feed / keyword-only / full-facet / fits-my-truck shapes), with NaN-guarded numeric coercion and query-derived default sort.
- `searchListings` calls the `search_listings` RPC then BATCH-hydrates each row (cover photo, first-fit Make/Model chip, public seller name + state) with NO N+1 and NO PII — seller resolved via enumerated `listings`→`profiles_public` reads, mirroring `getListing`.
- `total` read from `rows[0].total_count` (the single-query window-count strategy — backs the "X resultados" count).
- `expandSlang` resolves a canonical slang term via `match_search_term` (public.similarity) + its `search_term_targets` taxonomy target for the transparency banner; `autocomplete` returns term suggestions via `autocomplete_terms` + title suggestions via `search_listings`.
- `recordSearchEvent` is a best-effort clone of `recordListingView` (getClaims, swallow-errors, never blocks render) capturing raw/normalized term + facets + result count + nullable searcher.

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/search/params.ts — typed SearchQuery URL parse/serialize** - `91bd9ed` (feat)
2. **Task 2: lib/search/queries.ts — searchListings/expandSlang/autocomplete** - `459b592` (feat)
3. **Task 3: lib/search/events.ts — recordSearchEvent** - `c2aa10a` (feat)

## Files Created/Modified
- `lib/search/params.ts` - Typed `SearchQuery` + `parseSearchParams`/`serializeSearchQuery` (lossless round-trip) + `hasCriteria`; the stable URL param contract (q/make/model/config/category/condition/fits/fitsConfig/sort/page).
- `lib/search/queries.ts` - `searchListings` (RPC + zero-PII batch card hydration + `total_count`), `expandSlang` (match_search_term + search_term_targets), `autocomplete` (autocomplete_terms + search_listings titles).
- `lib/search/events.ts` - `"use server"` `recordSearchEvent` best-effort telemetry (SRCH-05).
- `tests/unit/search-params.test.ts` - 10 tests: round-trip for 4 query shapes, NaN/junk guards, default-sort selection.
- `tests/unit/search-events.test.ts` - 4 tests: happy-path field mapping, anon null searcher, insert-rejects no-throw, getClaims-rejects no-throw.

## Decisions Made
- Numeric facet coercion uses NaN/non-integer/≤0 → null guards so a junk `?model=abc` degrades to "no facet" rather than poisoning the RPC.
- The derived default sort and `page=0` are omitted from the serialized URL to keep links clean (an empty feed serializes to `""`).
- `expandSlang` reads `search_term_targets` directly for the taxonomy target (exclusive arc make|model|config), keeping the RPC term-only.
- `autocomplete` title suggestions reuse `search_listings` (`p_limit:6`) to preserve the no-LIKE / no-bare-`%` invariant.

## Deviations from Plan

None - plan executed exactly as written.

The plan's Task 2 noted a *possible* coordination need to ADD `match_search_term` / `autocomplete_terms` RPCs to migration 0014 ("if you add this RPC..."). On inspection, 07-01 already shipped both RPCs (and `search_term_targets` already exists from 0003), so no migration change was required — the readers consume the existing RPCs as-is. No schema touched.

## Issues Encountered
None. The prettier pre-commit hook reformatted `lib/search/queries.ts` (wrapping a long `.select()` string and the seller-map generic) after the Task-2 write — cosmetic only, no behavior change, verified by tsc + live integration test staying green.

## User Setup Required
None - no external service configuration required. All readers consume RPCs/tables already live on Staging.

## Next Phase Readiness
- The feed UI (07-03) and public-profile grid (07-04) now have stable, PII-safe readers: `searchListings` for the card grid + count, `expandSlang` for the transparency banner, `autocomplete` for the suggestions dropdown, and `recordSearchEvent` for best-effort logging.
- The PII boundary lives in ONE place (`searchListings`' enumerated seller resolution) — UI plans never touch profiles_private.
- Verification: 25 search tests green (10 params + 4 events unit, 11 integration live vs Staging); full suite 31 files / 176 passed / 1 skipped — no regression; `tsc --noEmit` clean; grep-clean (no `select('*')`, `profiles(*)`, `LIKE`/`ILIKE`, bare `term %`, or `getSession` in code).

## Self-Check: PASSED

All 5 created files present on disk; all 3 task commits (`91bd9ed`, `459b592`, `c2aa10a`) present in git history.

---
*Phase: 07-search-feed-public-profile*
*Completed: 2026-06-10*
