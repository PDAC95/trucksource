# Deferred / Out-of-Scope Items — Phase 01

Items discovered during execution that belong to another plan or phase.

## From Plan 01-03 execution (auth flows)

- **`tests/integration/public-profile.contract.test.ts(52,17)` TS2352 type error.**
  - Owned by Plan 01-04 (public profile), being executed concurrently by another executor. Not in 01-03's `files_modified` scope.
  - Pre-existing/concurrent — not caused by 01-03 changes. Left untouched for the 01-04 executor to resolve.
  - **RESOLVED** in `2d2a667` (cast row via `unknown`) — kept `npm run typecheck` clean.

## From Plan 01-05 execution (end-to-end verification) — DEFERRED

- **Configure custom SMTP (Resend) for Supabase auth emails, then verify the live Phase 1 email round-trip.**
  - **Blocked by:** Supabase's built-in email service is hard-capped at **2 emails/hour** and is **NOT dashboard-raisable** — lifting it requires Custom SMTP. The cap was exhausted during e2e/manual register attempts (HTTP `429 over_email_send_rate_limit`). The 429 proves the register code is correct (`signUp` reaches Supabase); only the live email click is unverifiable until the cap is lifted.
  - **Follow-up:** set up Resend (custom SMTP) on the Supabase Staging project → verify register→confirm→login→logout against a real inbox AND the value-level `/u/<username>` no-PII render for a seeded confirmed account. Set `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`/`E2E_TEST_USERNAME` + PII fixtures (`E2E_TEST_FIRST_NAME`/`E2E_TEST_LAST_NAME`/`E2E_TEST_PHONE`) to run the env-gated e2e legs automatically.
  - **Phase 1 closed verified-partial** with this as the single outstanding verification item; structural privacy/gate guarantees are already proven by the Plan 02–04 contract/integration tests.
