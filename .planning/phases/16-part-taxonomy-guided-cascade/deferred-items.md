# Phase 16 — Deferred / Out-of-Scope Items

## Plan 16-03 (welcome explorer guided cascade)

### Parallel-wave tsc/build collision (NOT a 16-03 defect)

- **When:** Task 2 verify (2026-06-18).
- **What:** `npx tsc --noEmit` and `npx next build` fail with type errors in
  `components/search/facet-sidebar.tsx` and `components/search/browse-toolbar-mobile.tsx`.
  Errors: `partCategories` prop no longer exists (renamed `rootCategories`),
  `categoryId`/`PartCategoryOption` not found.
- **Why out of scope:** Those two files are owned by **Plan 16-04**, which runs in
  PARALLEL with 16-03 in the same working tree. They are mid-flight, uncommitted
  edits from the 16-04 agent. The 16-03 notes explicitly scope this plan to
  `components/welcome/welcome-explorer.tsx` and `app/(public)/page.tsx` only, and
  warn that 16-04 edits the search facet files concurrently.
- **16-03 scope status:** Both 16-03 files (`welcome-explorer.tsx`, `page.tsx`) are
  type-clean — `npx tsc --noEmit | grep -E "welcome-explorer|\(public\)/page"`
  returns nothing. The full build will go green once 16-04 lands its facet rework.
- **Owner:** Plan 16-04 (will resolve as part of its own verification).
- **Action taken:** None. Did not touch 16-04 files (would cause a collision).
