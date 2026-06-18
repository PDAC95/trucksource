---
phase: 16-part-taxonomy-guided-cascade
plan: 02
subsystem: api
tags: [supabase, cascade, taxonomy, server-readers, postgres]

# Dependency graph
requires:
  - phase: 16-part-taxonomy-guided-cascade
    provides: "taxonomy v2 (3-level part_categories tree: root -> subcategory -> item) seeded on Staging by Plan 16-01"
provides:
  - "getChildCategories(parentId): single-level reader returning direct active children of a category node, alphabetical, id+name only"
  - "getRootCategories(): single-level reader returning active root categories (parent_id null), alphabetical, id+name only"
  - "Exported CategoryOption type ({ id: number; name: string }) — the shape Plans 03/04 import"
affects: [16-03, 16-04, welcome-explorer, browse-facets]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-level cascade readers walk the taxonomy one level at a time (root -> subcategory -> item) instead of a flat list"
    - "Mirror the garage CascadeOption posture: cookie-bound server client, is_active picker filter, .order(name), id+name only, [] on error"

key-files:
  created: []
  modified:
    - "lib/listings/cascade.ts — appended getChildCategories + getRootCategories + exported CategoryOption type"

key-decisions:
  - "New readers return a local exported CategoryOption type ({ id; name }), NOT a re-export of garage CascadeOption — avoids a cross-module duplicate while keeping the same shape"
  - "getPartCategories left untouched — create-listing picker still consumes its flat 2-level list"
  - "Resolve roots by NAME in calling code (Plans 03/04); category ids are environment-specific per Plan 16-01"

patterns-established:
  - "Per-level cascade reader: int guard on the id arg (getChildCategories), is_active=true picker filter, .order(\"name\"), [] on error, expose only id+name"

requirements-completed: [FITL-05, SRCH-03]

# Metrics
duration: ~2min
completed: 2026-06-18
---

# Phase 16 Plan 02: Cascade Single-Level Readers Summary

**Two server readers (getChildCategories, getRootCategories) that walk the 3-level part taxonomy one level at a time, returning active id+name options — the shared contract Plans 03/04 build their dependent-select cascades against.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-18T14:43:29Z
- **Completed:** 2026-06-18T14:44:17Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `getChildCategories(parentId)` — direct active children of any node (root -> subcategory -> item), int-guarded, alphabetical, [] on error
- Added `getRootCategories()` — active roots (parent_id null), alphabetical, [] on error
- Exported `CategoryOption = { id: number; name: string }` for Plans 03/04 to import
- Both readers mirror the garage `CascadeOption` trust posture exactly (cookie-bound server client, is_active picker filter, id+name only)

## Exported signatures (for Plans 03/04)

```ts
// lib/listings/cascade.ts
export type CategoryOption = { id: number; name: string };
export async function getChildCategories(parentId: number): Promise<CategoryOption[]>;
export async function getRootCategories(): Promise<CategoryOption[]>;
```

Import the `CategoryOption` symbol from `@/lib/listings/cascade` (do NOT import `CascadeOption` from garage for these).

## Task Commits

1. **Task 1: Add getChildCategories + getRootCategories** - `b31d89f` (feat)

**Plan metadata:** (docs commit follows this summary)

## Files Created/Modified
- `lib/listings/cascade.ts` - Appended the two single-level cascade readers and the exported `CategoryOption` type beside the existing `getConditions` / `getPartCategories`

## Decisions Made
- Used a local exported `CategoryOption` type rather than re-exporting garage `CascadeOption` (same shape, no cross-module duplicate) — matches the plan's instruction.
- Left `getPartCategories` unchanged; the create-listing picker still needs its flat parentId-bearing list.
- ids stay environment-specific — Plans 03/04 resolve roots by name (carried over from Plan 16-01 decision).

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. `npx tsc --noEmit` clean; pre-commit lint-staged (eslint + prettier) passed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plans 16-03 (welcome explorer cascade) and 16-04 (/browse facets) can now fetch one taxonomy level at a time via `getChildCategories` / `getRootCategories`.
- No blockers.

## Self-Check: PASSED

- FOUND: lib/listings/cascade.ts
- FOUND: 16-02-SUMMARY.md
- FOUND: commit b31d89f

---
*Phase: 16-part-taxonomy-guided-cascade*
*Completed: 2026-06-18*
