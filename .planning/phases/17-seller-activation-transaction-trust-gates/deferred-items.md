# Phase 17 — Deferred Items

Out-of-scope discoveries logged during execution (NOT fixed here — they are not
caused by Phase 17's changes; see the GSD scope boundary).

## 1. `e2e/home.spec.ts:22` — stale `/browse` heading assertion (Phase 16 drift)

- **Found during:** Plan 17-07, Task 2 (full-suite regression gate).
- **What:** The working-tree-modified (uncommitted) `home.spec.ts` adds a
  `browse all parts routes to the /browse feed` test asserting a `/browse`
  heading `getByRole("heading", { name: /find your part/i })`. The Phase 16
  browse rework (`app/(public)/browse/page.tsx`) removed that `<h1>` — the page
  now opens on `BrowseSortSearch` + the mobile toolbar with no "Find your part"
  heading. The spec edit and the browse-page rework are out of sync.
- **Why deferred:** Phase 17 touched the trust gates + nav, not the browse page
  or its heading. The browse page is unmodified at HEAD; the failing assertion
  pre-dates this phase (it lives in an uncommitted Phase-16-era working-tree edit
  to `home.spec.ts`). Fixing it means re-aligning the Phase 16 browse spec, which
  is unrelated to the trust-gate surface.
- **Owner / fix:** Re-point the assertion to the heading the reworked `/browse`
  actually renders (or assert URL + a stable feed affordance), as part of
  finalising the Phase 16 browse-rework spec edits. Likely lands with the
  Phase 16 e2e reconciliation / next browse-touching phase.

## Note on `auth.spec.ts:95`

STATE.md previously flagged `auth.spec:95` (unauth `/account` → `/login`) as the
known pre-existing red. In the serial (workers=1) run during 17-07 it PASSED;
the 4-worker parallel run produced spurious empty-URL/timeout failures across
several specs (auth:95, home, public-profile, verify-wizard, and the new
trust-gates anon leg) that all clear when run serially — i.e. parallel load on a
single `next dev` instance, not real regressions. Run the suite with `--workers=1`
locally (or rely on CI's built server) to get a clean signal.
