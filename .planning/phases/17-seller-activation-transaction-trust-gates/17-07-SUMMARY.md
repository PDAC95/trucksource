---
phase: 17-seller-activation-transaction-trust-gates
plan: 07
subsystem: testing
tags: [playwright, e2e, trust-gates, verify, twilio, botid, otp]

# Dependency graph
requires:
  - phase: 17-01
    provides: server-action not_verified gates (createListing / submitContact)
  - phase: 17-02
    provides: RLS WITH CHECK backstops on listings + contact_log insert
  - phase: 17-03
    provides: parameterized /verify (?next / ?require)
  - phase: 17-04
    provides: sell publish-gate UI + draft preservation
  - phase: 17-05
    provides: contact-gate UI + ?contact=1 auto-open
  - phase: 17-06
    provides: functional nav entries + /account verify CTA
provides:
  - e2e/trust-gates.spec.ts (deterministic gate-routing + nav-presence assertions)
  - confirmed ops (OTP_SEND_DAILY_CAP on Vercel, Twilio billing alert, prod BotID smoke) — user-attested
  - three UAT-surfaced verify-flow fixes (OTP-step sent gating, change-number nav, publish-gate banner wording)
affects: [phase-15-qa, phase-9-chat, pre-launch-infra]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "e2e split posture: deterministic anon leg runs in CI; credentialed/unverified legs test.skip behind env (mirrors verify-wizard.spec)"
    - "live-SMS + prod-only BotID validated MANUALLY at the human-verify checkpoint, never in CI"

key-files:
  created:
    - e2e/trust-gates.spec.ts
  modified:
    - app/(app)/verify/page.tsx
    - app/(app)/verify/phone-step.tsx
    - app/(app)/sell/page.tsx
    - components/listings/listing-form.tsx

key-decisions:
  - "OTP step only renders after ?sent=1 (an explicit successful-send signal), never just because a phone is on file"
  - "Change-number navigates router.push /verify?sent=1 (dropping ?change) instead of router.refresh to escape the Sending… stuck state"
  - "Publish-gate banner names the actual outstanding step: phoneVerified threaded /sell → ListingForm so it says terms vs phone correctly"
  - "Unverified-gate e2e legs require a phone-less account that does not exist in CI → kept behind E2E_UNVERIFIED_* test.skip"

patterns-established:
  - "Gate-routing e2e asserts require=seller / require=phone destination URLs without external SMS/BotID network"

requirements-completed: [LIST-01, MSG-01, MSG-05, VERF-02, VERF-03, VERF-04]

# Metrics
duration: ~25min
completed: 2026-06-19
---

# Phase 17 Plan 07: E2E Trust-Gate Lock + Ops Confirm Summary

**Deterministic Playwright trust-gate spec (gate routing + nav presence) plus the human-verified ops confirmation (OTP spend cap, Twilio alert, prod BotID) that closes Phase 17 — and three real verify-flow defects the now-universal /verify funnel exposed during live UAT.**

## Performance

- **Duration:** ~25 min (across the checkpoint)
- **Started:** 2026-06-19 (autonomous tasks)
- **Completed:** 2026-06-19 (checkpoint approved)
- **Tasks:** 3 (2 autonomous + 1 blocking human-verify)
- **Files modified:** 5 (1 created spec + 4 UAT fixes)

## Accomplishments

- `e2e/trust-gates.spec.ts` locks the phase behavior: unverified Publish → `/verify?require=seller&next=/sell`; unverified Contact → `/verify?require=phone&next=…contact=1`; nav presence (Sell + My Listings + Account); anon Contact → `/login?next=` (regression guard). Deterministic anon leg runs in CI; the three credentialed legs `test.skip` behind `E2E_UNVERIFIED_*` because no phone-less staging account exists in CI.
- Full Playwright suite run serially (`--workers=1`): only failure is the pre-existing stale `home.spec.ts:22` Phase-16 browse-heading assertion (uncommitted working-tree edit, unrelated to Phase 17). No new regression introduced by the gates/nav.
- Ops confirmed at the human-verify checkpoint (USER-ATTESTED, not machine-verified): `OTP_SEND_DAILY_CAP` set on Vercel for the wider buyer+seller audience; Twilio billing/usage alert present; prod BotID protect-path coverage of the `/verify` Server-Action POST smoke-tested.
- Live happy paths exercised end-to-end and confirmed by the user: SELL (draft-preserving publish with real OTP + real Twilio SMS + real publish) and CONTACT (auto-open after phone-only verify).
- Three real defects, exposed BECAUSE Phase 17 now funnels all users through `/verify`, found and fixed during UAT (see Deviations).

## Task Commits

1. **Task 1: Write e2e/trust-gates.spec.ts** — `331d306` (test)
2. **Task 2: Full-suite regression gate** — covered by Task 1's spec; no source change (results recorded in `3696073`)
3. **Task 3: Human-verify checkpoint (ops + live happy paths + BotID)** — APPROVED by user; ops user-attested
   - Checkpoint state recorded: `3696073` (docs)

**UAT fixes (during checkpoint):**
- `d0b6d88` (fix) — OTP step only after `?sent=1`; change-number nav fix
- `bae63ab` (fix) — publish-gate banner names the actual missing step

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `e2e/trust-gates.spec.ts` — deterministic gate-routing + nav-presence assertions (anon leg in CI, credentialed legs skip)
- `app/(app)/verify/page.tsx` — gate OtpStep render on explicit `?sent=1` signal (not merely a phone-on-file)
- `app/(app)/verify/phone-step.tsx` — `router.push /verify?sent=1` (drops `?change`) instead of `router.refresh`
- `app/(app)/sell/page.tsx` — thread `phoneVerified` to the listing form for correct banner wording
- `components/listings/listing-form.tsx` — publish-gate banner says "Accept the marketplace terms to publish" when phone is already verified

## Decisions Made

- Live-SMS + prod-only BotID are validated MANUALLY at the checkpoint (CI cannot send real SMS, BotID is non-bot locally) — the spec documents this split in a header comment, mirroring verify-wizard.spec.
- The unverified-gate e2e legs need a phone-less account that does not exist in CI; rather than fabricate one, they `test.skip` behind `E2E_UNVERIFIED_*` (the server gate is unit-covered in Plan 01, the RLS backstop in Plan 02).
- Ops items (`OTP_SEND_DAILY_CAP`, Twilio alert, BotID prod matching) are confirm-don't-rebuild — the anti-abuse pipeline already covers buyers+sellers; only the production env value and dashboard alert were set by the user.

## Deviations from Plan

### Auto-fixed Issues (UAT, exposed by the now-universal /verify funnel)

**1. [Rule 1 - Bug] Verify wizard showed the OTP step with no code dispatched**
- **Found during:** Task 3 live UAT (SELL happy path)
- **Issue:** `verify/page.tsx` routed to `OtpStep` whenever a phone was on file — but registration persists the phone, so freshly-registered/gated users landed on "Enter your code" with no code ever sent.
- **Fix:** Gate `OtpStep` on an explicit `?sent=1` signal set by phone-step after a successful send; otherwise show the pre-filled `PhoneStep` with a "Send code" CTA.
- **Files modified:** `app/(app)/verify/page.tsx`, `app/(app)/verify/phone-step.tsx`
- **Verification:** tsc clean; user completed a real OTP round-trip on local dev.
- **Committed in:** `d0b6d88`

**2. [Rule 1 - Bug] "Change number" stuck on "Sending code…"**
- **Found during:** Task 3 live UAT
- **Issue:** "Change number" left `?change=1` in the URL; phone-step's `router.refresh()` re-rendered `PhoneStep` and hung on the "Sending code…" state.
- **Fix:** phone-step `router.push /verify?sent=1` (preserving `next`/`require`, dropping `change`) instead of `router.refresh()`.
- **Files modified:** `app/(app)/verify/phone-step.tsx`
- **Verification:** tsc clean; change-number flow verified by user on local dev.
- **Committed in:** `d0b6d88`

**3. [Rule 1 - Bug] Publish-gate banner named the wrong missing step**
- **Found during:** Task 3 live UAT (CONTACT-then-SELL path)
- **Issue:** Banner was hardcoded "Verify your phone to publish", but a buyer who verified via the contact gate (`require=phone`, no terms) arrives at `/sell` with phone done and only marketplace terms outstanding.
- **Fix:** Thread `phoneVerified` from `/sell` page → `ListingForm`; banner now reads "Accept the marketplace terms to publish" when phone is already verified.
- **Files modified:** `app/(app)/sell/page.tsx`, `components/listings/listing-form.tsx`
- **Verification:** tsc clean; user confirmed correct banner + real publish on local dev.
- **Committed in:** `bae63ab`

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs surfaced by Phase 17's universal /verify funnel)
**Impact on plan:** All three were latent defects the phase's gating exposed (the funnel is the value, not a regression). No scope creep — each fix is contained to the verify/sell surface and tsc-clean.

## Issues Encountered

- Auth email send fails on Staging (`supabase.auth.signUp` → "500 unexpected_failure: Error sending confirmation email", Resend custom SMTP), so the UAT test account had to be created via service-role `admin.createUser`. Logged to deferred-items (pre-launch infra fix). Did not block the gate verification itself.
- 4-worker parallel Playwright runs produce spurious empty-URL/timeout failures across many specs that all clear serially — single `next dev` load, not regressions. Use `--workers=1` (or CI's built server) for a clean signal.

## User Setup Required

Ops confirmed by the user at the checkpoint (USER-ATTESTED):
- `OTP_SEND_DAILY_CAP` set on Vercel (recommend 300–500; defaults 200) for the wider buyer+seller surface.
- Twilio billing/usage alert for Verify spend present.
- Prod BotID protect-path coverage of the `/verify` Server-Action POST smoke-tested.

## Next Phase Readiness

- Phase 17 (Seller Activation & Transaction Trust Gates) is COMPLETE (7/7). The trust boundary holds end-to-end: server-action gates (authority) + RLS backstop, parameterized /verify, sell/contact gate UX, functional nav, and the e2e lock.
- Deferred (pre-launch, NOT Phase 17): own-domain Resend SMTP to fix Staging auth-email sends; `home.spec.ts:22` stale Phase-16 browse-heading assertion.
- Phase 11 (v1.1 rebrand) 11-04 still pends stakeholder logo assets.

## Self-Check: PASSED

All claimed files exist on disk (trust-gates.spec.ts + 4 UAT-fix files + this SUMMARY) and all four commits resolve in `git log` (331d306, 3696073, d0b6d88, bae63ab).

---
*Phase: 17-seller-activation-transaction-trust-gates*
*Completed: 2026-06-19*
