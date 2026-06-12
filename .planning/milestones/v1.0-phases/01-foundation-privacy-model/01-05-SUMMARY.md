---
phase: 01-foundation-privacy-model
plan: 05
subsystem: testing
tags: [playwright, e2e, auth, privacy, supabase, smtp, deferred]

# Dependency graph
requires:
  - phase: 01-foundation-privacy-model
    plan: 03
    provides: Auth flows — register (6 PII fields + live/auto username), /auth/confirm token exchange, getClaims() confirmation gate on the force-dynamic (app) layout, login (persistent session), header user-menu logout, forgot/reset password
  - phase: 01-foundation-privacy-model
    plan: 04
    provides: Public seller profile /u/[username] reading profiles_public ONLY (four public facts), active_listing_count RPC, not-found state
provides:
  - "Playwright e2e suite for the Phase 1 happy path: register→check-email gate, (app) confirmation gate (anon → /login), login-persist + header logout (authed legs, env-gated), and anonymous /u/[username] render + value-level no-PII assertion (env-gated) + unconditional unknown-username 404"
  - "Phase 1 closed as verified-partial: automated gate/404 + manual gate/register/404 confirmed; live confirmation-email round-trip and value-level no-PII render DEFERRED behind custom SMTP"
affects: [02-verified-seller-otp, 05-listings-photos-exif, 07-search-feed-public-profile]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Authed/seeded e2e legs test.skip cleanly when E2E_TEST_* secrets are absent — suite stays green in CI without test accounts"
    - "register e2e soft-skips (not fails) on Supabase HTTP 429 email-send throttle via Promise.race(check-email heading, error toast) — a throttle is not a wiring failure"
    - "Value-level no-PII assertion reads PII fixtures from env and asserts absence in BOTH rendered text and raw HTML (catches attributes/embedded JSON)"

key-files:
  created:
    - e2e/auth.spec.ts
    - e2e/public-profile.spec.ts
  modified: []

key-decisions:
  - "Closed Phase 1 as verified-partial (user-approved): the automatable + reachable happy-path legs are confirmed; only the live email click and the value-level /u/<username> no-PII render are deferred"
  - "Live confirmation-email round-trip is BLOCKED by Supabase's built-in email service hard cap (2 emails/hour, NOT dashboard-raisable) — lifting it requires Custom SMTP (Resend). Register code is proven correct: the 429 over_email_send_rate_limit means signUp reaches Supabase"
  - "Deferred the email leg rather than wiring a service-role admin-confirm helper — keeping any service-role usage out of app code (CLAUDE.md invariant 3) and letting a real SMTP setup close it properly"

patterns-established:
  - "e2e secrets contract: E2E_TEST_EMAIL/PASSWORD (confirmed account) gate login-persist/logout; E2E_TEST_USERNAME + E2E_TEST_FIRST_NAME/LAST_NAME/PHONE/EMAIL gate the public-profile render + value-level no-PII check"

requirements-completed: [ACCT-01, ACCT-05, ACCT-06, PRIV-01, PRIV-04]

# Metrics
duration: ~18min
completed: 2026-06-03
---

# Phase 1 Plan 05: End-to-End Verification Summary

**Playwright e2e suite for the Phase 1 happy path (register→check-email gate, (app) confirmation gate, login-persist/logout, anonymous /u/[username] render + value-level no-PII assertion, unknown-username 404) — Phase 1 closed verified-partial: automated gate + 404 and the manual gate/register/404 are confirmed; the live confirmation-email round-trip and the value-level no-PII render are DEFERRED behind Supabase's 2-email/hour built-in cap, which needs custom SMTP (Resend).**

## Performance

- **Duration:** ~18 min (spec authoring + checkpoint round-trip + finalization)
- **Completed:** 2026-06-03
- **Tasks:** 2 (1 auto e2e specs, 1 human-verify checkpoint)
- **Files modified:** 2 (2 created, 0 modified)

## Accomplishments

- `e2e/auth.spec.ts` — Playwright journey: (1) **register → check-email** fills all 6 PII fields, opens the Radix country/state selects by role, leaves username blank to exercise server-side auto-generation, submits, and races the "check your email" heading against the error toast so a Supabase 429 email throttle soft-skips instead of failing; (2) **confirmation gate** — visiting `/` (guarded `(app)`) while unauthenticated bounces to `/login`; (3) **login-persist + logout** — for a pre-confirmed `E2E_TEST_*` account, logs in, asserts the session survives a full reload (cookie-backed), then logs out from the header user menu back to `/login` (skips cleanly when the secret is absent).
- `e2e/public-profile.spec.ts` — anonymous `/u/${E2E_TEST_USERNAME}` render asserting the four public facts (username h1, "{state}, {country}" line, "Member since", "active listing" count) **plus a value-level no-PII assertion** that none of the fixture PII (first/last name, phone, email) appears in rendered text OR raw HTML; an unconditional test that `/u/__definitely_not_a_user__` returns HTTP 404 with the "Profile not found" boundary.
- **Human checkpoint (Task 2) — partial pass.** The user ran `npm run dev` and confirmed: the confirmation gate redirects unauthenticated `/` → `/login`; `/register` renders, the live username-availability check responds, and the register form submits and reaches Supabase `signUp`; an unknown username renders the 404 not-found state without crashing.

## Task Commits

1. **Task 1: Auth + public-profile e2e specs** — `4140797` (test) — `e2e/auth.spec.ts`, `e2e/public-profile.spec.ts`. Automated run: 2 passed (confirmation gate, unknown-username 404), 3 skipped (register soft-skipped on the 429 throttle; login-persist/logout and public-profile render skipped — no seeded `E2E_TEST_*` account).
2. **Task 2: Human verification of the live Phase 1 happy path** — `checkpoint:human-verify`, closed **verified-partial** (see Verification Outcome below).

**Plan metadata:** this commit (`docs(01-05)`).

_Context — code cleanups committed after the e2e specs (outside plan 05's `files_modified` scope, no behavior change to plan 05 artifacts):_
- `595eea5` `fix(01-03)` — controlled register-form Selects (`value={field.value ?? ""}`), renamed `middleware.ts` → `proxy.ts` (Next 16 deprecation), removed a temp diagnostic `console.error` from the register action.
- `2d2a667` `fix(01-04)` — cast row via `unknown` in `public-profile.contract.test.ts` to keep `npm run typecheck` clean after concurrent Wave 3 execution.

## Files Created/Modified

- `e2e/auth.spec.ts` — register→check-email gate, (app) confirmation gate, login-persist/logout (env-gated) (created).
- `e2e/public-profile.spec.ts` — anonymous public-profile render + value-level no-PII assertion (env-gated) + unconditional unknown-username 404 (created).

## Verification Outcome (verified-partial)

**Confirmed (automated + manual):**
- ✅ Automated: the confirmation gate (anon `/` → `/login`) and the unknown-username 404 pass headless.
- ✅ Manual: the gate redirect, `/register` render + live username-availability + form submit reaching Supabase `signUp`, and the unknown-username 404 (no crash).

**Deferred (blocked, not failed):**
- ⏳ The **live confirmation-email round-trip** (click the real Supabase email → land in `(app)` → reload persists → logout → log back in).
- ⏳ The **value-level no-PII assertion on `/u/<username>`** for a real seeded confirmed account (the structural guarantee — profiles_public/profiles_private split + RLS + the Plan 04 route-level contract test — already holds; this is the runtime value-level proof against a live row).

**Root cause of the deferral:** Supabase's built-in email service is hard-capped at **2 emails/hour** and **cannot be raised from the dashboard** — lifting it requires **Custom SMTP**. The cap was exhausted by the e2e build's signUp attempts + manual retries, returning HTTP `429 over_email_send_rate_limit`. That 429 is itself proof the register code is correct: `signUp` reaches Supabase. The user attempted to set up Resend (custom SMTP) to lift the cap but could not finish account creation in this session, so the live email verification is deferred.

**Decision (user-approved):** close Phase 1 as **verified-partial** and proceed. The deferred verification is tracked as a follow-up (see Deferred Items).

## Decisions Made

- **Verified-partial close:** the reachable happy-path legs are confirmed; only the live email click and the value-level no-PII render wait on infrastructure. Phase 1's structural guarantees (RLS privacy split, confirmation gate, public-profile column discipline) are all backed by passing contract/integration tests from Plans 02–04.
- **No service-role admin-confirm shortcut:** rather than wire a service-role test helper to bypass email confirmation, the email leg is deferred to a real SMTP setup — keeping service-role usage out of app code (CLAUDE.md invariant 3) and verifying the genuine production path.

## Deferred Items

**1. Configure custom SMTP (Resend) for Supabase auth emails, then verify the live Phase 1 email round-trip.**
- **Why deferred:** Supabase built-in email is capped at 2/hour and is not dashboard-raisable; the cap was exhausted (HTTP 429 `over_email_send_rate_limit`). Resend setup could not be completed this session.
- **Follow-up:** set up custom SMTP (Resend), then verify register→confirm→login→logout against a real inbox AND the value-level `/u/<username>` no-PII render for a seeded confirmed account (set `E2E_TEST_EMAIL/PASSWORD/USERNAME` + the PII fixtures to run the env-gated e2e legs automatically).
- Recorded in `.planning/STATE.md` (Pending Todos) and `deferred-items.md`.

## Deviations from Plan

None — plan executed as written. The human checkpoint resolved as a partial (deferred) pass rather than a full "approved" by explicit user decision; this is a verification-outcome record, not a deviation in the work performed.

## Authentication Gates

None blocking. The 429 email throttle is an infrastructure rate limit (resolved by custom SMTP), not an auth gate in the executor sense.

## Issues Encountered

- **Supabase built-in email cap (2/hour, not dashboard-raisable).** Exhausted by signUp attempts → HTTP 429 `over_email_send_rate_limit`, blocking the live email confirmation leg. Resolution path: configure custom SMTP (Resend). The register spec already soft-skips on this 429 so the automated suite stays green.

## Next Phase Readiness

- Phase 1 is functionally complete and closed verified-partial. The e2e suite is committed and CI-safe (authed/seeded legs skip without secrets).
- **Carry-forward for Phase 2 (or whenever SMTP lands):** configure Resend custom SMTP, then close the deferred live email round-trip + value-level no-PII render. Phase 2 (Verified Seller / OTP) introduces Twilio Verify and will benefit from custom SMTP being in place.

## Self-Check: PASSED

- `e2e/auth.spec.ts` — FOUND on disk.
- `e2e/public-profile.spec.ts` — FOUND on disk.
- e2e spec commit `4140797` — FOUND in git history.

---
*Phase: 01-foundation-privacy-model*
*Completed: 2026-06-03*
