# Phase 11 — Deferred Items

Out-of-scope discoveries logged during execution. Not fixed here (scope boundary).

## Pre-existing e2e failure: `auth.spec.ts:95` confirmation gate

- **Found during:** 11-03 Task 3 (e2e run after brand-string sweep).
- **Test:** `confirmation gate › visiting the (app) home while unauthenticated redirects to /login`.
- **Symptom:** `page.goto("/")` lands on `http://localhost:3100/` instead of redirecting to `/login`; `toHaveURL(/\/login/)` times out.
- **Pre-existing proof:** Reproduced identically at HEAD with all 11-03 changes stashed — failure exists before this plan's edits, so it is NOT caused by the brand rename.
- **Likely cause:** A leftover authenticated session cookie in the local dev/Staging environment means the (app) layout's `getClaims()` gate does not bounce to `/login`. Environment state, not application regression.
- **Also observed:** under 8 parallel workers, `verify-wizard.spec.ts` and `public-profile.spec.ts` `page.goto` calls time out; these clear when run with `--workers=2` or in isolation — Staging-backend latency under parallel load, not a code defect.
- **Action:** Not fixed (out of scope for a brand-string sweep). The brand-relevant assertions pass: `home.spec.ts` (brand wordmark link) passes in isolation; `auth.spec.ts` login-persist link assertions are correctly renamed to "OG Truck Parts" and execute when E2E test creds are present.
- **Owner:** Phase 15 (A11Y/FIX/QA audit gate) or a dedicated e2e-environment cleanup — verify the auth-gate redirect against a clean (no-cookie) session.
