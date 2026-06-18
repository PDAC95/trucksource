---
phase: 16-part-taxonomy-guided-cascade
plan: 03
subsystem: ui
tags: [welcome, landing, cascade, taxonomy, search, url-state, nextjs]

# Dependency graph
requires:
  - phase: 16-part-taxonomy-guided-cascade
    provides: "getChildCategories + getRootCategories single-level cascade readers + CategoryOption type (Plan 16-02)"
  - phase: 16-part-taxonomy-guided-cascade
    provides: "subtree-match search_listings RPC: a single deepest category id expands to all leaf-tagged descendants (Plan 16-01)"
provides:
  - "Welcome explorer reworked into a guided drill: Make -> Model -> (search now) -> Category(root) -> Advanced(Subcategory -> Item + Condition)"
  - "Category is an OPTIONAL refinement, not a gate: 'See results' is live the moment Make + Model are set (Condition + See results shared by the category and advanced steps)"
  - "runSearch emits a SINGLE deepest `category` id (item ?? subcategory ?? rootCategory) or omits the param entirely; subtree RPC expands it"
  - "Single-deepest category chip: one chip shows the deepest chosen level's name and updates as the user narrows; removal clears the whole category selection"
affects: [welcome-landing, search]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "On-demand single-level child loading on a client step machine (getChildCategories per level); parent change clears every dependent level below it"
    - "Single RPC-facing deepest id drives subtree search; no separate subcategory/item URL params (params.ts has none)"
    - "Optional-refinement gate lifted: shared Condition picker + See results button render on both the category and advanced steps so search never blocks on category"
    - "Isolated Model -> Category seam (no fused handler) so a future Year step slots in without rewriting siblings (Pitfall 7)"

key-files:
  created: []
  modified:
    - "components/welcome/welcome-explorer.tsx — full step-machine rework (make|model|category|advanced); 3-level rootCategory/subcategory/item drill; getChildCategories loaders; single deepest `category` emit; single-deepest chip"
    - "app/(public)/page.tsx — getPartCategories() swapped for getRootCategories(); explorer prop renamed partCategories -> rootCategories; unused getPartCategories import dropped"

key-decisions:
  - "Configuration step REMOVED from the welcome flow (config remains a /browse facet, just not a welcome step); getConfigs import dropped from the explorer"
  - "Category is optional, not a gate: the dd5b81e fix lifted the Condition picker + 'See results' out of the advanced step into shared elements rendered on BOTH the category and advanced steps, so Make + Model alone can run a search"
  - "runSearch emits one `category` param = deepest chosen id (item, else subcategory, else root); if no category chosen the param is omitted entirely — the Plan 01 subtree RPC expands whatever single id it gets"
  - "Single-deepest category chip (confirmed by user): exactly one chip labels the deepest committed level and updates as the user narrows; its removal (removeRootCategory) clears root+subcategory+item and rewinds to the category step"
  - "Model -> Category hop kept as an isolated handler (pickModel/skipModel both set step 'category', no config load) so a Year step can be inserted between Model and Category without touching sibling steps (Pitfall 7 seam preserved)"

patterns-established:
  - "Landing-page guided drill where each level owns its advance/reset, children load one level at a time, and the deepest single id is the only search-facing value"

requirements-completed: [FITL-05, SRCH-03]

# Metrics
duration: ~6min
completed: 2026-06-18
---

# Phase 16 Plan 03: Welcome Explorer Guided Cascade Summary

**The welcome explorer is now a guided drill — Make -> Model -> (search now) -> Category(root) -> Advanced(Subcategory -> Item + Condition) — where Category is an optional refinement (Make + Model alone can search), children load one level at a time via getChildCategories, the search emits a SINGLE deepest `category` id (or omits it), and a single chip shows the deepest chosen category level and updates as the user narrows.**

## Performance

- **Duration:** ~6 min (implementation session + this finalization after the human-verify checkpoint)
- **Tasks:** 2 implementation tasks + 1 human-verify checkpoint
- **Files modified:** 2

## Final Step machine

```
type Step = "make" | "model" | "category" | "advanced";
```

| Step       | Heading                  | Renders                                                                 |
| ---------- | ------------------------ | ---------------------------------------------------------------------- |
| `make`     | Browse by brand          | Brand grid (pickMake -> loads models -> step "model")                  |
| `model`    | Pick a {make} model      | Model grid + "Any model" (pickModel/skipModel -> step "category")      |
| `category` | Pick a category          | Root-category grid + **Condition picker + See results** (optional)     |
| `advanced` | Refine your search       | Subcategory grid -> Item grid (on demand) + Condition picker + See results |

The Configuration step was removed from the welcome flow (it remains a /browse facet, just not a welcome step); `getConfigs` is no longer imported here.

## How the deepest `category` id is resolved

```ts
const deepestCategory = item ?? subcategory ?? rootCategory;
// runSearch:
if (deepestCategory) params.set("category", String(deepestCategory.id));
```

The search emits exactly one `category` param set to the deepest committed level, or omits the param entirely when no category was chosen. There are no separate subcategory/item params — the Plan 01 subtree-match RPC expands whichever single id it receives to all leaf-tagged descendants. `lib/search/params.ts` has no subcategory/item keys, so no new keys were invented.

## The dd5b81e fix — Category made optional (not a gate)

The first cut put Condition + "See results" only inside the advanced step, which forced the user through a category pick before they could search. The fix lifted both into shared elements:

- `conditionPicker` and `seeResults` are defined once and rendered on **both** the `category` step and the `advanced` step.
- This makes "See results" live the moment Make + Model are set, so **Make -> Model -> See results works with no category** (the param is simply omitted).
- Optional Category -> Subcategory -> Item drilling narrows the same single `category` id when the user chooses to refine.

## Single-deepest category chip (user-confirmed)

The left panel shows make, model, condition, and **exactly one** category chip:

```ts
if (deepestCategory)
  chips.push({ key: "category", label: deepestCategory.name, onRemove: removeRootCategory });
```

The chip labels the deepest chosen level (e.g. "Driver Side Fuel Tanks") and updates as the user narrows root -> subcategory -> item. The user verified and confirmed this single-deepest-chip design is correct. Removing it (`removeRootCategory`) clears root + subcategory + item + their loaded lists and rewinds to the category step.

## Reset discipline (parent change clears dependents)

- `removeMake` -> clears make/model/all three category levels/condition + all lists, step "make".
- `removeModel` -> clears model + all three category levels + condition + category lists, step "category".
- `removeRootCategory` -> clears root+subcategory+item+lists, step "category".
- `removeSubcategory` -> clears subcategory+item+items list.
- `removeItem` -> clears item.
- `back()`: model -> removeMake, category -> removeModel, advanced -> removeRootCategory.
- `pickRootCategory`/`pickSubcategory` clear the dependent level(s) before loading new children, so stale dependents can never survive a parent change.

## Preserved Model -> Category seam (Year-step ready)

`pickModel` and `skipModel` both just set step "category" with no config load — the Model -> Category hop is a single isolated handler. A future Year step can be inserted between "model" and "category" without rewriting any sibling step (Pitfall 7). Each step owns its own advance/reset.

## Task Commits

1. **Task 1: Rework the welcome-explorer step machine to the 3-level category drill** - `b8434ab` (feat) — `components/welcome/welcome-explorer.tsx`
2. **Task 2: Feed root categories into the explorer from the welcome page** - `e208557` (feat) — `app/(public)/page.tsx`
3. **Fix (checkpoint follow-up): make See results available right after Make + Model** - `dd5b81e` (fix) — `components/welcome/welcome-explorer.tsx`

**Plan metadata:** (docs commit follows this summary)

## Files Created/Modified

- `components/welcome/welcome-explorer.tsx` - Full step-machine rework to make|model|category|advanced; 3-level rootCategory/subcategory/item drill with on-demand getChildCategories loaders; single deepest `category` emit; shared Condition + See results; single-deepest chip; preserved Year-step seam.
- `app/(public)/page.tsx` - Swapped `getPartCategories()` for `getRootCategories()`, renamed the explorer prop `partCategories` -> `rootCategories`, dropped the now-unused `getPartCategories` import (still used by create-listing).

## Decisions Made

- Configuration step removed from the welcome flow (stays a /browse facet).
- Category is an optional refinement, not a gate — Condition + See results shared across the category and advanced steps (dd5b81e).
- Single `category` param = deepest chosen id, or omitted; no subcategory/item params.
- One category chip showing the deepest level, updating as the user narrows (user-confirmed).
- Model -> Category seam kept isolated for a future Year step.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Category step gated search instead of refining it**
- **Found during:** Task 3 (human-verify checkpoint feedback)
- **Issue:** The initial rework placed the Condition picker and "See results" only inside the advanced step, so a user could not search after Make + Model without first choosing a category — contradicting the plan's "(search now)" seam intent and the optional-refinement model.
- **Fix:** Lifted `conditionPicker` and `seeResults` into shared elements rendered on both the category and advanced steps; runSearch already omits the `category` param when none is chosen.
- **Files modified:** `components/welcome/welcome-explorer.tsx`
- **Commit:** `dd5b81e`

## Issues Encountered

None outstanding. `npx tsc --noEmit` and `npx next build` passed during execution. Human-verify checkpoint (Task 3) approved by the user, who confirmed: Make -> Model -> See results works with no category; optional Category -> Subcategory -> Item narrows; a single category chip shows the deepest chosen level and updates as you narrow.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 16 (Part Taxonomy & Guided Cascade) is functionally complete: 16-01 (taxonomy data + subtree RPC), 16-02 (cascade readers), 16-03 (welcome explorer cascade), 16-04 (/browse facet cascade) all landed.
- Year step is deferred to its own later phase; the Model -> Category seam is preserved for it.
- No blockers from this plan.

## Self-Check: PASSED

- FOUND: components/welcome/welcome-explorer.tsx
- FOUND: app/(public)/page.tsx
- FOUND: 16-03-SUMMARY.md
- FOUND: commit b8434ab
- FOUND: commit e208557
- FOUND: commit dd5b81e

---
*Phase: 16-part-taxonomy-guided-cascade*
*Completed: 2026-06-18*
