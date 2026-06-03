---
phase: 02-verified-seller-phone-otp
plan: 03
subsystem: auth
tags: [twilio-verify, botid, otp, rate-limit, anti-abuse, server-actions, supabase, vitest]

# Dependency graph
requires:
  - phase: 02-verified-seller-phone-otp (Plan 02-01)
    provides: profiles_private.{phone_verified_at,marketplace_terms_accepted_at,terms_version}, otp_send_attempts + abuse_events service-role tables, is_verified_seller()
  - phase: 02-verified-seller-phone-otp (Plan 02-02)
    provides: toE164Plus1 (+1 geo normalizer) + sendOtp/checkOtp/acceptTerms Zod schemas + TERMS_VERSION
  - phase: 01-foundation-privacy-model
    provides: lib/supabase/{server,admin}.ts (getClaims user client + service-role admin client), profiles_private owner RLS
provides:
  - Hardened OTP send pipeline as a Server Action (BotID -> auth -> +1 geo -> rate-limit(phone+IP) -> spend-cap -> Twilio)
  - checkOtp action that sets phone_verified_at only on Twilio 'approved'
  - acceptTerms action persisting marketplace_terms_accepted_at + terms_version (owner RLS)
  - consumeSendBudget rate-limit/spend-cap store over otp_send_attempts (service-role)
  - alertSpendCap + logAbuse abuse-event writer with best-effort Resend admin email
  - BotID wiring (instrumentation-client.ts + withBotId in next.config.ts) protecting POST /verify
affects: [02-04-wizard-ui, 02-05-verified-badge, 10-admin-ops-analytics]

# Tech tracking
tech-stack:
  added: [twilio@6 Verify v2, botid@1.5 (checkBotId/initBotId/withBotId), Resend HTTP API (fetch)]
  patterns:
    - "Load-bearing guard order: every anti-abuse check runs BEFORE the paid Twilio call; first failure short-circuits"
    - "Service-role admin client ONLY for abuse tables; cookie-bound user client (getClaims) for all owner PII writes"
    - "Vitest server-only alias: tests/stubs/server-only.ts no-op so 'server-only' modules unit-test under jsdom"

key-files:
  created:
    - lib/verify/twilio.ts
    - lib/verify/ratelimit.ts
    - lib/verify/alert.ts
    - lib/actions/verify.ts
    - instrumentation-client.ts
    - tests/unit/send-otp.test.ts
    - tests/unit/check-otp.test.ts
    - tests/unit/ratelimit.test.ts
    - tests/stubs/server-only.ts
  modified:
    - next.config.ts
    - .env.example
    - vitest.config.mts

key-decisions:
  - "botid 1.5.x relocated initBotId to 'botid/client/core' (the plan's 'botid/client' export is now the <BotIdClient> component); imported from the core path"
  - "Aliased 'server-only' to a no-op stub in vitest.config so server-only lib modules can be unit-tested under jsdom; the real RSC boundary is still enforced at Next build"
  - "Spend cap default 200/day via OTP_SEND_DAILY_CAP env (tunable without redeploy); checked FIRST among counters"

patterns-established:
  - "OTP guard order (BotID -> getClaims -> Zod/+1 -> rate-limit(phone+IP) -> spend-cap -> Twilio) is the security spine; unit tests assert no Twilio call on any earlier failure"
  - "Abuse alerting is best-effort and error-swallowed: the abuse_events DB row is the durable record, Resend email is opportunistic"

requirements-completed: [VERF-02, VERF-03]

# Metrics
duration: 7min
completed: 2026-06-03
---

# Phase 2 Plan 03: Hardened OTP Pipeline Summary

**Abuse-hardened phone-OTP Server Actions where a bot / over-limit / out-of-region request costs zero SMS — Twilio Verify v2 send/check behind BotID + +1 geo + per-phone/per-IP rate limit + global spend cap, with approved-only phone_verified_at and versioned marketplace-terms acceptance.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-03T20:24:15Z
- **Completed:** 2026-06-03T20:31:46Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- `sendOtp` enforces the load-bearing guard order (BotID -> getClaims -> Zod/+1 -> rate-limit(phone+IP) -> spend-cap -> Twilio); the paid send happens only after every guard clears.
- `consumeSendBudget` enforces per-phone 3/hr + 5/day, a parallel per-IP cap, and a global daily spend cap (env-tunable, default 200) over the service-role `otp_send_attempts` table.
- `checkOtp` sets `phone_verified_at` only when Twilio returns `approved`; `acceptTerms` persists `marketplace_terms_accepted_at` + `terms_version` for the owner only.
- Spend-cap breach writes an `abuse_events` row and fires a best-effort Resend admin email (error-swallowed); bot/region/rate blocks are logged via `logAbuse`.
- BotID wired: `instrumentation-client.ts` protects POST `/verify`; `next.config.ts` wrapped with `withBotId`.
- 15 new unit tests (guard order, approved-only verify, rate-limit edges) green; full suite 60 passed / 1 skipped; `tsc --noEmit` and `npm run build` clean.

## Task Commits

1. **Task 1: Twilio client + rate-limit/spend-cap store + admin alert** — committed in `5011e2f` (see Deviations: cross-attributed by the parallel sibling's pre-commit stash)
2. **Task 2: Hardened Server Actions + BotID wiring** — `93f2027` (feat)
3. **Task 3: Unit tests (guard order, approved-only, rate-limit edges)** — `1cd609e` (test)

## Files Created/Modified
- `lib/verify/twilio.ts` - server-only Twilio Verify v2 send/check wrappers (approved-only boolean)
- `lib/verify/ratelimit.ts` - `consumeSendBudget` global spend cap + per-phone/per-IP window counters (admin client)
- `lib/verify/alert.ts` - `alertSpendCap` (abuse_events row + Resend email) + `logAbuse`, both error-swallowed
- `lib/actions/verify.ts` - `sendOtp` / `checkOtp` / `acceptTerms` Server Actions in the hardened order
- `instrumentation-client.ts` - `initBotId({ protect: [{ path:'/verify', method:'POST' }] })`
- `next.config.ts` - wrapped export with `withBotId`
- `.env.example` - Phase 2 server-only vars (Twilio x3, OTP_SEND_DAILY_CAP, Resend x2)
- `tests/unit/send-otp.test.ts` - guard-order proof (no Twilio on bot/auth/region/rate/spend block)
- `tests/unit/check-otp.test.ts` - phone_verified_at set only on Twilio 'approved'
- `tests/unit/ratelimit.test.ts` - per-phone 3/hr+5/day, per-IP cap, global spend-cap edges
- `tests/stubs/server-only.ts` - no-op stand-in for `server-only` under Vitest
- `vitest.config.mts` - alias `server-only` -> the stub

## Decisions Made
- **botid initBotId import path:** botid 1.5.11 exports `initBotId` from `botid/client/core` (the `botid/client` entry is now the `<BotIdClient>` JSX component). The plan referenced `botid/client`; used the core path to keep the documented "instrumentation hook protecting POST /verify" intent with a real exported function.
- **server-only under Vitest:** aliased `server-only` to a no-op so `lib/verify/*` modules (which guard against client bundling) can be imported and unit-tested in jsdom. The actual server/client boundary remains enforced by Next.js at build time.
- **Spend cap parsing:** `OTP_SEND_DAILY_CAP` parsed with a safe numeric fallback to 200; checked first among the counters so an over-budget request is rejected before per-key arithmetic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] botid client API path changed (initBotId moved to botid/client/core)**
- **Found during:** Task 2 (BotID wiring)
- **Issue:** Plan's `import { initBotId } from 'botid/client'` failed typecheck — in botid@1.5.11 `botid/client` exports only `BotIdClient` (a component); `initBotId` lives in `botid/client/core`.
- **Fix:** Imported `initBotId` from `botid/client/core` in `instrumentation-client.ts`.
- **Files modified:** instrumentation-client.ts
- **Verification:** `tsc --noEmit` clean; `npm run build` succeeds.
- **Committed in:** 93f2027 (Task 2 commit)

**2. [Rule 3 - Blocking] 'server-only' import threw in the Vitest jsdom environment**
- **Found during:** Task 3 (unit tests)
- **Issue:** `lib/verify/{ratelimit,alert,twilio}.ts` start with `import 'server-only'`, which throws when imported outside an RSC module — breaking the check-otp and ratelimit suites.
- **Fix:** Added `tests/stubs/server-only.ts` (no-op) and aliased `server-only` to it in `vitest.config.mts` via `path.resolve` (URL/pathname resolution broke on the space in the project path).
- **Files modified:** tests/stubs/server-only.ts, vitest.config.mts
- **Verification:** all 3 new suites green; full suite 60 passed / 1 skipped; `tsc --noEmit` clean.
- **Committed in:** 1cd609e (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking). No scope creep — both were required to make the planned code compile and the planned tests run.

## Issues Encountered
- **Parallel-execution commit cross-attribution (expected per plan context).** Task 1's `git commit` aborted as "empty" because the sibling agent (02-05) ran concurrently and its husky/lint-staged pre-commit stash/restore swept my staged Task 1 files (`lib/verify/twilio.ts`, `ratelimit.ts`, `alert.ts`, `.env.example`) into ITS commit `5011e2f`. Per the plan's parallel-execution guidance I did NOT rewrite the sibling's commit — the Task 1 files are present on disk, correct, and committed (under `5011e2f`). Tasks 2 and 3 committed cleanly on their own hashes. Self-check below confirms every Task 1 file exists.

## User Setup Required
**External services require manual configuration before the OTP send path works live:**
- **Twilio:** set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`. Create a Verify Service (code length 6, lifetime 600s, max attempts 5, channel SMS), enable Fraud Guard, set Verify Geo Permissions to United States + Canada only, and add a usage-trigger billing alert matching `OTP_SEND_DAILY_CAP`.
- **Resend:** set `RESEND_API_KEY` and `ABUSE_ALERT_EMAIL` (e.g. pdmckinster@gmail.com) for the interim spend-cap admin alert.
- **Spend cap:** optionally set `OTP_SEND_DAILY_CAP` (default 200) — tunable without redeploy.

All names are documented in `.env.example`. The pipeline scaffolds against these names; no code change is needed once the env vars are present.

## Next Phase Readiness
- Plan 02-04 (wizard UI) can call `sendOtp` / `checkOtp` / `acceptTerms` directly; the resume-on-abandon state derives from `profiles_private.{phone, phone_verified_at, marketplace_terms_accepted_at}` written here.
- Plan 02-05 (verified badge) already shipped in parallel; its `is_verified_seller()` keys on the same `phone_verified_at` + `marketplace_terms_accepted_at` this plan sets.
- Concern: BotID `isBot` is always false in local dev and only enforces in production — live abuse behavior must be validated on a Vercel preview, not curl.

## Self-Check: PASSED

All 9 created files present on disk; all 3 task commits (`5011e2f` Task 1 [cross-attributed], `93f2027` Task 2, `1cd609e` Task 3) exist in the git log.

---
*Phase: 02-verified-seller-phone-otp*
*Completed: 2026-06-03*
