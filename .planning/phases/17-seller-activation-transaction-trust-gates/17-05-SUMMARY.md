---
phase: 17-seller-activation-transaction-trust-gates
plan: 05
subsystem: ui
tags: [messaging, contact-gate, verify, next-navigation, react-hooks, supabase-rls]

# Dependency graph
requires:
  - phase: 17-seller-activation-transaction-trust-gates (Plan 01)
    provides: submitContact not_verified server-action gate (the trust boundary) + lib/verify/gate.ts
  - phase: 17-seller-activation-transaction-trust-gates (Plan 03)
    provides: /verify?require=phone&next= parameterization with safe internal bounce-back
provides:
  - "isPhoneVerified threaded page → ListingDetail → ContactSellerButton (derived from the viewer's OWN profiles_private row, no extra round-trip)"
  - "Unverified contact-gate render branch: authed-but-unverified buyer gets a CTA identical to the verified state but routing to /verify?require=phone&next=…?contact=1 (early gate, invisible until click)"
  - "contact=1 auto-open: returning phone-verified buyer opens the contact modal once, with an English confirmation toast, then the param is stripped"
affects: [contact-gate, seller-activation, messaging, chat-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useMemo-seeded useState for first-render auto-open (avoids the react-hooks/set-state-in-effect cascading-render lint rule)"
    - "own-row flag piggy-backed onto an existing prefill select (zero new round-trips)"

key-files:
  created: []
  modified:
    - "app/(public)/listings/[id]/page.tsx — phone_verified_at added to the own-row prefill select; derive isPhoneVerified; pass to ListingDetail"
    - "components/listings/listing-detail.tsx — isPhoneVerified prop (default false), threaded into ContactSellerButton"
    - "components/messaging/contact-seller-button.tsx — unverified /verify branch + contact=1 auto-open"

key-decisions:
  - "Auto-open seeds useState from a useMemo trigger computed on first render, NOT via setState-in-effect — the project's react-hooks/set-state-in-effect lint rule (cascading renders) blocked the naive setOpen(true) inside the effect"
  - "phone_verified_at piggy-backs on the existing prefill select (no extra round-trip), reading only the caller's OWN row under owner RLS — the flag is non-PII-adjacent"
  - "The unverified CTA is byte-identical in appearance to the verified one (same Button, same text 'Contact Seller About This Part') — the gate is invisible until click (CONTEXT)"

patterns-established:
  - "Early gate UX: when there's nothing to preserve (no draft), route to /verify BEFORE opening any modal; the server not_verified gate (Plan 01) stays the authority"
  - "Return-confirmation continuity: next=…?contact=1 + first-render auto-open + router.replace param-strip gives a verify→return→modal-already-open flow with zero extra clicks and no refresh re-fire"

requirements-completed: [MSG-01, MSG-05, VERF-02]

# Metrics
duration: ~4 min
completed: 2026-06-19
---

# Phase 17 Plan 05: Contact Gate UX Summary

**An authenticated-but-unverified buyer's "Contact Seller" CTA looks identical to the verified state but routes to /verify?require=phone&next=…?contact=1; on return verified the contact modal auto-opens once and the param is stripped.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-19T14:00:12Z
- **Completed:** 2026-06-19T14:03:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- isPhoneVerified derived from the viewer's OWN profiles_private row (added to the existing prefill select — no new round-trip) and threaded page → ListingDetail → ContactSellerButton.
- New render branch between anon (#4) and verified-modal (#5): authed-but-unverified buyer gets a CTA visually identical to #5 but a `<Link>` to `/verify?require=phone&next=/listings/[id]?contact=1`.
- contact=1 auto-open on return: a now-phone-verified buyer lands with the modal already open, a brief English toast ("Phone verified — you're all set"), and `?contact=1` stripped via `router.replace` so a plain refresh never re-opens it.
- Guards ensure the auto-open never fires for owner, sold/expired listing, an existing thread, or a still-unverified viewer. ContactFormModal + submitContact + the contact-before-thread order (invariant #5) untouched — contract test 7/7 green.

## Task Commits

Each task was committed atomically (race-proof `git commit -- <pathspec>`, verified clean with `git show --stat`):

1. **Task 1: Derive isPhoneVerified and thread it down** - `3f71f2c` (feat) — page.tsx + listing-detail.tsx
2. **Task 2: Unverified branch + contact=1 auto-open** - `18ec72b` (feat) — contact-seller-button.tsx

_Note: the parallel 17-04 executor advanced HEAD on top of these (905e9c0); both my commits remain intact and clean (only my plan's files each)._

## Files Created/Modified
- `app/(public)/listings/[id]/page.tsx` - Added `phone_verified_at` to the own-row prefill select; derive `isPhoneVerified`; pass to `<ListingDetail>`.
- `components/listings/listing-detail.tsx` - Added `isPhoneVerified?: boolean` (default false); thread into `<ContactSellerButton>`.
- `components/messaging/contact-seller-button.tsx` - New `isPhoneVerified` prop; unverified `/verify?require=phone` branch (identical appearance to the verified CTA); first-render `contact=1` auto-open (useMemo-seeded useState + effect that toasts and strips the param).

## Decisions Made
- **useMemo-seeded useState instead of setState-in-effect.** The plan's suggested `setOpen(true)` inside the auto-open effect tripped the project's `react-hooks/set-state-in-effect` eslint rule (cascading renders), which the pre-commit hook enforces. Resolved by computing a `shouldAutoOpen` trigger via `useMemo([])` on first render, seeding `useState(shouldAutoOpen)`, and keeping the effect for side-effects only (toast + `router.replace`). Same observable behavior; lint-clean.
- **Flag piggy-backs on the existing select.** `phone_verified_at` added to the same `profiles_private` prefill read — no extra round-trip, owner-RLS, caller's own row only.
- **Gate invisible until click.** The unverified CTA reuses the exact Button + text of the verified CTA (CONTEXT).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] setState-in-effect lint error blocked the commit**
- **Found during:** Task 2 (unverified branch + auto-open)
- **Issue:** The plan's snippet called `setOpen(true)` synchronously inside `React.useEffect`; the repo's eslint config enforces `react-hooks/set-state-in-effect` (cascading-render guard), so the pre-commit `eslint --fix` failed and rolled back the commit.
- **Fix:** Refactored to compute the auto-open trigger once via `React.useMemo(..., [])` on first render, seed `React.useState(shouldAutoOpen)` with it, and keep the effect solely for the toast + `router.replace` param-strip. Behavior identical (modal opens once on verified return, refresh doesn't re-open).
- **Files modified:** components/messaging/contact-seller-button.tsx
- **Verification:** `npx tsc --noEmit` clean; `npx eslint components/messaging/contact-seller-button.tsx` clean; pre-commit hook passed.
- **Committed in:** `18ec72b` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to satisfy the repo's enforced lint rule; same UX, no scope change. The "place setState in the effect" instruction was the only delta — the early-gate routing, contact=1 contract, and guard set are exactly as planned.

## Issues Encountered
- The husky/lint-staged `eslint --fix` is enforcing — the first commit attempt for Task 2 failed and auto-reverted (no partial commit left behind), surfacing the lint rule cleanly before any bad state landed. Resolved by the refactor above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The contact gate UX is complete and continuous: verify → return → modal already open. The server `not_verified` gate (Plan 01) remains the authority; this is pure UX convenience layered on top.
- Anon viewers still route to `/login`; owner / sold / existing-thread states are unchanged.
- Wave 2 sibling 17-04 (publish gate) executed concurrently without file overlap.

---
*Phase: 17-seller-activation-transaction-trust-gates*
*Completed: 2026-06-19*

## Self-Check: PASSED
- All 3 modified files present on disk.
- Both task commits (3f71f2c, 18ec72b) present in history.
- `npx tsc --noEmit` clean; eslint clean; messaging contract test 7/7 green.
