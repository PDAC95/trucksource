---
phase: 16-part-taxonomy-guided-cascade
plan: 04
subsystem: ui
tags: [search, browse, facets, cascade, taxonomy, url-state, nextjs]

# Dependency graph
requires:
  - phase: 16-part-taxonomy-guided-cascade
    provides: "getChildCategories + getRootCategories single-level cascade readers + CategoryOption type (Plan 16-02)"
  - phase: 16-part-taxonomy-guided-cascade
    provides: "subtree-match search_listings RPC: a single deepest category id expands to all leaf-tagged descendants (Plan 16-01)"
provides:
  - "/browse Category facet as three dependent selects (Category root -> Subcategory -> Item), URL-synced, shared by desktop sidebar + mobile sheet via FacetControls"
  - "URL key scheme: `category` always = deepest chosen id (RPC-facing); `root`/`subcategory`/`item` are UI-only memory of which selects are chosen"
  - "resolveCategoryLabel(supabase, categoryId): walks part_categories parents to render the deepest node with ancestor context (e.g. 'Fuel Tanks › Driver Side Fuel Tanks')"
  - "Category active-filter chip whose removal clears all four category keys (category/root/subcategory/item)"
affects: [browse, search-facets, mobile-filter-sheet]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dependent-select cascade on the results page mirrors the existing Make->Model->Config idiom (active-guarded useEffect loaders keyed on parent id; applyFacet clears fits + page)"
    - "Single RPC-facing id (deepest of root/subcategory/item) drives subtree search; helper URL keys exist only to rehydrate which selects are chosen on reload"
    - "Context-bearing chip label resolved server-side by walking parent_id chain (Pitfall 6: shared URL must be unambiguous)"

key-files:
  created: []
  modified:
    - "components/search/facet-sidebar.tsx — replaced flat Category select with Category->Subcategory->Item dependent selects in FacetControls; props now take rootCategories; getChildCategories loaders"
    - "components/search/browse-toolbar-mobile.tsx — inherits the reworked FacetControls body; prop name updated to rootCategories (mobile sheet covered by the same edit)"
    - "app/(public)/browse/page.tsx — getRootCategories feeds both facet surfaces; resolveCategoryLabel renders context-bearing chip; chip removal clears category/root/subcategory/item"

key-decisions:
  - "URL contract: `category` holds the DEEPEST chosen id (RPC-facing, subtree-expanded by Plan 01); `root`/`subcategory`/`item` are UI-only helper keys to remember chosen selects and drive dependent loading — the RPC never reads them"
  - "Each parent-select change deletes its dependent keys (root change clears subcategory+item; subcategory change clears item) and recomputes `category` to the new deepest, so the URL never holds a stale combination"
  - "Chip label resolved server-side via resolveCategoryLabel walking up to 2 parents and rendering deepest-LAST with ' › ' separators; a leaf shows >=2 levels, a root shows just its name (Pitfall 6)"
  - "active-filter-chips.tsx needed NO edit — it already deletes whatever `keys` array a chip carries; the four-key removal list is set on the chip in page.tsx"

patterns-established:
  - "Results-page dependent facet cascade with a single canonical RPC id + UI-only memory keys, reused across desktop sidebar and mobile sheet through one shared FacetControls body"

requirements-completed: [FITL-05, SRCH-03, FINT-03]

# Metrics
duration: ~12min
completed: 2026-06-18
---

# Phase 16 Plan 04: /browse Three-Level Category Facet Summary

**The /browse Category facet is now three dependent selects (Category root -> Subcategory -> Item) sharing one canonical `category` URL id (deepest chosen, subtree-expanded by the Plan 01 RPC) plus UI-only `root`/`subcategory`/`item` helper keys; one FacetControls edit covers desktop sidebar and mobile sheet, and the active-filter chip shows ancestor context and clears the whole cascade on removal.**

## Performance

- **Duration:** ~12 min (across the implementation session + this finalization after the human-verify checkpoint)
- **Tasks:** 2 implementation tasks + 1 human-verify checkpoint
- **Files modified:** 3

## Accomplishments
- Reworked the flat Category `<Select>` in `FacetControls` into three dependent selects mirroring the Make->Model->Config cascade idiom (active-guarded `getChildCategories` loaders keyed on the chosen parent id)
- Wired `getRootCategories()` into the page and passed `rootCategories` to both `<FacetSidebar>` and `<BrowseToolbarMobile>` — the mobile filter sheet inherits the cascade through the same shared body, no separate edit
- Established the URL key scheme: `category` = deepest chosen id (RPC-facing); `root`/`subcategory`/`item` = UI-only memory of which selects are chosen
- Parent-select changes delete their dependent keys and recompute `category`, so the URL never holds a stale root/subcategory/item combination
- Added `resolveCategoryLabel` to render a context-bearing chip (e.g. "Fuel Tanks › Driver Side Fuel Tanks") and set the chip's removal `keys` to all four category keys

## URL key scheme (final)

| Key           | Read by RPC? | Purpose                                                                 |
| ------------- | ------------ | ---------------------------------------------------------------------- |
| `category`    | YES          | The DEEPEST chosen id; subtree-expanded by the Plan 01 RPC             |
| `root`        | no (UI-only) | Remembers the chosen root select on reload; drives subcategory loading |
| `subcategory` | no (UI-only) | Remembers the chosen subcategory; drives item loading                  |
| `item`        | no (UI-only) | Remembers the chosen item (leaf)                                       |

`category` always equals the deepest of `{root, subcategory, item}`. Picking only a root still returns all descendant leaf-tagged listings via the subtree match.

## Chip-label resolution

`resolveCategoryLabel(supabase, categoryId)` selects `id, name, parent_id` for the deepest id and walks up to 2 parents, rendering the chain deepest-LAST with `" › "` separators. A leaf shows at least 2 levels so a shared URL is unambiguous (Pitfall 6); a root shows just its own name. Best-effort — falls back gracefully if a parent lookup misses.

## active-filter-chips.tsx — no edit needed

The chip component already deletes whatever `keys` array each chip carries, so the four-key category removal (`["category", "root", "subcategory", "item"]`) is configured on the chip in `page.tsx`. The file was listed in the plan only for the removal-coverage check and was left untouched — commit 98f0d4b touched only `page.tsx`.

## Task Commits

1. **Task 1: Rework Category facet into Category->Subcategory->Item cascade** - `3437c0d` (feat) — `facet-sidebar.tsx`, `browse-toolbar-mobile.tsx`
2. **Task 2: Feed root categories to /browse facets + context-bearing chip** - `98f0d4b` (feat) — `app/(public)/browse/page.tsx`

**Plan metadata:** (docs commit follows this summary)

## Files Created/Modified
- `components/search/facet-sidebar.tsx` - Three dependent category selects in `FacetControls`; props take `rootCategories`; `getChildCategories` loaders; per-level applyFacet handlers that delete dependent keys and recompute the deepest `category`
- `components/search/browse-toolbar-mobile.tsx` - Inherits the reworked `FacetControls` body; prop name updated to `rootCategories` (mobile sheet covered by the same edit)
- `app/(public)/browse/page.tsx` - `getRootCategories` feeds both facet surfaces; `resolveCategoryLabel` renders the context-bearing chip; category chip removal clears all four keys

## Decisions Made
- `category` is the single RPC-facing id (deepest chosen); `root`/`subcategory`/`item` are UI-only helper keys — keeps the subtree-match contract from Plan 01 intact while remembering select state across reloads.
- Parent change always clears dependents and recomputes the deepest id (no stale URL combinations).
- Chip label resolved server-side with ancestor context (Pitfall 6); `active-filter-chips.tsx` needed no change.

## Deviations from Plan
None - plan executed exactly as written. (The plan anticipated `active-filter-chips.tsx` likely needing no edit; confirmed — no logic change required, four-key removal set on the chip in the page.)

## Issues Encountered
None. `npx tsc --noEmit` passes clean on the combined working tree (orchestrator confirmed). Human-verify checkpoint (Task 3) approved by the user.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 16 (Part Taxonomy & Guided Cascade) is functionally complete: 16-01 (taxonomy data + subtree RPC), 16-02 (cascade readers), 16-03 (welcome explorer cascade), 16-04 (/browse facet cascade) all landed.
- No blockers from this plan.

## Self-Check: PASSED

- FOUND: components/search/facet-sidebar.tsx
- FOUND: app/(public)/browse/page.tsx
- FOUND: components/search/browse-toolbar-mobile.tsx
- FOUND: 16-04-SUMMARY.md
- FOUND: commit 3437c0d
- FOUND: commit 98f0d4b

---
*Phase: 16-part-taxonomy-guided-cascade*
*Completed: 2026-06-18*
