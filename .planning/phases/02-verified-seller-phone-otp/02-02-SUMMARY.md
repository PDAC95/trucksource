---
phase: 02-verified-seller-phone-otp
plan: 02
subsystem: auth
tags: [zod, libphonenumber-js, twilio, botid, e164, otp, validation]

# Dependency graph
requires:
  - phase: 01-foundation-privacy-model
    provides: lib/validation/auth.ts Zod convention (zod@4, named exports + inferred types); profiles_private PII table (terms_accepted_at / terms_version targets)
provides:
  - "toE164Plus1(raw) — +1-only E.164 normalizer (geo allowlist, line 1 of defense; rejects non-US/CA before any paid Twilio send)"
  - "sendOtpSchema / checkOtpSchema / acceptTermsSchema — single client+server Zod source of truth for the verification wizard"
  - "TERMS_VERSION constant for stamping marketplace-terms acceptance"
  - "twilio, botid, libphonenumber-js installed (lockfile committed once for the whole phase)"
affects: [02-03 send/check OTP Server Actions, 02-04 wizard UI, 02-05 verified badge]

# Tech tracking
tech-stack:
  added: [twilio@6, botid@1.5, libphonenumber-js@1.13]
  patterns: ["geo allowlist as a pure local function before any paid call", "one Zod schema set validates client + Server Action"]

key-files:
  created:
    - lib/verify/phone.ts
    - lib/verify/schema.ts
    - tests/unit/phone.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "TERMS_VERSION pinned to '2026-06-03' so wizard + action stamp the same version the user saw"
  - "Geo/+1 enforcement lives ONLY in toE164Plus1 (the action), not duplicated in the Zod phone field — schema validates shape, the normalizer enforces region"

patterns-established:
  - "toE164Plus1: parse with default region 'US' (resolves bare 10-digit), reject !isValid / countryCallingCode!=='1' / country not in {US,CA}, return E.164"
  - "Wizard schemas mirror registerSchema.acceptTerms (z.literal(true)) for the terms checkbox"

requirements-completed: [VERF-02, VERF-03]

# Metrics
duration: 3min
completed: 2026-06-03
---

# Phase 2 Plan 02: Phone normalizer + shared wizard Zod schemas Summary

**TDD'd a +1-only E.164 normalizer (geo allowlist's free first line of defense) and the three shared Zod schemas (phone / 6-digit OTP / terms) that the whole verification wizard and its Server Actions will reuse.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-03T20:15:37Z
- **Completed:** 2026-06-03T20:18:30Z
- **Tasks:** 2
- **Files modified:** 5 (3 created + package.json/lock)

## Accomplishments
- `toE164Plus1` rejects non-`+1` numbers (UK +44, Mexico +52) locally and free, before any Twilio call can cost an SMS; accepts US/CA and normalizes bare-10-digit and formatted input to E.164. 8 unit tests cover every accept/reject/normalize case.
- Three shared Zod schemas (`sendOtpSchema`, `checkOtpSchema`, `acceptTermsSchema`) + inferred types as the single client+server source of truth, plus a `TERMS_VERSION` constant for acceptance stamping.
- Installed `twilio`, `botid`, `libphonenumber-js` once so the lockfile lands a single time for the phase (Plan 03 uses twilio + botid).

## Task Commits

1. **Task 1 (TDD RED): failing test + deps** - `070c774` (test)
2. **Task 1 (TDD GREEN): toE164Plus1 implementation** - `73528f1` (feat)
3. **Task 2: shared wizard Zod schemas** - `c1f5665` (feat)

_TDD task 1 split into RED (test) and GREEN (implementation) commits. No refactor commit — Pattern-3 implementation was clean on first pass._

## Files Created/Modified
- `lib/verify/phone.ts` - `toE164Plus1(raw): string | null` — +1-only E.164 normalizer (geo allowlist)
- `lib/verify/schema.ts` - `sendOtpSchema`/`checkOtpSchema`/`acceptTermsSchema` + types + `TERMS_VERSION`
- `tests/unit/phone.test.ts` - 8 cases: US/CA accept, +44/+52 reject, bare-10-digit + formatted normalize, invalid/empty → null
- `package.json` / `package-lock.json` - twilio, botid, libphonenumber-js

## Decisions Made
- **TERMS_VERSION = "2026-06-03"** (today's marketplace-terms version) — wizard and the acceptTerms action must agree so acceptance is stamped with the version the user actually saw.
- **Region gate not duplicated in Zod** — the phone field validates only shape (`min(7)`); `toE164Plus1` is the single place that enforces `+1`/US-CA, matching the plan's explicit instruction not to duplicate that logic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing untracked migration swept into the RED commit**
- **Found during:** Task 1 (RED commit)
- **Issue:** `supabase/migrations/0002_verification.sql` existed as untracked working-tree content (recovered from a `git stash` entry that the husky/lint-staged pre-commit hook restored during commit). It got included in commit `070c774` despite individual `git add` of only package/test files.
- **Fix:** Left committed — the file is legitimate Phase 2 migration work (belongs to the 02-03 send/check + badge migration scope) and reverting risked losing stashed work. Flagged here for attribution so the migration-owning plan does not re-create it.
- **Files modified:** none by this plan; the SQL file is unmodified by Plan 02.
- **Verification:** `git log -- supabase/migrations/0002_verification.sql` shows it landed in `070c774`; content untouched by Plan 02.
- **Committed in:** `070c774` (Task 1 RED commit)

---

**Total deviations:** 1 (1 blocking/hygiene). No scope creep — Plan 02 authored only phone.ts, schema.ts, phone.test.ts.
**Impact on plan:** None on Plan 02 correctness. The migration's commit attribution is slightly off (lives under a `test()` commit), noted so the migration-owning plan (02-03) treats `0002_verification.sql` as already committed rather than re-authoring it.

## Issues Encountered
None beyond the deviation above. RED failed as expected (missing module), GREEN passed all 8 cases first try, full suite stayed green (40 passed, 1 self-skipped integration), `tsc --noEmit` clean.

## User Setup Required
None for this plan. Twilio/BotID env vars (`TWILIO_*`, BotID config) are required by Plan 03 when the Server Actions actually call those services — not by these pure modules.

## Next Phase Readiness
- Plan 03 (OTP send/check Server Actions) can import `toE164Plus1` for the geo gate and `sendOtpSchema`/`checkOtpSchema` for client+server validation.
- Plan 04 (wizard UI) can import all three schemas + `TERMS_VERSION`.
- `0002_verification.sql` already exists in the tree (committed in `070c774`) — confirm/extend rather than re-create.

## Self-Check: PASSED

- Files: `lib/verify/phone.ts`, `lib/verify/schema.ts`, `tests/unit/phone.test.ts` all present.
- Commits: `070c774`, `73528f1`, `c1f5665` all exist.

---
*Phase: 02-verified-seller-phone-otp*
*Completed: 2026-06-03*
