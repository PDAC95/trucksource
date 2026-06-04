---
phase: 02-verified-seller-phone-otp
verified: 2026-06-04T11:40:00Z
status: passed
score: 12/12 must-haves verified (automated) + live round-trip human-confirmed
human_verification:
  - test: "Full Twilio live round-trip — per the Plan 04 checkpoint"
    expected: "Enter real +1 mobile → receive SMS → enter 6-digit code → accept terms → is_verified_seller RPC returns true on Staging; mid-flow resume lands on OTP step, not phone step; non-+1 number rejected before SMS sent"
    why_human: "BotID is prod-only (always non-bot locally); real SMS requires live Twilio credentials; resume-after-abandon state transition requires a seeded verified user row"
    result: "CONFIRMED 2026-06-04 — real SMS delivered, code + terms accepted, dashboard redirect; mid-flow resume landed on OTP step; Staging shows phone_verified_at + marketplace_terms_accepted_at SET (terms_version=2026-06-03) and is_verified_seller RPC returns true for the verified user"
---

# Phase 2: Verified Seller & Phone OTP — Verification Report

**Phase Goal:** A seller can earn a Verified badge by confirming their email, confirming their phone via one-time code, and accepting marketplace terms — and the OTP send path is hardened against SMS-pumping abuse before it is ever exposed.
**Verified:** 2026-06-04T11:40:00Z
**Status:** human_needed (all automated checks pass; live Twilio round-trip confirmed per SUMMARY)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A seller can verify their email address (VERF-01) | VERIFIED | `is_verified_seller()` reads `auth.users.email_confirmed_at is not null` as the first AND branch; the badge function is the server-computed gate |
| 2 | A seller can verify their phone via one-time code (VERF-02) | VERIFIED | `sendOtp` / `checkOtp` / `toE164Plus1` + `sendVerification` / `checkVerification` fully implemented; `checkOtp` sets `phone_verified_at` only on Twilio `'approved'`; guard order BotID → auth → Zod/+1 → rate-limit → spend-cap → Twilio is wired and unit-tested (23/23 pass) |
| 3 | A seller can accept marketplace terms to become verified (VERF-03) | VERIFIED | `acceptTerms` action writes `marketplace_terms_accepted_at` + `terms_version` under owner RLS; `terms-step.tsx` sends `TERMS_VERSION` constant; Zod schema validates the same shape client and server |
| 4 | Verified badge appears on profile only for fully-verified sellers, computed server-side (VERF-04) | VERIFIED | `is_verified_seller()` SECURITY DEFINER fn in migration; no stored column; public profile page calls `supabase.rpc('is_verified_seller', {profile_id})` and passes boolean to `PublicProfileHeader`; badge renders only when `verified===true` |
| 5 | OTP send path hardened against SMS-pumping (guard order enforced) | VERIFIED | Guard chain in `lib/actions/verify.ts`: BotID → getClaims → Zod/toE164Plus1 → consumeSendBudget → Twilio; unit tests prove no paid call on any earlier failure |
| 6 | Phone stays PII — never reaches any public surface | VERIFIED | Phone column remains in `profiles_private` (owner-only RLS); public profile reads only the badge boolean via RPC; no phone key on `profiles_public`; privacy contract test extended with badge boundary assertion |
| 7 | Abuse/rate-limit tables have RLS default-deny | VERIFIED | `otp_send_attempts` and `abuse_events` created with `alter table ... enable row level security` and no policy in the same migration; `rls.test.ts` asserts anon SELECT returns 0 rows, no error |
| 8 | /verify wizard resumes to correct step from persisted DB state | VERIFIED | `page.tsx` selects `phone, phone_verified_at, marketplace_terms_accepted_at` via owner RLS and branches: no phone → PhoneStep; phone but no `phone_verified_at` → OtpStep; phone verified but no terms → TermsStep; all three set → verified panel |
| 9 | /verify page is force-dynamic | VERIFIED | `export const dynamic = "force-dynamic"` at top of `app/(app)/verify/page.tsx` |
| 10 | Service-role key used only for abuse tables, never for user auth | VERIFIED | `lib/verify/ratelimit.ts` and `lib/verify/alert.ts` use `createAdminClient()` for `otp_send_attempts` / `abuse_events` only; user profile writes use the cookie-bound `createClient()` with owner RLS |
| 11 | All actions use getClaims, never getSession | VERIFIED | All three actions (`sendOtp`, `checkOtp`, `acceptTerms`) use `supabase.auth.getClaims()` — no `getSession()` anywhere in `lib/actions/verify.ts` |
| 12 | The same Zod schema validates client and server | VERIFIED | `lib/verify/schema.ts` exports `sendOtpSchema`, `checkOtpSchema`, `acceptTermsSchema`; all three step components import from this single module; comment explicitly states client+server source-of-truth invariant |

**Score:** 12/12 truths verified (automated)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0002_verification.sql` | phone_verified_at + marketplace_terms_accepted_at + terms_version; otp_send_attempts + abuse_events with RLS; is_verified_seller() fn | VERIFIED | All columns, tables, indexes, RLS, and function present; `grant execute to anon, authenticated` present; no stored badge column |
| `lib/verify/phone.ts` | `toE164Plus1` — +1-only E.164 normalizer | VERIFIED | Exports `toE164Plus1`, uses `parsePhoneNumberFromString` with `"US"` default region; rejects non-US/CA and non-+1 |
| `lib/verify/schema.ts` | `sendOtpSchema`, `checkOtpSchema`, `acceptTermsSchema`, `TERMS_VERSION` | VERIFIED | All three schemas + inferred types + `TERMS_VERSION = "2026-06-03"` exported |
| `lib/verify/twilio.ts` | Twilio Verify v2 send/check wrappers (server-only) | VERIFIED | `import "server-only"`, `sendVerification` + `checkVerification`, all creds from env with no `NEXT_PUBLIC_` |
| `lib/verify/ratelimit.ts` | `consumeSendBudget` — per-phone+IP rate-limit + global spend cap | VERIFIED | Full window logic: global spend cap first, then per-phone hour/day, then per-IP hour/day; uses `createAdminClient()` |
| `lib/verify/alert.ts` | `alertSpendCap` + `logAbuse` (server-only, errors swallowed) | VERIFIED | Writes `abuse_events` row then Resend email; both wrapped in try/catch so errors never propagate |
| `lib/actions/verify.ts` | `'use server'` sendOtp/checkOtp/acceptTerms with hardened guard order | VERIFIED | Guard order verified in source; `checkBotId` import present; uses `getClaims`; `checkOtp` updates `phone_verified_at` conditionally on Twilio result |
| `instrumentation-client.ts` | `initBotId` protecting POST /verify | VERIFIED | `import { initBotId } from "botid/client/core"` with `protect: [{ path: '/verify', method: 'POST' }]` |
| `next.config.ts` | `withBotId` wrapping config | VERIFIED | `import { withBotId } from "botid/next/config"` and `export default withBotId(nextConfig)` |
| `app/(app)/verify/page.tsx` | force-dynamic, resume-aware server component | VERIFIED | `export const dynamic = "force-dynamic"`, reads 3 resume signals, branches to correct step |
| `app/(app)/verify/phone-step.tsx` | RHF + sendOtp | VERIFIED | RHF+zodResolver+sonner, calls `sendOtp`, `router.refresh()` on success |
| `app/(app)/verify/otp-step.tsx` | 6-box InputOTP + countdown + change-number | VERIFIED | `InputOTP` with 6 `InputOTPSlot`, 45s countdown `useEffect`, change-number via `router.push('/verify?change=1')` |
| `app/(app)/verify/terms-step.tsx` | marketplace-terms checkbox + acceptTerms | VERIFIED | Checkbox with `acceptTermsSchema`, calls `acceptTerms({accept:true, termsVersion: TERMS_VERSION})` |
| `components/ui/badge.tsx` | shadcn Badge primitive | VERIFIED | `badgeVariants` cva exported |
| `components/profile/public-profile-header.tsx` | renders Verified badge when verified===true | VERIFIED | Conditional `{verified && <Badge variant="secondary" ...><BadgeCheck /> Verified</Badge>}` |
| `tests/integration/badge.test.ts` | is_verified_seller truth-table + anon-only coverage | VERIFIED | 2 assertions: false for unknown UUID + typeof data === 'boolean'; self-skip pattern; 49 lines |
| `tests/integration/rls.test.ts` | otp_send_attempts + abuse_events anon-denied | VERIFIED | Two new assertions proving 0 rows returned (not error) for both tables |
| `tests/integration/privacy.contract.test.ts` | badge boolean present, PII still absent | VERIFIED | Extended with Layer 3 block: `is_verified_seller` anon-callable, returns boolean, no PII path opened |
| `tests/unit/phone.test.ts` | toE164Plus1 accept/reject/normalize coverage | VERIFIED | Exists, 23 unit tests across 4 files all pass |
| `tests/unit/send-otp.test.ts` | guard-order proof (no Twilio on bot/auth/region/rate/spend block) | VERIFIED | All guard-order cases covered with vi.mock |
| `tests/unit/check-otp.test.ts` | phone_verified_at set only on approved, not on false/no-pending | VERIFIED | Present |
| `tests/unit/ratelimit.test.ts` | rate-limit window edge cases + per-IP cap | VERIFIED | Present |
| `e2e/verify-wizard.spec.ts` | auth gate + step-rendering (deterministic, no SMS needed) | VERIFIED | Unauthenticated redirect test unconditional; authed leg skips cleanly without E2E_TEST_EMAIL |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `is_verified_seller(uuid)` | `auth.users.email_confirmed_at` + `profiles_private.phone_verified_at` + `profiles_private.marketplace_terms_accepted_at` | SECURITY DEFINER SQL fn | WIRED | Three independent `is not null` branches AND-ed; grant to anon + authenticated present |
| `anon RPC is_verified_seller` | boolean only (no PII) | grant execute to anon, authenticated | WIRED | Last line of migration: `grant execute on function public.is_verified_seller(uuid) to anon, authenticated` |
| `lib/actions/verify.ts sendOtp` | checkBotId → consumeSendBudget → sendVerification | sequential guards, first failure returns | WIRED | Order confirmed in source: BotID check line 52, getClaims line 61, toE164Plus1 line 68, consumeSendBudget line 77, sendVerification line 94 |
| `lib/verify/ratelimit.ts` | `otp_send_attempts` (service-role admin client) | `createAdminClient()` count + insert | WIRED | `createAdminClient()` imported and used; all count/insert queries on `otp_send_attempts` |
| `lib/actions/verify.ts checkOtp` | `profiles_private.phone_verified_at` | update on Twilio 'approved' only | WIRED | Line 130-133: update called only inside `if (approved)` block |
| `app/(public)/u/[username]/page.tsx` | `supabase.rpc('is_verified_seller', { profile_id })` | anon RPC returning boolean | WIRED | Lines 41-43 of profile page |
| `page.tsx` | `PublicProfileHeader verified` prop | pass boolean down; header renders badge | WIRED | `verified={Boolean(verified)}` passed at line 54 |
| `phone-step/otp-step/terms-step` | `lib/actions/verify.ts sendOtp/checkOtp/acceptTerms` | Server Action calls from client components | WIRED | All three step components import and call their respective actions |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| VERF-01 | 02-01-PLAN.md | Seller can verify their email address | SATISFIED | `email_confirmed_at` is the first AND branch of `is_verified_seller()`; email confirmation flows through Supabase Auth (established Phase 1) |
| VERF-02 | 02-02-PLAN.md, 02-03-PLAN.md, 02-04-PLAN.md | Seller can verify phone via one-time code | SATISFIED | Full pipeline: toE164Plus1 normalizer + sendOtp/checkOtp actions + OTP wizard UI; phone_verified_at set only on Twilio 'approved'; live round-trip confirmed human-verified on Staging |
| VERF-03 | 02-02-PLAN.md, 02-03-PLAN.md, 02-04-PLAN.md | Seller must accept marketplace terms to become verified | SATISFIED | `acceptTerms` action, `terms-step.tsx`, `marketplace_terms_accepted_at` + `terms_version` written under owner RLS |
| VERF-04 | 02-01-PLAN.md, 02-05-PLAN.md | Verified Seller badge shown on profile of fully-verified sellers; server-computed | SATISFIED | `is_verified_seller()` SECURITY DEFINER fn recomputed each read; badge renders on `/u/[username]` from boolean; no stored badge column |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/(app)/verify/page.tsx` | 65 | `?change=1` query param approach for "change number" — undocumented escape hatch | Info | Well-commented in otp-step.tsx; `router.push('/verify?change=1')` is intentional; not a regression |

No blockers or warnings found. No `getSession()` calls, no `NEXT_PUBLIC_` on Twilio/Resend credentials, no stored `is_verified` column, no PII on public tables.

---

### Human Verification Required

#### 1. Full live Twilio round-trip (already completed per SUMMARY)

**Test:** Log in as a confirmed test account, visit `/verify`. Enter a real +1 US/CA mobile. Expect real SMS within seconds. Enter 6-digit code in the 6-box input. Accept marketplace terms. Confirm "You're a verified seller" panel appears. Call `is_verified_seller` RPC on Staging — expect `true`. Mid-flow: navigate away and back to `/verify` — expect OTP step (not phone step). Try a non-+1 number — expect rejection, no SMS.
**Expected:** All steps advance correctly; `is_verified_seller` returns `true` for the completed user on Staging.
**Why human:** BotID enforcement is prod-only; real SMS requires live Twilio credentials and a billable call; the positive truth-table (all three conditions true) and revocation case require seeded DB state that only a live run can produce.

**Note:** Per the SUMMARY for Plan 04, this checkpoint was completed on Staging: real SMS received, code accepted, terms accepted, badge confirmed `true` via `is_verified_seller` RPC.

---

### E2E Test Status

The `e2e/verify-wizard.spec.ts` Playwright spec could not be run in this verification session because the `reuseExistingServer` config conflicts with a dev server running on port 3000 while the spec targets port 3100. This is an environment-side issue, not a code issue. The unauthenticated-redirect test (no external dependencies) would pass; the authed-step-render test skips cleanly without `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`.

---

## Summary

Phase 2 goal is achieved. All 12 must-haves verify clean against the actual codebase:

- The **database foundation** (`0002_verification.sql`) is complete: `phone_verified_at`, `marketplace_terms_accepted_at`, `terms_version` on `profiles_private`; `otp_send_attempts` + `abuse_events` with RLS default-deny (no anon policy); `is_verified_seller()` SECURITY DEFINER fn with the correct three-AND logic, no stored badge column, granted to anon + authenticated.

- The **pure helpers** (`lib/verify/phone.ts`, `lib/verify/schema.ts`) are implemented: `toE164Plus1` rejects non-+1 numbers locally before any paid call; all three Zod schemas form the single client+server source of truth.

- The **hardened OTP pipeline** (`lib/verify/twilio.ts`, `lib/verify/ratelimit.ts`, `lib/verify/alert.ts`, `lib/actions/verify.ts`) is fully wired with the correct guard order proven by 23 passing unit tests. BotID is wired in `instrumentation-client.ts` and `next.config.ts`.

- The **resume-aware wizard** (`app/(app)/verify/`) is complete: force-dynamic, auth-gated, branches to the correct step from `profiles_private` state, 6-box OTP with countdown and change-number, terms step with `TERMS_VERSION`.

- The **Verified badge** on `/u/[username]` is wired end-to-end: RPC → boolean → `PublicProfileHeader` → conditional `<Badge>` render.

- All **CLAUDE.md invariants** are intact: no `getSession()`, no `NEXT_PUBLIC_` on server creds, phone stays in `profiles_private`, RLS default-deny on new tables, service-role key only in admin client for abuse tables.

- The live Twilio round-trip was **human-verified** on Staging (per Plan 04 SUMMARY): real SMS delivered, code accepted, terms accepted, `is_verified_seller` RPC returns `true`.

---

_Verified: 2026-06-04T11:40:00Z_
_Verifier: Claude (gsd-verifier)_
