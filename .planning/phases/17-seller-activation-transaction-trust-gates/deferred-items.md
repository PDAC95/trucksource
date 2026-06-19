# Phase 17 — Deferred Items

Out-of-scope discoveries logged during execution (NOT fixed here — they are not
caused by Phase 17's changes; see the GSD scope boundary).

## 1. Auth email send failure on Staging (Resend custom SMTP)

- **Found during:** Plan 17-07, Task 3 (live UAT — registering the unverified
  test account).
- **What:** `supabase.auth.signUp` returns `500 unexpected_failure: Error
  sending confirmation email` on Staging (Resend custom SMTP). Normal
  self-service registration on Staging is blocked; the UAT test account had to
  be created via service-role `admin.createUser`.
- **Why deferred:** Provider/infra config, not Phase 17 application code. Relates
  to the existing `phase1-email-deferred-smtp` memory item (built-in cap was
  2/h, moved to Resend custom SMTP). Did not block the gate verification itself.
- **Owner / fix:** Pre-launch — verify own domain on Resend and point Supabase
  Staging SMTP at it. Tracked in STATE.md Open Blockers (#3 provider hygiene).

## 2. `e2e/home.spec.ts:22` — stale `/browse` heading assertion (Phase 16 drift) — ✅ RESOLVED 2026-06-19

- **Resolution (commit `22c7ec1`):** Re-pointed the assertion from the removed
  `/find your part/i` heading to the always-present `/\d+ results?/i` count that
  `ActiveFilterChips` renders on `/browse` (viewport- and data-independent).
  Verified live against the running server (`/browse` showed "5 results"). The
  commit also bundled the previously-uncommitted v1.1 brand-rework edits to this
  spec. Could not run the full Playwright harness (the dev-lock conflict with the
  running `next dev` on :3000 blocks Playwright's :3100 server); validated the
  assertion target via a live browser snapshot instead.
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
