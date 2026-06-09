---
phase: 06-fitment-intelligence
plan: 04
subsystem: ui
tags: [react, nextjs, shadcn, fitment, suggestions, listing-form, rhf]

# Dependency graph
requires:
  - phase: 06-fitment-intelligence (06-02)
    provides: getPartCategories(), listing_categories/listing_search_terms persistence, ListingFormDefaults extension, getListing categories[]/searchTerms[] read-back
  - phase: 06-fitment-intelligence (06-03)
    provides: suggestFitment() "use server" engine + lib/fitment/types.ts (SuggestedFitment/SuggestedTag/SuggestionGroup)
  - phase: 05-listings-photos-exif-safe-storage (05-04)
    provides: components/listings/listing-form.tsx (RHF + zodResolver(listingSchema) sectioned create/edit form, setFitment+form.setValue single-source path)
provides:
  - Part-Category single-select trigger in the listing form's Fitment section
  - Real-time debounced grouped suggestion chips ("From your garage" / "Common for <Category>") via suggestFitment
  - One-click accept / Add-all / session-only dismiss with the FINT-02 guarantee (NO useEffect ever mutates confirmed state)
  - A subtle loading skeleton (useTransition) that keeps the input responsive
  - Edit-mode pre-fill of persisted categories + search-term tags that survive re-save and are excluded from re-suggestion
  - vendored shadcn Skeleton
affects: [07-search-feed-public-profile, 08-social-layer]

# Tech tracking
tech-stack:
  added: [shadcn Skeleton]
  patterns:
    - "FINT-02 no-auto-apply: a top-of-file invariant comment + grep gate forbids any useEffect in fitment-suggestions.tsx that mutates parent state; acceptance happens ONLY in click handlers"
    - "Single-select Part Category (UI) backed by an M2M store (categoryIds=[id]) — UI single, storage many — with REPLACE (not accumulate) semantics on both the dropdown and onAcceptTag(category)"
    - "Persisted slang tags pre-fill as SuggestedTag[] (kind+id+name) so they render as confirmed chips, survive updateListing replace-children, AND are excluded from re-suggestion"

key-files:
  created:
    - components/ui/skeleton.tsx
    - components/listings/fitment-suggestions.tsx
  modified:
    - components/listings/listing-form.tsx
    - app/(app)/sell/page.tsx
    - app/(app)/sell/[id]/edit/page.tsx

key-decisions:
  - "ONE part category per listing (single-select v1) — accepting/choosing a category REPLACES the previous one; accumulation was a UAT bug"
  - "Persisted search-term tags pre-fill with names (SuggestedTag[]), not bare ids — bare ids couldn't render or re-submit, so the term was silently dropped on edit-save"

patterns-established:
  - "FINT-02 enforced in code (no auto-apply effect) and verified by grep + the live human-verify checkpoint"
  - "Edit pre-fill must carry enough to RENDER + RE-SUBMIT confirmed children, not just enough to de-dupe suggestions (replace-children on update otherwise drops them)"

requirements-completed: [FINT-01, FINT-02]

# Metrics
duration: build + live UAT (2026-06-09)
completed: 2026-06-09
---

# Phase 6 Plan 04: Fitment Intelligence Suggestion UI Summary

**Wired the live FINT-01/02 seller experience onto the Phase-5 listing form: a Part-Category trigger select, real-time grouped suggestion chips ("From your garage" / "Common for <Category>") via `suggestFitment`, one-click accept / Add-all / session-dismiss, and the hard FINT-02 guarantee that nothing enters confirmed state without an explicit click — user-approved at the live checkpoint after three real UAT bugs were fixed.**

## Performance

- **Duration:** build + live UAT (2026-06-09)
- **Completed:** 2026-06-09
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- FINT-01: the seller sees suggested trucks/configs/categories while creating a listing, grouped and explained by source ("From your garage" / "Common for <Category>"), fetched real-time (debounced + `useTransition`) with a subtle loading skeleton.
- FINT-02: no suggestion enters the confirmed-fitment list without an explicit seller click — the single `setFitment`+`form.setValue` path is the only entry, with NO `useEffect` that auto-applies (enforced in code + grep-gated + live-verified).
- Confirmed categories + search terms persist and surface on the public listing (FINT-03 visible now), and edit mode pre-fills them without re-suggesting.
- Live end-to-end flow (create → garage/category suggestions → accept/add-all/dismiss → publish → public read-back → edit pre-fill → Barnyard) user-approved at the Task-3 human-verify checkpoint.

## Task Commits

1. **Task 1: Vendor Skeleton + grouped suggestions component (no auto-apply)** — `882a2d5` (feat)
2. **Task 2: Wire Part-Category trigger + suggestions into listing-form.tsx** — `c53a788` (feat)
3. **Task 3: Human verification of the live flow** — checkpoint (user-approved "approved")
4. **Checkpoint UAT fixes** — `10bbf42` (fix)

## Files Created/Modified
- `components/ui/skeleton.tsx` (created) - vendored shadcn Skeleton for the suggestions loading state.
- `components/listings/fitment-suggestions.tsx` (created) - grouped-chips suggestions zone (accept / add-all / dismiss + skeleton + empty-state); FINT-02 no-effect invariant comment at top; NO `useEffect`.
- `components/listings/listing-form.tsx` (modified) - Part-Category single-select trigger, the ONLY debounced suggest effect (sets `suggestions`, never `fitment`), accept/add-all/dismiss handlers routing through the existing `setFitment`+`form.setValue` path, `categoryIds`/`searchTerms` state + submit payload; UAT fixes for tag pre-fill + single-category replace.
- `app/(app)/sell/page.tsx` (modified) - calls `getPartCategories()` and passes `partCategories` into the create form.
- `app/(app)/sell/[id]/edit/page.tsx` (modified) - now selects `listing_search_terms ( term_id, search_terms:term_id ( term ) )` and maps to `searchTerms: SuggestedTag[]` defaults so persisted slang tags render + survive re-save.

## Decisions Made

- **ONE part category per listing (single-select, v1).** The Part-category control is a single-select dropdown; both the dropdown's `onValueChange` and `onAcceptTag` for `kind==="category"` now do REPLACE (`setCategoryIds([id])`), not accumulate. Storage stays M2M (`listing_categories`) so a future multi-category move is non-breaking, but the UI and accept path commit exactly one. (User-decided at the live checkpoint after observing the accumulation bug.)
- **Persisted search-term tags pre-fill WITH names+kind (`SuggestedTag[]`), not bare ids.** Bare ids cannot render a chip or re-submit the tag, so `updateListing`'s replace-children silently dropped the term on edit-save. The edit page now resolves the term name via a PostgREST embed (`search_terms:term_id ( term )`) and seeds the form's `searchTerms` state from it.

## Deviations from Plan

The plan's Tasks 1-2 executed as written; the three deviations below were surfaced LIVE at the Task-3 human-verify checkpoint and fixed before the user approved. All three are must-have violations of this plan's own truths ("Edit mode pre-fills persisted categories/terms and does not re-suggest them" / "Accepted categories/search-terms submit so they persist").

### Auto-fixed Issues

**1. [Rule 1 - Bug] Search-term tags lost on edit-save (data loss)**
- **Found during:** Task 3 (live human-verify, edit flow)
- **Issue:** The edit page read `listing_search_terms ( term_id )` (ids only). The form's `searchTerms` state needs `SuggestedTag` (id+kind+name), so in edit mode it started empty — a persisted tag like "Large Car" never rendered as a confirmed chip AND submitted as `searchTermIds=[]`, so `updateListing`'s replace-children DROPPED it.
- **Fix:** Edit page now selects `listing_search_terms ( term_id, search_terms:term_id ( term ) )` and maps to a `searchTerms: SuggestedTag[]` default (`kind:"search_term"`, id, name). `ListingFormDefaults` changed `searchTermIds?: number[]` → `searchTerms?: SuggestedTag[]`; the form seeds its `searchTerms` state from that default.
- **Files modified:** app/(app)/sell/[id]/edit/page.tsx, components/listings/listing-form.tsx
- **Verification:** tsc clean; live edit flow re-opened with the persisted tag rendering as a removable chip and surviving save (user-approved).
- **Committed in:** 10bbf42

**2. [Rule 1 - Bug] Confirmed search-terms re-suggested in edit mode**
- **Found during:** Task 3 (live human-verify, edit flow)
- **Issue:** Same root cause as #1 — because `searchTerms` started empty in edit mode, the suggestion filter (which excludes terms already in `searchTerms`) didn't exclude already-confirmed terms, so they reappeared as fresh suggestions.
- **Fix:** Resolved by the same pre-fill as #1 — the filter now sees the pre-filled `searchTerms` and excludes confirmed terms.
- **Files modified:** components/listings/listing-form.tsx (same edit)
- **Verification:** Live edit flow no longer re-suggested confirmed terms (user-approved).
- **Committed in:** 10bbf42

**3. [Rule 1 - Bug] Part categories accumulated instead of replacing (wrong-data / bad-search)**
- **Found during:** Task 3 (live human-verify, create flow)
- **Issue:** The Part-category dropdown is single-select, but `onValueChange` did `setCategoryIds(prev => [...prev, id])`, so changing the category ADDED another — a listing ended up tagged Body&Cab + Bumpers + Grilles when the user intended one. `onAcceptTag(category)` had the same accumulation.
- **Fix:** Dropdown now does `setCategoryIds([id])`; `onAcceptTag` for `kind==="category"` now does `setCategoryId(t.id); setCategoryIds([t.id])` (mirrors the dropdown). Deliberate scope decision: ONE category per listing (single-select v1) — see Decisions.
- **Files modified:** components/listings/listing-form.tsx
- **Verification:** tsc clean; live create flow now replaces the category on each change (user-approved).
- **Committed in:** 10bbf42

---

**Total deviations:** 3 auto-fixed (3 Rule-1 bugs, all surfaced at the live checkpoint).
**Impact on plan:** All three were correctness fixes to already-committed Task-1/2 files and directly satisfy this plan's own must-have truths (edit pre-fill, persistence). The single-category-v1 outcome is a deliberate, user-approved scope decision (storage stays M2M, non-breaking). No scope creep.

## Issues Encountered

- The husky/lint-staged stash/restore parallel-attribution hazard is a known repo risk; this plan's fix commit was verified by file-on-disk (`git show --stat 10bbf42` = exactly the two intended files, no cross-attribution).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- FINT-01/02 are live and user-approved; FINT-03 is visible on the public listing page. Phase 6 plans complete (4/4).
- Phase 7 (Search/Feed/Public Profile) consumes the persisted `listing_categories`/`listing_search_terms` and the `search_synonyms`/FTS surface; the suggestion engine (`suggestFitment`) and the seeded `fitment_rules` remain extensible.
- Open concern (carried from STATE): Fitment Intelligence precision/recall is still unproven — a "report wrong fitment" feedback loop is needed to calibrate post-launch.

## Self-Check: PASSED

- All 6 key files present on disk (skeleton.tsx, fitment-suggestions.tsx, listing-form.tsx, sell/page.tsx, sell/[id]/edit/page.tsx, 06-04-SUMMARY.md).
- All 3 commits present in git (882a2d5, c53a788, 10bbf42).
- FINT-02 grep gate green: no `useEffect` in `fitment-suggestions.tsx` (NO-EFFECT-OK).
- `npx tsc --noEmit` clean.

---
*Phase: 06-fitment-intelligence*
*Completed: 2026-06-09*
