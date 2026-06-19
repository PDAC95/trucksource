---
phase: 17-seller-activation-transaction-trust-gates
verified: 2026-06-19T00:00:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "OTP round-trip — sell gate happy path"
    expected: "Unverified seller fills /sell, clicks Publish, redirects to /verify?require=seller, completes phone OTP + terms, returns to /sell with 'Phone verified' toast, draft fields rehydrate (minus photos), second Publish succeeds."
    why_human: "Requires live Twilio Verify SMS send on Staging; BotID always scores non-bot locally; draft round-trip only testable with a real browser session."
  - test: "OTP round-trip — contact gate happy path"
    expected: "Unverified buyer on a listing page clicks 'Contact Seller About This Part', redirects to /verify?require=phone&next=…?contact=1, completes phone OTP, returns to listing with 'Phone verified' toast and Contact Seller modal already open."
    why_human: "Same Twilio + BotID dependency as above; modal auto-open behavior requires real browser with real auth state."
  - test: "RLS backstop fires independently of server action"
    expected: "A raw authenticated Supabase request (anon key, unverified user) directly INSERTing a listing row is rejected by the 'listings owner-insert' policy; same for contact_log."
    why_human: "Requires direct DB call bypassing the Next.js server action — can only be confirmed via Supabase Studio or a test script against Staging."
---

# Phase 17: Seller Activation & Transaction Trust Gates — Verification Report

**Phase Goal:** Wire the just-in-time phone-verification trust gates so verification ACTUALLY gates seller activation and buyer contact. Publish gate = phone + marketplace terms; contact gate = phone only. `/verify` is parameterized with `?next=/`require`. Functional nav entry points exist. Listing-draft preservation + contact early-gate.
**Verified:** 2026-06-19
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1 | `createListing` rejects unverified sellers with `not_verified` before any DB write | VERIFIED | `lib/actions/listings.ts:193-194` — `requireVerifiedSeller` fires as STEP 0, before schema parse (line 196) and before any insert |
| 2 | `submitContact` rejects phone-unverified buyers with `not_verified` before `contact_log` write | VERIFIED | `lib/actions/contact.ts:89-90` — `requirePhoneVerified` fires before rate-limit check (line 93) and before `contact_log` INSERT (line 126) |
| 3 | RLS backstops: `listings` owner-insert WITH CHECK `is_verified_seller`; `contact_log` buyer-insert WITH CHECK `phone_verified_at IS NOT NULL` | VERIFIED | `supabase/migrations/0027_trust_gate_rls.sql` — drops + recreates both policies with the verification arm |
| 4 | `/verify` is level-aware: `?require=phone` completes at phone; absent/`seller` also requires terms; safe-`next` open-redirect guard present | VERIFIED | `app/(app)/verify/page.tsx:21-23` (`safeNext`), lines 60-61 (`requireTerms = require !== "phone"`, `done = phoneVerified && (!requireTerms \|\| termsAccepted)`), line 66-68 (redirect on done + safe target) |
| 5 | Sell-gate UX: `/sell` banner for unverified; Publish saves draft to `sessionStorage:sell-draft:v1` and redirects to `/verify?require=seller&next=/sell?verified=1`; draft clears only on successful publish | VERIFIED | `components/listings/listing-form.tsx:113` (key), lines 464-487 (`saveDraft()`), lines 495-498 (gate intercept), lines 572-578 (clear on success) |
| 6 | Contact-gate UX: unverified authed buyer sees identical CTA (Link to `/verify?require=phone&next=…contact=1`); `?contact=1` auto-opens modal on return | VERIFIED | `components/messaging/contact-seller-button.tsx:121-130` (unverified branch), lines 62-73 (`shouldAutoOpen`), lines 80-86 (effect: toast + `router.replace`) |
| 7 | Nav entries: Sell in header + mobile menu; My Listings + Account in user-menu dropdown + mobile menu; "Become a verified seller" CTA on `/account` | VERIFIED | `components/layout/site-header.tsx:64` (Sell link); `components/layout/mobile-menu.tsx:57-95` (Sell, My Listings, Account); `components/layout/user-menu.tsx:79-87` (dropdown); `app/(app)/account/page.tsx:85-94` (CTA → `/verify?require=seller`) |
| 8 | `e2e/trust-gates.spec.ts` exists asserting gate routing (`require=seller` / `require=phone`) and nav presence | VERIFIED | File exists at `e2e/trust-gates.spec.ts` — 191 lines covering nav-presence, sell-gate routing (unverified), and contact-gate routing (anon regression + unverified buyer) |

**Score:** 8/8 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/verify/gate.ts` | `requirePhoneVerified` + `requireVerifiedSeller` reading `profiles_private` flags | VERIFIED | 47 lines; both exports present; reads `phone_verified_at` and `marketplace_terms_accepted_at` via owner RLS, one round-trip each |
| `lib/actions/listings.ts` | `not_verified` added to `CreateListingResult`; `requireVerifiedSeller` wired as STEP 0 | VERIFIED | Type union at line 158; gate at lines 193-194; import at line 9 |
| `lib/actions/contact.ts` | `not_verified` added to `SubmitContactResult`; `requirePhoneVerified` wired before `contact_log` | VERIFIED | Type union at line 43; gate at lines 89-90; import at line 12 |
| `supabase/migrations/0027_trust_gate_rls.sql` | RLS WITH CHECK arms on listings + contact_log | VERIFIED | 37 lines; drops + recreates both insert policies with verification arms |
| `app/(app)/verify/page.tsx` | Level-aware wizard; safe-next guard; `?sent=1` gates OtpStep | VERIFIED | `safeNext` at lines 21-23; level logic at lines 60-61; OtpStep gated on `phone && sent === "1" && change !== "1"` at line 93 |
| `app/(app)/sell/page.tsx` | Passes `isVerifiedSeller` + `phoneVerified` to `ListingForm` | VERIFIED | Both flags computed at lines 63-79; passed as props at lines 98-99 |
| `components/listings/listing-form.tsx` | Banner switches on `phoneVerified`; draft save + redirect on unverified Publish; draft cleared only on success | VERIFIED | Banner at lines 630-638; `saveDraft()` at lines 464-487; gate at lines 495-498; clear at lines 572-578 |
| `components/messaging/contact-seller-button.tsx` | Unverified branch → `/verify?require=phone&next=…?contact=1`; auto-open on `?contact=1` return | VERIFIED | Unverified branch at lines 121-130; `shouldAutoOpen` at lines 62-73; effect at lines 80-86 |
| `app/(app)/account/page.tsx` | "Become a verified seller" CTA for unverified users → `/verify?require=seller` | VERIFIED | CTA at lines 85-94 |
| `e2e/trust-gates.spec.ts` | Gate routing + nav assertions | VERIFIED | 191 lines; 4 test cases across 3 describe blocks |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/actions/listings.ts` | `lib/verify/gate.ts` | `requireVerifiedSeller` call at line 193 | WIRED | Import at line 9; call fires before schema parse |
| `lib/actions/contact.ts` | `lib/verify/gate.ts` | `requirePhoneVerified` call at line 89 | WIRED | Import at line 12; call fires before rate limit and `contact_log` insert |
| `components/listings/listing-form.tsx` | `/verify` | `router.push("/verify?require=seller&next=/sell?verified=1")` at line 497 | WIRED | `saveDraft()` called synchronously first; draft survives round-trip |
| `components/messaging/contact-seller-button.tsx` | `/verify` | `Link href="/verify?require=phone&next=${next}"` at line 125 | WIRED | Unverified branch renders identical CTA appearance but as Link |
| `app/(app)/verify/page.tsx` | `safeNext` guard | `n.startsWith("/") && !n.startsWith("//")` at line 22 | WIRED | Open-redirect guard validates all `?next=` values before use |
| `supabase/migrations/0027_trust_gate_rls.sql` | `is_verified_seller()` RPC | `public.is_verified_seller((select auth.uid()))` in policy WITH CHECK | WIRED | SECURITY DEFINER RPC, granted to authenticated; callable from policy |

---

## UAT Fix Confirmation

| Fix | Commit | Status | Evidence |
|-----|--------|--------|---------|
| OtpStep gated on `?sent=1` (not merely phone-on-file) | d0b6d88 | VERIFIED | `app/(app)/verify/page.tsx:93` — `phone && sent === "1" && change !== "1"` |
| Banner copy switches on `phoneVerified` | bae63ab | VERIFIED | `components/listings/listing-form.tsx:634-636` — ternary: "Accept the marketplace terms…" vs "Verify your phone…" |

---

## TypeScript Check

```
npx tsc --noEmit
```

**Result:** Clean — no output, zero errors.

---

## Requirements Coverage

Phase 17 is explicitly documented as "behavioral extensions of VERF-02/03/04, LIST-01, MSG-01/05 — NO new requirement IDs." The phase 17 plans claim IDs from the v1 original requirements (`VERF-02`, `VERF-03`, `VERF-04`, `LIST-01`, `MSG-01`, `MSG-05`). The current `REQUIREMENTS.md` covers the v1.1 rebrand milestone (BRND/THEM/CHRM IDs) — the v1 requirements are upstream baseline. No orphaned requirements found.

---

## Anti-Patterns Found

None. All new files are substantive implementations. The `return null` at `e2e/trust-gates.spec.ts:53` is intentional (helper signaling no active listing in feed, not a stub).

---

## Deferred Items (Out-of-Scope, Not Phase Gaps)

These are documented in `deferred-items.md` and are not gaps for this phase:

1. **Staging auth-email Resend SMTP failure** — provider/infra config, pre-launch fix. Tracked in STATE.md Open Blockers #3.
2. **`e2e/home.spec.ts:22` stale heading assertion** — Phase 16 browse-rework drift; browse page untouched by Phase 17.

---

## Human Verification Required

### 1. Live OTP round-trip — sell gate

**Test:** Log in as an unverified account on Staging. Navigate to `/sell`. Confirm the banner reads "Verify your phone to publish. Fill it out — your work is saved." Fill in title and price. Click Publish. Confirm redirect to `/verify?require=seller&next=/sell?verified=1`. Complete phone OTP + marketplace terms. Confirm return to `/sell` with "Phone verified — you're all set" toast and form fields pre-filled (minus photos). Re-attach photos and click Publish. Confirm listing is created.
**Expected:** Seamless draft preservation, toast confirmation, successful publish.
**Why human:** Requires live Twilio Verify SMS (trial account only sends to Verified Caller IDs); BotID always scores non-bot locally; draft round-trip requires real browser sessionStorage.

### 2. Live OTP round-trip — contact gate

**Test:** Log in as an unverified account on Staging. Navigate to an active listing. Click "Contact Seller About This Part." Confirm redirect to `/verify?require=phone&next=/listings/<id>?contact=1`. Complete phone OTP (terms step is skipped — `require=phone`). Confirm return to listing with "Phone verified — you're all set" toast and Contact Seller modal already open. Submit a message.
**Expected:** Zero extra clicks after verify; modal auto-opens; contact submitted successfully.
**Why human:** Same Twilio + BotID dependency; modal auto-open requires real browser with real auth state and `?contact=1` in URL.

### 3. RLS backstop verification

**Test:** Using Supabase Studio or a raw Supabase client with the anon key, attempt to INSERT a row into `listings` as a confirmed but unverified user (no `phone_verified_at`). Separately attempt to INSERT a row into `contact_log`.
**Expected:** Both INSERTs rejected with RLS policy violation.
**Why human:** Requires direct DB access bypassing the Next.js server action layer.

---

## Summary

All 8 must-haves are verified against the actual codebase. The gate architecture is correctly layered:

- **Server actions** are the primary trust boundary (gate fires before any DB write in both `createListing` and `submitContact`).
- **RLS** provides defense-in-depth backstop (migration 0027 closes the anon-key bypass path).
- **`/verify` wizard** is correctly parameterized with level-awareness (`require=phone` vs `require=seller`/absent) and an open-redirect guard.
- **UX** flows are wired end-to-end: sell-draft sessionStorage preservation, contact modal auto-open on return, nav entries in all three surfaces (header, user-menu dropdown, mobile menu), and the "Become a verified seller" CTA on `/account`.
- **e2e spec** covers deterministic routing assertions; live OTP happy paths are deferred to manual UAT per spec design.
- **TypeScript:** clean.

Phase goal is achieved. The trust gates are wired — verification ACTUALLY gates the two transactions.

---

_Verified: 2026-06-19_
_Verifier: Claude (gsd-verifier)_
