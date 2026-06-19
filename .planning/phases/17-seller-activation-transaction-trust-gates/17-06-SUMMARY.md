---
phase: 17-seller-activation-transaction-trust-gates
plan: 06
subsystem: ui
tags: [next, react, supabase, navigation, lucide, tailwind]

# Dependency graph
requires:
  - phase: 02-verified-seller-otp
    provides: profiles_private.phone_verified_at + marketplace_terms_accepted_at verification timestamps
  - phase: 11-og-rebrand
    provides: NavIconLink, neon-cyan tokens, header icon row, MobileMenu/UserMenu shells
provides:
  - Always-visible Sell action in the desktop header (NavIconLink, primary conversion)
  - My Listings (/sell/listings) + Account (/account) items in the user-menu dropdown
  - Sell / My Listings / Account rows in the mobile menu for logged-in users
  - Become-a-verified-seller CTA on /account linking /verify?require=seller for unverified users
affects: [17-07, CHRM-02, CHRM-03, phase-11-rebrand-header]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Functional nav entries styled with CURRENT tokens; v1.1 rebrand (Phases 11-15) restyles later — no final-design ownership here"
    - "isVerifiedSeller derived from BOTH phone_verified_at AND marketplace_terms_accepted_at (the publish gate's two prerequisites), read owner-scoped from profiles_private"

key-files:
  created: []
  modified:
    - components/layout/site-header.tsx
    - components/layout/mobile-menu.tsx
    - components/layout/user-menu.tsx
    - app/(app)/account/page.tsx

key-decisions:
  - "Sell NavIconLink uses exact active-matching so /sell/listings doesn't keep the Sell icon lit"
  - "Verified-seller CTA reads phone_verified_at + marketplace_terms_accepted_at (non-PII flags) from the owner's own profiles_private row — no PII, no public-profile surface (CONTEXT deferred)"
  - "Account CTA styled with tokens (border-neon-cyan/30, bg-card, ShieldCheck) — no hardcoded hex; no Card primitive exists, used a bordered div"

patterns-established:
  - "Nav-surface entries added in three places (header NavIconLink + dropdown DropdownMenuItem + mobile MenuLink) with consistent lucide icons (Tag/List/Settings) and exact English labels"

requirements-completed: [VERF-02, VERF-03, VERF-04]

# Metrics
duration: ~6min
completed: 2026-06-19
---

# Phase 17 Plan 06: Seller/Verify Nav Discoverability Summary

**Selling and verifying made discoverable — a Sell action in the desktop header + mobile menu, My Listings/Account in the dropdown + mobile, and a token-styled Become-a-verified-seller CTA on /account linking /verify?require=seller for unverified users.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-19T13:49:01Z
- **Completed:** 2026-06-19T13:55:14Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Always-visible Sell entry in the desktop icon row (NavIconLink + Tag icon, primary conversion, leftmost of the action cluster; `exact` so it doesn't stay lit on /sell/listings)
- My Listings (/sell/listings, List icon) and Account (/account, Settings icon) added to the user-menu dropdown above the Log-out separator, mirroring the existing My-profile item
- Mobile menu now lists Sell / Messages / Saved / My profile / My Listings / Account / Log out for logged-in users
- /account renders a Become-a-verified-seller card to unverified users only, derived from phone_verified_at + marketplace_terms_accepted_at, linking /verify?require=seller

## Task Commits

1. **Task 1: Sell header action + mobile menu rows** — `016a64d` (feat) — site-header.tsx + mobile-menu.tsx, clean attribution verified via `git show --stat`
2. **Task 2: My Listings + Account dropdown items** — `e31c1c3` (feat) — user-menu.tsx, clean attribution verified
3. **Task 3: Become-a-verified-seller CTA on /account** — code shipped in HEAD tree via `7a56f27` (cross-attributed by the parallel-wave lint-staged race — see Deviations)

## Files Created/Modified
- `components/layout/site-header.tsx` — imports NavIconLink + Tag; Sell action as the first item in the logged-in icon row
- `components/layout/mobile-menu.tsx` — imports Tag/List/Settings; Sell, My Listings, Account MenuLink rows
- `components/layout/user-menu.tsx` — imports List/Settings; My Listings + Account DropdownMenuItem rows above the logout separator
- `app/(app)/account/page.tsx` — extends the profiles_private select with phone_verified_at + marketplace_terms_accepted_at, derives isVerifiedSeller, renders the conditional CTA card

## Decisions Made
- Used `exact` on the Sell NavIconLink: without it the Sell icon would light up on /sell/listings too. Tag (lucide) chosen as the selling icon over PlusCircle.
- The verified-seller derivation requires BOTH the phone timestamp and the terms-acceptance timestamp — matching the publish gate's two prerequisites (Phase 2 / VERF-02/03). Both columns are non-PII timestamps on the caller's own profiles_private row (owner RLS), so no PII exposure.
- No `Card` UI primitive exists in the project — the CTA uses a token-styled bordered div (border-neon-cyan/30, bg-card, ShieldCheck icon in a ringed badge) to match the dropdown card aesthetic without hardcoded hex.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Sell NavIconLink given `exact` active-matching**
- **Found during:** Task 1
- **Issue:** NavIconLink defaults to prefix matching (`pathname.startsWith(href/)`), which would keep the Sell icon visually active on the sibling /sell/listings route.
- **Fix:** Passed the existing `exact` prop on the Sell entry so only /sell lights it.
- **Files modified:** components/layout/site-header.tsx
- **Verification:** tsc clean; behaviour reasoned from nav-icon-link.tsx active logic.
- **Committed in:** `016a64d`

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** Minor correctness adjustment, no scope creep.

## Issues Encountered

**Parallel-wave commit cross-attribution (precommit-hook-parallel-attribution pattern).**
Task 3's commit failed with `fatal: cannot lock ref 'HEAD'` because a concurrent executor (17-01) advanced HEAD between my `git commit` and the husky/lint-staged stash-restore cycle. The lint-staged automatic backup/restore swept my `app/(app)/account/page.tsx` change into commit `7a56f27` (labelled `feat(17-01): gate createListing behind verified-seller check`), which also picked up STATE.md, ROADMAP.md and 17-03-SUMMARY.md from other waves.

**Resolution:** Verified the account-page code is byte-correct in the HEAD tree (`git show HEAD:"app/(app)/account/page.tsx"` contains the CTA + `/verify?require=seller`; tsc clean). I deliberately did **NOT** rewrite `7a56f27` — it is shared history that concurrent executors may already be building on, and it carries three other plans' files; rewriting it would corrupt sibling work. The deliverable is shipped and correct in HEAD; only its commit label is wrong. Tasks 1 and 2 (`016a64d`, `e31c1c3`) were verified individually with `git show --stat` and captured ONLY this plan's files.

Note: `lib/actions/listings.ts` (17-01's actual change) is sitting unstaged in the working tree as a side effect of the same race — that belongs to 17-01 and was left untouched for its executor.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All four nav/account surfaces shipped; selling and verifying are discoverable on desktop and mobile.
- 17-07 (contact early-gate / return-confirmation) and the v1.1 rebrand header work can build on these entries.
- No blockers introduced.

## Self-Check: PASSED

- site-header.tsx `/sell` — present in HEAD (`016a64d`)
- mobile-menu.tsx Sell/My Listings/Account — present in HEAD (`016a64d`)
- user-menu.tsx /sell/listings + /account — present in HEAD (`e31c1c3`)
- account/page.tsx /verify?require=seller — present in HEAD (shipped via `7a56f27`, see Issues)
- tsc --noEmit clean; no Spanish strings; no hardcoded hex in the account CTA

---
*Phase: 17-seller-activation-transaction-trust-gates*
*Completed: 2026-06-19*
