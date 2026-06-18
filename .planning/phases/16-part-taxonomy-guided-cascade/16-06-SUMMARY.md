---
phase: 16-part-taxonomy-guided-cascade
plan: 06
subsystem: search-ui
tags: [nextjs, react, search, url-state, welcome-explorer, browse-facets]

# Dependency graph
requires:
  - phase: 16-part-taxonomy-guided-cascade (16-05)
    provides: lib/listings/years.ts (yearOptions()) + the `year` URL param parse/serialize + p_year RPC forwarding
  - phase: 16-part-taxonomy-guided-cascade (16-03)
    provides: the guided welcome explorer (Make -> Model -> Category -> Advanced) with the reserved Model->Category seam
  - phase: 16-part-taxonomy-guided-cascade (16-04)
    provides: FacetControls cascade idiom + active-filter-chips (keys-array removal)
provides:
  - Optional Year step in the welcome explorer (Make -> Model -> Year(optional) -> Category -> Advanced)
  - Year <Select> facet in /browse FacetControls (desktop sidebar + mobile sheet)
  - Year active-filter chip on /browse (key `year`)
  - The single `year` URL param surfaced in both buyer search surfaces
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Year is an OPTIONAL, ungated step/facet — independent of Make/Model (static list), never blocks See results"
    - "Single `year` URL param shared by welcome runSearch and /browse facet; one source of options (lib/listings/years.ts)"

key-files:
  created: []
  modified:
    - components/welcome/welcome-explorer.tsx
    - components/search/facet-sidebar.tsx
    - app/(public)/browse/page.tsx

key-decisions:
  - "Year step slots into the reserved Model->Category seam (Pitfall 7 paid off — pickModel now advances to year, no sibling rewrite)"
  - "Year is optional everywhere: Any year + See results both runnable on the year step; /browse Year defaults to All years"
  - "Single `year` param (the buyer's truck year), independent of Make/Model — no cascade, no dependents to clear"
  - "Year chip sits between Model and Category in the welcome summary; removal rewinds to the year step and clears year only"

patterns-established:
  - "Optional ungated picker reusing the existing skip-affordance + shared seeResults pattern from the category step"

requirements-completed: [FITL-05, SRCH-03]

# Metrics
duration: ~3min
completed: 2026-06-18
---

# Phase 16 Plan 06: Year in Search UIs Summary

**Surfaced the Year dimension (shipped in 16-05) in both buyer search surfaces — an optional Year step in the welcome explorer's reserved Model->Category seam and a Year facet on /browse — both writing the single `year` URL param from the shared yearOptions().**

## Performance

- **Duration:** ~3 min (implementation)
- **Started:** 2026-06-18T16:41 (commit window)
- **Completed:** 2026-06-18 (verified + approved at checkpoint)
- **Tasks:** 3 (2 implementation + 1 human-verify checkpoint)
- **Files modified:** 3

## Accomplishments
- Inserted an OPTIONAL **Year** step in the welcome explorer between Model and Category — the machine is now `Make -> Model -> Year(optional) -> Category -> Advanced`. `pickModel` advances to the new `year` step (the documented seam); the step renders `yearOptions()` plus an "Any year" skip AND the shared `seeResults` button so search stays runnable without a year.
- Wired Year into `runSearch`: the chosen year sets the single `year` param; skipping omits it. Added a Year chip to the YOUR SEARCH summary (between Model and Category); its removal clears year only and rewinds to the year step.
- Reset discipline: changing Make or Model clears the chosen year (and everything below).
- Added a Year `<Select>` to `FacetControls` after Model (before Configuration) — one edit covers the desktop sidebar AND the mobile Filters sheet (both render the same `FacetControls` body). Always enabled (independent of Make/Model), "All years" clears the param, no dependents.
- Added a Year active-filter chip on `/browse` (`Year: <n>`, removal key `["year"]`) — `active-filter-chips.tsx` needed no edit (keys array carried on the chip in page.tsx).

## Task Commits

1. **Task 1: Welcome explorer Year step** - `3728424` (feat)
2. **Task 2: /browse Year facet + chip** - `8d5ee66` (feat)
3. **Task 3: Human-verify checkpoint** - approved (no commit)

## Files Created/Modified
- `components/welcome/welcome-explorer.tsx` - `"year"` added to the Step union between model and category; `pickModel`/`skipModel` advance to the year step; `pickYear`/`skipYear`/`removeYear` handlers; year chip; `runSearch` sets the `year` param; imports `yearOptions` from `@/lib/listings/years`
- `components/search/facet-sidebar.tsx` - Year `<Select>` in `FacetControls` after Model, init from the `year` param, set/delete `year` via the shared `applyFacet`/`setOrDelete` idiom; imports `yearOptions`
- `app/(public)/browse/page.tsx` - reads `query.year` and pushes a `Year: <n>` active-filter chip with removal key `["year"]`

## Decisions Made
- The Year step lands in the reserved Model->Category hop kept isolated by 16-03 (Pitfall 7) — adding it required no sibling rewrite, just `pickModel` advancing to `year` instead of `category`.
- Year is optional on every surface: the welcome step offers both "Any year" and "See results"; the /browse facet defaults to "All years".
- A single `year` param (the buyer's truck year) is independent of Make/Model — no cascade, no dependent keys to clear, always-enabled select.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both buyer search surfaces now expose Year, filling the reserved seam. 16-07 (create/edit listing year inputs writing `year_start`/`year_end`) is the last Year plan; once it seeds ranged listings on Staging, the range arm of 16-05's integration test activates.

---
*Phase: 16-part-taxonomy-guided-cascade*
*Completed: 2026-06-18*

## Self-Check: PASSED

All 3 modified files verified on disk; both task commits (3728424, 8d5ee66) verified in git log.
