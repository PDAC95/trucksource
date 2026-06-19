---
phase: 17-seller-activation-transaction-trust-gates
plan: 03
subsystem: auth
tags: [verify, otp, gate, next, require, open-redirect, nextjs, supabase]

# Dependency graph
requires:
  - phase: 02-verified-seller-otp
    provides: "/verify resume-on-abandon wizard (phone → OTP → terms) backed by profiles_private as single source of truth"
provides:
  - "Parameterized /verify wizard: ?next= return target + ?require=phone|seller required level"
  - "Level-aware completion (done = phone + terms-unless-phone-only) with safeNext open-redirect guard"
  - "OTP Change-number navigation that preserves next/require across the round-trip"
affects: [17-wave-2-gates, 17-contact-gate, 17-publish-gate, 17-07-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Open-redirect guard: ?next is safe only if it starts with '/' and not '//' (scheme-less internal path); never trusted raw"
    - "Level-aware wizard completion driven by ?require, keeping phone/OTP/terms step internals untouched"

key-files:
  created: []
  modified:
    - "app/(app)/verify/page.tsx"
    - "app/(app)/verify/otp-step.tsx"

key-decisions:
  - "require !== 'phone' ⇒ requireTerms (default/absent/seller all require marketplace terms; only phone-only contact gate skips them)"
  - "done-redirect runs BEFORE step-branching; unsafe/absent next falls through to the existing confirmation panel (no behavior change for the no-next case)"
  - "TermsStep branch guarded to (requireTerms && phoneVerified && !termsAccepted) so require=phone never routes to terms"
  - "phone-step left untouched — it uses router.refresh() (URL preserved); only otp-step's explicit router.push needed the param carry"

patterns-established:
  - "safeNext(n) helper: internal scheme-less path validation for any ?next bounce-back"
  - "URLSearchParams param-carry on explicit client pushes inside a param-bearing wizard"

requirements-completed: [VERF-02, VERF-03, VERF-04]

# Metrics
duration: ~3min
completed: 2026-06-19
---

# Phase 17 Plan 03: Parameterize /verify with next + require Summary

**The /verify wizard is now level-aware (?require=phone|seller) and return-aware (?next=), with an open-redirect-guarded redirect on completion and param-preserving OTP Change-number navigation — wizard internals unchanged.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-19T13:48:56Z
- **Completed:** 2026-06-19T13:51:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `/verify` parses `?next` and `?require` alongside the existing `?change`; `require=phone` completes at phone-verified (contact gate) while `require=seller`/absent additionally requires marketplace terms (publish gate).
- On completion the wizard redirects to a safe internal `?next` (e.g. back to the listing or `/sell`); an unsafe/external/absent next falls back to the existing confirmation panel.
- The `safeNext` guard (starts with `/`, not `//`, no scheme) blocks open-redirect phishing on the attacker-controllable `next`.
- The OTP step's "Change number" navigation now carries `next`/`require` forward via `URLSearchParams`, so finishing OTP after a number change still bounces the user back to origin instead of `/`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Level-aware completion + safe-next redirect in verify/page.tsx** - `571c18a` (feat)
2. **Task 2: Preserve next/require across the OTP Change-number navigation** - `906bba4` (feat)

## Files Created/Modified
- `app/(app)/verify/page.tsx` - searchParams extended to `{ change?, next?, require? }`; module-scope `safeNext` guard; `requireTerms`/`done` computed; completion redirect before step branching; TermsStep branch guarded so `require=phone` skips terms.
- `app/(app)/verify/otp-step.tsx` - `useSearchParams()` reads `next`/`require`; Change-number `router.push` rebuilt with `URLSearchParams` carrying both params forward. OTP verify/resend and anti-abuse calls untouched.

## Decisions Made
- `requireTerms = require !== "phone"` — anything that isn't the explicit phone-only contact gate (including default/absent and `seller`) requires marketplace terms. Keeps the seller gate as the safe default.
- The completion redirect is placed BEFORE the step-branching block; the existing confirmation panel is preserved verbatim for the no-safe-next fallback (no regression for users who reach `/verify` directly without a gate).
- phone-step was intentionally left untouched — it has no explicit `router.push`/`<Link>` to `/verify` (it relies on `router.refresh()`, which preserves the URL), so the param-carry was only needed in otp-step.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- During the parallel wave, the linear `git log -2` showed 17-02's commit (`b969615`) interleaved between my two commits, so Task 1 (`571c18a`) wasn't visible in the top of the log. Verified via `git merge-base --is-ancestor` that `571c18a` is reachable from HEAD and that `git show --stat` for both `571c18a` and `906bba4` contain ONLY this plan's files (`page.tsx` / `otp-step.tsx` respectively) — no cross-attribution (memory: precommit-hook-parallel-attribution). No recovery needed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wave-2 gate redirects (contact gate → `?require=phone&next=…`, publish gate → `?require=seller&next=…`) can now drop a user into `/verify` and rely on the bounce-back. The phone-only contact return-confirmation toast wiring (CONTEXT) consumes this `?next` return path.
- e2e round-trip coverage for both gate levels lands in Plan 07; existing `e2e/verify-wizard.spec.ts` step internals are unaffected (no heading/step/force-dynamic changes).

## Self-Check: PASSED

- FOUND: app/(app)/verify/page.tsx
- FOUND: app/(app)/verify/otp-step.tsx
- FOUND commit: 571c18a (Task 1)
- FOUND commit: 906bba4 (Task 2)

---
*Phase: 17-seller-activation-transaction-trust-gates*
*Completed: 2026-06-19*
