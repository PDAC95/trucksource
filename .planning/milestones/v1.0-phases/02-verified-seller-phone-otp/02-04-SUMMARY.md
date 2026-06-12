---
phase: 02-verified-seller-phone-otp
plan: 04
subsystem: ui
tags: [verify, otp, twilio, wizard, react-hook-form, zod, shadcn, input-otp, next]

# Dependency graph
requires:
  - phase: 02-verified-seller-phone-otp (plan 03)
    provides: sendOtp/checkOtp/acceptTerms Server Actions + sendOtpSchema/checkOtpSchema/acceptTermsSchema/TERMS_VERSION + BotID wiring
  - phase: 02-verified-seller-phone-otp (plan 01)
    provides: profiles_private resume columns (phone, phone_verified_at, marketplace_terms_accepted_at), is_verified_seller RPC
  - phase: 01-foundation-privacy-model
    provides: force-dynamic (app) layout auth gate (getClaims → redirect /login), register-form RHF+zodResolver+sonner pattern
provides:
  - "Authenticated, resume-on-abandon /verify wizard: phone → 6-box OTP → marketplace terms"
  - "force-dynamic server page whose single source of truth for the current step is the user's own profiles_private row"
  - "shadcn input-otp primitive (6-box paste + auto-advance)"
  - "Live resend countdown + change-number affordance on the OTP step"
  - "E2E spec asserting the (app) auth gate and step rendering for /verify"
affects: [verified-badge, listings, my-garage, contact-chat]

# Tech tracking
tech-stack:
  added: [input-otp]
  patterns:
    - "Resume step derived server-side from persisted DB state, not client wizard state (survives reload/navigation)"
    - "Step transitions via router.refresh() so the force-dynamic page re-resolves the correct step from the freshly-persisted row"
    - "?change=1 query param forces the OTP step back to phone entry without losing the on-file number"

key-files:
  created:
    - app/(app)/verify/page.tsx
    - app/(app)/verify/phone-step.tsx
    - app/(app)/verify/otp-step.tsx
    - app/(app)/verify/terms-step.tsx
    - components/ui/input-otp.tsx
    - e2e/verify-wizard.spec.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Step state is server-derived from profiles_private (the same columns the badge reads), so the wizard never forces a restart on return — client step components only advance via router.refresh()."
  - "Change-number is a ?change=1 link back to the force-dynamic page (re-renders phone-step pre-filled) rather than a dedicated action; the next send invalidates the prior Twilio OTP."
  - "E2E is scoped to deterministic routing/gating + step rendering; the real SMS round-trip and mid-flow resume are validated in the live human-verify checkpoint (Twilio + BotID are external/prod-only)."

patterns-established:
  - "DB-as-wizard-state: a multi-step authed flow resumes from persisted owner-RLS columns rather than ephemeral client state."
  - "router.refresh() advance: client steps call Server Actions then refresh; the force-dynamic server page is the single place that decides the step."

requirements-completed: [VERF-02, VERF-03]

# Metrics
duration: ~35min
completed: 2026-06-04
---

# Phase 2 Plan 04: Verification Wizard UI Summary

**A force-dynamic, resume-on-abandon /verify wizard (phone → 6-box OTP with live resend countdown → marketplace terms) whose current step is derived from the user's own profiles_private row, completing the verified-seller flow — confirmed live end-to-end with Twilio Verify.**

## Performance

- **Duration:** ~35 min (spanning the live human-verify checkpoint)
- **Tasks:** 4 (3 auto + 1 human-verify checkpoint)
- **Files modified:** 8 (6 created, 2 dep manifests)

## Accomplishments
- Resume-aware `/verify` server page: re-reads claims defensively, selects only the three resume signals via owner RLS, and branches to phone / OTP / terms / "verified" panel — `force-dynamic` so caching can never resume the wrong user's state (PITFALL #6).
- Three client step components on the register-form RHF + zodResolver + sonner pattern, wired to the Plan 03 Server Actions (sendOtp/checkOtp/acceptTerms) with friendly error-code → toast mapping (region_unsupported, rate_limited, spend_cap).
- OTP step: 6-box `InputOTP` (paste fills all boxes, auto-advance), a live ~45s resend countdown, a masked number, and a "Change number" affordance (`?change=1`).
- Terms step records `marketplace_terms_accepted_at` + `TERMS_VERSION`.
- E2E spec asserting unauth `/verify` → `/login` and phone-step rendering, kept green in CI with no external network.

## Task Commits

1. **Task 1: Resume-aware /verify page + input-otp primitive** - `9ffea5c` (feat)
2. **Task 2: Phone/OTP/terms wizard step components** - `fa18982` (feat)
3. **Task 3: E2E for /verify auth gate + step rendering** - `377edc2` (test)
4. **Task 4: Human-verify full live wizard** - no commit (verification only — PASSED)

**Plan metadata:** committed with STATE/ROADMAP/REQUIREMENTS updates.

## Files Created/Modified
- `app/(app)/verify/page.tsx` - force-dynamic server component; reads profiles_private resume signals, renders the correct step.
- `app/(app)/verify/phone-step.tsx` - +1 phone entry; sendOtp → router.refresh() to advance to OTP.
- `app/(app)/verify/otp-step.tsx` - 6-box InputOTP, live resend countdown, masked number, change-number link; checkOtp → router.refresh().
- `app/(app)/verify/terms-step.tsx` - marketplace-terms checkbox + link; acceptTerms({accept, termsVersion: TERMS_VERSION}).
- `components/ui/input-otp.tsx` - shadcn input-otp primitive.
- `e2e/verify-wizard.spec.ts` - auth-gate + step-rendering E2E.
- `package.json` / `package-lock.json` - input-otp dependency.

## Live Verification Evidence (Task 4 — human-verify, APPROVED)

Verified by the user on the dev env after configuring Twilio Verify (`.env.local`: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID, OTP_SEND_DAILY_CAP=200, RESEND_API_KEY, ABUSE_ALERT_EMAIL=12gapatricio@gmail.com — trial account, sends only to Twilio Verified Caller IDs until upgraded):

- **Happy path:** real SMS delivered, code accepted, marketplace terms accepted, redirected to dashboard.
- **Resume:** re-entering `/verify` mid-flow resumed on the OTP step (not phone), confirming DB-as-wizard-state.
- **Data-level (Staging):** the user's `profiles_private` row has `phone_verified_at` SET and `marketplace_terms_accepted_at` SET with `terms_version = 2026-06-03`; the `is_verified_seller` RPC returns `true`.

## Decisions Made
- See key-decisions in frontmatter — DB-derived step state, `?change=1` change-number, and checkpoint-scoped E2E.

## Deviations from Plan

None - plan executed exactly as written. Tasks 1-3 implemented as specified; Task 4 (human-verify) passed live.

## Issues Encountered
None. This plan ran solo (no parallel sibling), so the husky/lint-staged cross-attribution anomaly seen in 02-03 did not recur.

## Deferred / Known (not regressions)
- **BotID is prod-only** — local always evaluates non-bot, so the BotID guard could not be exercised in the live local round-trip (it is unit-tested for guard order in Plan 03).
- **`/terms` link target route does not exist yet** — same pre-existing gap as the register form's `/terms` and `/privacy` links. Out of scope for Phase 2.
- **Twilio trial account** — only delivers to Verified Caller IDs until upgraded; pre-launch follow-up.

## User Setup Required
None new — the Twilio Verify service + env vars were the Plan 03 user_setup, now configured on the dev env (see 02-03-SUMMARY / `.env.example`). Pre-launch: upgrade Twilio off trial; verify an own/sub-domain in Resend.

## Next Phase Readiness
- Phase 2 (Verified Seller / Phone OTP) is complete: the verified-seller flow is shipped end-to-end (badge RPC, hardened OTP pipeline, and the live-verified wizard). VERF-02 and VERF-03 satisfied.
- Ready for Phase 3 (Fitment Taxonomy), which is flagged for `/gsd:research-phase` (product-novel taxonomy).

## Self-Check: PASSED

All 6 created files + the SUMMARY exist on disk; all three task commits (9ffea5c, fa18982, 377edc2) are present in git history.

---
*Phase: 02-verified-seller-phone-otp*
*Completed: 2026-06-04*
