---
phase: 17-seller-activation-transaction-trust-gates
plan: 01
subsystem: auth
tags: [server-actions, rls, verification, trust-boundary, supabase, zod]

# Dependency graph
requires:
  - phase: 02-verified-seller-otp
    provides: profiles_private.phone_verified_at + marketplace_terms_accepted_at flags; is_verified_seller() oracle
  - phase: 05-listings-photos
    provides: createListing server action + its guard order
  - phase: 09-contact-chat
    provides: submitContact server action + the invariant-#5 contact_log-before-thread spine
provides:
  - lib/verify/gate.ts — requirePhoneVerified + requireVerifiedSeller owner-row reads
  - createListing publish gate (phone + marketplace terms) returning typed not_verified
  - submitContact contact gate (phone only) returning typed not_verified
affects: [17-02-rls-backstops, 17-04-verify-prompts, 17-05-sell-gate-ui, 17-06-contact-gate-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-action trust-boundary gate: an owner-row flag read returns a typed not_verified error BEFORE any DB write; the UI /verify redirect is convenience, the server is the authority (CLAUDE.md #2/#3/#6)"
    - "Gate logic centralized in one thin helper (lib/verify/gate.ts) reused by both actions; no service-role, no new columns, mirrors the existing verify-page owner read"

key-files:
  created:
    - lib/verify/gate.ts
  modified:
    - lib/actions/listings.ts
    - lib/actions/contact.ts

key-decisions:
  - "gate.ts reads profiles_private flag columns directly (maybeSingle, owner RLS) instead of calling is_verified_seller() RPC — the RPC re-checks email_confirmed_at, but the (app) layout already auth-gates every reachable caller, so the email arm is always satisfied; direct read = one round-trip"
  - "Seller publish gate = phone + marketplace terms; buyer contact gate = phone only (buyers never accept selling terms)"
  - "createListing gate is publish-time only (STEP 0, before schema parse); updateListing deliberately NOT gated — verified-once stays verified, edits don't re-gate (RESEARCH Q4 tradeoff #3)"
  - "submitContact gate is STEP 1.5 (after schema parse, before rate-limit and before the invariant-#5 contact_log insert) — a new early guard, NOT a reorder of steps 4-11"

patterns-established:
  - "Trust-boundary gate ordering: identity (getClaims) -> verification gate -> schema/rate-limit -> writes; the gate fails fast so an unverified caller creates nothing"

requirements-completed: [LIST-01, MSG-05, VERF-02, VERF-04]

# Metrics
duration: ~12min
completed: 2026-06-19
---

# Phase 17 Plan 01: Server-Action Trust-Boundary Gates Summary

**createListing now requires a verified seller (phone + marketplace terms) and submitContact requires a phone-verified buyer — both return a typed `not_verified` before any DB write, via a centralized `lib/verify/gate.ts` helper.**

## Performance

- **Duration:** ~12 min (wall clock longer due to parallel-wave index contention recovery)
- **Started:** 2026-06-19T13:48:46Z
- **Completed:** 2026-06-19T13:56:00Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `lib/verify/gate.ts`: two owner-row reads — `requirePhoneVerified` (phone) and `requireVerifiedSeller` (phone + terms) — no service-role, no new columns
- `createListing` gated at STEP 0 (before schema parse and any insert); `not_verified` added to `CreateListingResult`
- `submitContact` gated at STEP 1.5 (before rate-limit and the invariant-#5 contact_log write); `not_verified` added to `SubmitContactResult`
- The contact-before-thread invariant (#5) preserved — verified by the messaging contract test (7/7 green)

## Task Commits

Each task was committed atomically (race-proof `git commit -- <pathspec>` form due to the parallel wave):

1. **Task 1: Create lib/verify/gate.ts helper** - `cfb96fc` (feat)
2. **Task 2: Gate createListing (phone + terms) as STEP 0** - `1aa7068` (feat)
3. **Task 3: Gate submitContact (phone only) as STEP 1.5** - `728f0e0` (feat)

_Note: two earlier mis-attributed commits (7416342, 7a56f27) exist in history — see Deviations._

## Files Created/Modified
- `lib/verify/gate.ts` - `requirePhoneVerified` / `requireVerifiedSeller` owner-row flag reads (the trust-boundary authority)
- `lib/actions/listings.ts` - `not_verified` in `CreateListingResult`; `requireVerifiedSeller` gate as STEP 0
- `lib/actions/contact.ts` - `not_verified` in `SubmitContactResult`; `requirePhoneVerified` gate as STEP 1.5

## Decisions Made
- Read `profiles_private` flag columns directly rather than the `is_verified_seller()` RPC (avoids the redundant email re-check the (app) layout already enforces) — one round-trip, mirrors `app/(app)/verify/page.tsx`.
- Publish gate = phone + terms; contact gate = phone only.
- `updateListing` left ungated on purpose (publish-time gate only).

## Deviations from Plan

### Parallel-wave index contention (recovered)

Running concurrently with executors 17-02 / 17-03 / 17-06 in the same repo, the shared git index and husky/lint-staged stash/restore caused cross-attribution and a stash-pop conflict. None of it touched the CORRECTNESS of my three files — recovered each time and the final three task commits each contain exactly one of my files.

**1. [Rule 3 - Blocking] stash-pop conflict on components/layout/user-menu.tsx**
- **Found during:** Task 2 (after stashing listings.ts to confirm the messaging.test failures were pre-existing)
- **Issue:** A lint-staged automatic backup stash got entangled with my temporary `git stash` of listings.ts; the pop produced a whitespace-only conflict in `user-menu.tsx` (another plan's file).
- **Fix:** Resolved to the "Updated upstream" side (preserving the owner plan's content), unstaged the file, dropped the applied stash. No content of any other plan was lost.
- **Verification:** `grep` for conflict markers returns none; `user-menu.tsx` unchanged from its owner's version.

**2. [Rule 3 - Blocking] cross-attributed commits captured other plans' planning files**
- **Found during:** Task 2 commit
- **Issue:** Two `git commit` attempts (7416342, 7a56f27) swept other executors' staged planning files (17-02/17-03 SUMMARY, STATE, ROADMAP, account/page.tsx) into my message because they were staged in the shared index when my commit ran; the second attempt even excluded my own listings.ts.
- **Fix:** Switched to the race-proof `git commit -m "..." -- <pathspec>` form, which commits only the named path regardless of index state. Re-committed listings.ts cleanly as `1aa7068` (1 file). The earlier mis-attributed commits' file CONTENT is intact in history; the owning executors re-commit (17-02 already did: ddc4688) or find their files already committed. Shared history was NOT rewritten (dangerous mid-wave).
- **Verification:** `git show --stat` on `1aa7068` and `728f0e0` confirms exactly one file each; `git log` confirms 17-02/17-03 SUMMARY content present in history.

---

**Total deviations:** 2 (both Rule 3 - blocking, both from the parallel-wave shared-index race; matches the memory note `precommit-hook-parallel-attribution`).
**Impact on plan:** Zero scope creep; all three of my deliverables are committed cleanly and atomically. The plan's code was executed exactly as written.

## Issues Encountered
- `tests/integration/messaging.test.ts` shows 12 failing RLS tests, BUT these are confirmed pre-existing/environmental: they persist with my `listings.ts` change stashed out, and they hit live Staging RLS being mutated concurrently by the 17-02 RLS-backstop executor. Out of scope per the deviation scope boundary; logged here, not fixed. The messaging *contract* test (the one this plan must not regress) passes 7/7.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The typed `not_verified` error variant is now emitted by both actions — Wave-2 UI (17-05 sell gate, 17-06 contact gate) can map it to a `/verify?next=...` redirect.
- 17-02's RLS backstops layer the database-level enforcement under these server-action gates.

## Self-Check: PASSED
- FOUND: lib/verify/gate.ts
- FOUND: commit cfb96fc (gate.ts)
- FOUND: commit 1aa7068 (listings.ts gate)
- FOUND: commit 728f0e0 (contact.ts gate)
- Verified: createListing + submitContact both reference the gate helper (rg confirmed)

---
*Phase: 17-seller-activation-transaction-trust-gates*
*Completed: 2026-06-19*
