---
phase: 11-brand-foundation-token-system
plan: 03
subsystem: ui
tags: [brand, rename, copy, e2e, playwright]

# Dependency graph
requires:
  - phase: 11 (plan 01)
    provides: package.json with check:contrast script (owns the file this plan renames)
  - phase: 11 (plan 02)
    provides: package.json with next-themes removed + regenerated lock (on-disk base this plan builds on)
provides:
  - Product name "OG Truck Parts" everywhere user-visible (auth titles, login copy, both header wordmarks, suspended screen, README h1)
  - package.json visible name og-truck-parts with lockfile mirrored
  - e2e brand assertions reconciled to real DOM (home wordmark = link, not heading) and renamed in the same commit
affects:
  - 11-04 (header wordmark — adds the logo image beside the now-"OG Truck Parts" text link, wires .neon-sign)
  - Phase 15 (deferred lib/* email-sender brand strings + near-expiry cron URL still say Take-Off Parts on purpose)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Brand-string sweep is scoped by a grep-verified file:line rename_map — only listed strings change; lib/* email senders + cron URLs are explicitly excluded (Phase 15)"
    - "e2e brand assertions are updated in the SAME commit as the wordmark rename so the suite never goes red between commits (behavior-oracle invariant)"
    - "Playwright role assertions must match the real DOM element: the home wordmark is a Link (role=link), never a heading"

key-files:
  created:
    - .planning/phases/11-brand-foundation-token-system/deferred-items.md
  modified:
    - app/(auth)/register/page.tsx
    - app/(auth)/check-email/page.tsx
    - app/(auth)/auth-code-error/page.tsx
    - app/(auth)/login/page.tsx
    - app/(app)/layout.tsx
    - components/layout/site-header.tsx
    - components/account/suspended-screen.tsx
    - README.md
    - package.json
    - package-lock.json
    - e2e/home.spec.ts
    - e2e/auth.spec.ts

key-decisions:
  - "home.spec brand assertion changed from getByRole('heading') to getByRole('link') — the home h1 is 'Find your part'; the only brand string on / is the header wordmark LINK (Pitfall 4 reconciliation)"
  - "package name renamed (visible name only); repo/Vercel/Supabase slugs untouched per BRND-01; lockfile regenerated via npm install (no hand-edit, no dep changes)"
  - "lib/* email senders + near-expiry cron URL intentionally left as Take-Off Parts — Phase 15 deferral pending Staging send evidence"

requirements-completed: [BRND-01]

# Metrics
duration: ~7min
completed: 2026-06-15
---

# Phase 11 Plan 03: Brand-String Sweep & e2e Reconciliation Summary

**Renamed every user-visible "Take-Off Parts" product string to "OG Truck Parts" (auth page titles, login copy, both header wordmarks, suspended screen, README h1, package name) and reconciled the e2e brand assertions in the same commit — fixing the home.spec heading/link role mismatch so the suite stays a true behavior oracle.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-15T13:43:48Z
- **Tasks:** 3 (committed as one atomic commit per the same-commit-test gate)
- **Files modified:** 12 (1 created, 11 modified)

## Accomplishments
- Swept all 7 app/component user-visible strings + README h1 from "Take-Off Parts" to "OG Truck Parts" exactly per the grep-verified rename_map — no over-reach into lib/*, the near-expiry cron, tests/integration, or check.md.
- Renamed the package `name` to `og-truck-parts` and regenerated `package-lock.json` via `npm install` so the lock's name fields mirror it (no dependency changes, no lockfile drift).
- Reconciled the researcher-flagged `home.spec.ts` role mismatch: the assertion now targets the header wordmark LINK (`getByRole("link", { name: "OG Truck Parts" })`) instead of a `heading` role that never matched the DOM (the home `<h1>` is "Find your part").
- Renamed both `auth.spec.ts` link assertions (pre- and post-reload) to "OG Truck Parts" in the same commit as the wordmark rename — the suite never went red between commits.

## Task Commits

Tasks 1–3 were committed together as one atomic commit (mandated by the same-commit-test-updates gate — splitting them would leave the e2e suite red between commits):

1. **Tasks 1+2+3: Brand-string sweep + package rename + e2e reconciliation** - `6fac76e` (feat)

## Files Created/Modified
- `app/(auth)/register|check-email|auth-code-error/page.tsx` - metadata title suffixes -> "· OG Truck Parts".
- `app/(auth)/login/page.tsx` - "Log in to your OG Truck Parts account".
- `components/layout/site-header.tsx` - header wordmark `<Link href="/">` text -> "OG Truck Parts" (kept as a link; Plan 04 adds the logo image beside it).
- `components/account/suspended-screen.tsx` - suspended-screen wordmark span -> "OG Truck Parts".
- `app/(app)/layout.tsx` - read-only (suspended/messages) header span -> "OG Truck Parts".
- `README.md` - h1 -> "# OG Truck Parts".
- `package.json` - `name` -> "og-truck-parts"; `package-lock.json` regenerated to mirror.
- `e2e/home.spec.ts` - assertion + test title reconciled to the wordmark LINK.
- `e2e/auth.spec.ts` - both link assertions renamed to "OG Truck Parts".
- `.planning/phases/11-brand-foundation-token-system/deferred-items.md` - logs the pre-existing `auth.spec:95` e2e environment failure (out of scope).

## Decisions Made
- **home.spec heading -> link:** the only "OG Truck Parts" on `/` is the header wordmark link (the page `<h1>` is "Find your part"). Asserting a `heading` role was a latent bug; reconciled to `getByRole("link", ...)` matching auth.spec for consistency.
- **Visible name only, lock regenerated cleanly:** package `name` renamed; repo/Vercel/Supabase slugs unchanged per BRND-01. Lockfile regenerated with `npm install` (no hand-edit, no new deps) on top of Plan 02's already-regenerated lock.
- **Phase 15 deferral honored:** lib/* email senders and the near-expiry cron URL still read "Take-Off Parts"/`takeoffparts.com` on purpose — they flip when Staging send evidence exists in Phase 15.

## Deviations from Plan

None - plan executed exactly as written. All three rename tasks committed atomically as the plan instructed.

## Issues Encountered

**Pre-existing e2e failure (out of scope — logged to deferred-items.md):** The full Playwright run shows `auth.spec.ts:95` ("visiting (app) home while unauthenticated redirects to /login") failing — `/` does not bounce to `/login`. This was reproduced identically at HEAD with all 11-03 changes stashed, proving it predates this plan and is NOT caused by the brand rename. Likely a leftover authenticated session cookie in the local dev/Staging environment so the (app) layout's `getClaims()` gate does not redirect. Under 8 parallel workers, `verify-wizard.spec.ts` and `public-profile.spec.ts` `page.goto` calls also time out; these clear at `--workers=2` or in isolation (Staging-backend latency under load, not a code defect). Per the scope boundary, none of these were fixed.

**Brand-relevant tests pass:** `home.spec.ts` (brand wordmark link) passes in isolation; the renamed `auth.spec.ts` link assertions are correct and execute when E2E test creds are present (that login-persist test `test.skip`s cleanly without creds). The full vitest suite is green (304 passed / 1 pre-existing skip) — behavior-freeze confirmed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- BRND-01 satisfied: zero "Take-Off Parts"/"Create Next App" product strings remain in app, components, README, package.json, or e2e. (Gate 2 is fully green now that both Plan 02 root-metadata scaffold removal and this plan's sweep have landed.)
- Plan 04 can wire the logo image beside the now-"OG Truck Parts" text wordmark in `site-header.tsx` and apply `.neon-sign`.

## Self-Check: PASSED

All claimed artifacts verified on disk and in git history:
- Files: all 11 modified files + deferred-items.md present; `package.json` name reads `og-truck-parts` in the committed tree.
- No "Take-Off Parts" remains in app/(auth), app/(app)/layout.tsx, components, README, package files, or e2e.
- Commit: 6fac76e present in git log.
- Build passes; vitest 304 passed / 1 skipped; home.spec passes in isolation.

---
*Phase: 11-brand-foundation-token-system*
*Completed: 2026-06-15*
