---
phase: 17-seller-activation-transaction-trust-gates
plan: 04
subsystem: ui
tags: [sell, listings, verification-gate, sessionStorage, react-hook-form, draft-preservation]

# Dependency graph
requires:
  - phase: 17-seller-activation-transaction-trust-gates
    provides: "17-01 server-action not_verified trust boundary on createListing; lib/verify/gate.ts"
  - phase: 17-seller-activation-transaction-trust-gates
    provides: "17-03 parameterized /verify accepting ?require=seller and a safe ?next bounce-back"
provides:
  - "isVerifiedSeller prop on /sell, computed from the caller's own non-PII profiles_private flags"
  - "Persistent unverified publish-gate banner in the create-listing form"
  - "Draft-preserving Publish interception: serializable form state saved to sessionStorage then redirect to /verify?require=seller&next=/sell?verified=1"
  - "Mount-once draft rehydrate (RHF + fitment/categories/searchTerms/year), photos sacrificed with a re-attach notice"
  - "Return-confirmation toast on ?verified=1 with URL-marker strip"
affects: [seller-activation, listings, verify-flow, charm-02, charm-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side draft preservation across a verify round-trip via versioned sessionStorage key (create-mode scoped, cleared only on successful publish)"
    - "UX-layer gate that mirrors but never replaces the server-action trust boundary"

key-files:
  created: []
  modified:
    - app/(app)/sell/page.tsx
    - components/listings/listing-form.tsx

key-decisions:
  - "Draft field set is the ACTUAL listingSchema (title/partNumber/askingPrice/conditionId/shippingOption/damageNotes/isBarnyard/yearMode/yearStart/yearEnd + component fitment/categoryIds/searchTerms) — CONTEXT's stale description/location dropped (they don't exist on the schema)"
  - "Photos (File/UploadedPhoto) intentionally NOT serialized; loss is communicated via a re-attach toast, not silent (CONTEXT)"
  - "Draft cleared ONLY on a successful publish — survives multiple verify round-trips and plain /sell revisits"
  - "isVerifiedSeller prop defaults to true so edit mode and any other caller are unaffected; gate engages only in create mode"
  - "Banner uses a bordered token-class div + lucide ShieldAlert (no Alert primitive exists in components/ui; no hardcoded hex)"

patterns-established:
  - "Versioned create-mode-only sessionStorage draft key (sell-draft:v1), save synchronously before navigating (Pitfall 3)"
  - "Mount-once rehydrate effect (empty-dep) that restores RHF via form.reset + the component setState setters, then leaves the draft in place"

requirements-completed: [LIST-01, VERF-04]

# Metrics
duration: ~4min
completed: 2026-06-19
---

# Phase 17 Plan 04: Sell Publish-Gate UX Summary

**Unverified sellers get a persistent banner on /sell, a draft-preserving Publish that saves serializable form state to sessionStorage and bounces to /verify?require=seller, and a silent rehydrate (minus photos) on return — cleared only by a successful publish.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-19T14:00:00Z
- **Completed:** 2026-06-19T14:03:32Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- `/sell` reads the caller's own `profiles_private` flags (`phone_verified_at`, `marketplace_terms_accepted_at`) owner-scoped and defensively, derives `isVerifiedSeller`, and threads it to `<ListingForm>` — non-PII flags only, invariant 1 posture preserved.
- Create-mode-only persistent banner ("Verify your phone to publish. Fill it out — your work is saved.") shown to unverified sellers with token classes (no hex).
- `onSubmit` intercepts the unverified Publish: serializes the real schema field set + component-managed fitment/categories/searchTerms to `sell-draft:v1` SYNCHRONOUSLY, then redirects to `/verify?require=seller&next=/sell?verified=1`.
- Mount-once rehydrate restores RHF (`form.reset`) + `setFitment`/`setCategoryIds`/`setCategoryId`/`setSearchTerms`/`setIsBarnyard`; photos left empty with a "Restored your draft — re-attach photos to publish" toast.
- `?verified=1` return marker fires "Phone verified — you're all set" and `router.replace("/sell")` strips it so a refresh won't re-toast.
- Draft cleared only in `runCreate`'s success branch — survives verify round-trips.

## Task Commits

Each task was committed atomically (race-proof explicit-pathspec form; both verified clean with `git show --stat`):

1. **Task 1: Compute isVerifiedSeller on /sell and thread it to the form** - `8bcc869` (feat) — app/(app)/sell/page.tsx only
2. **Task 2 + Task 3: Banner + Publish interception + draft save/rehydrate/clear** - `905e9c0` (feat) — components/listings/listing-form.tsx only

_Tasks 2 and 3 both modify the single file `components/listings/listing-form.tsx`; combined into one atomic commit for that file (banner + interception belong with the rehydrate they pair with)._

**Plan metadata:** (docs commit — see final)

## Files Created/Modified
- `app/(app)/sell/page.tsx` — owner-scoped `profiles_private` flag read → `isVerifiedSeller` prop passed to `<ListingForm>`.
- `components/listings/listing-form.tsx` — `isVerifiedSeller` prop (default true); `SELL_DRAFT_KEY` constant; `ShieldAlert` import; unverified banner; `saveDraft()`; Publish interception in `onSubmit`; draft clear in `runCreate`; mount-once rehydrate + verify-return-confirmation effect.

## Decisions Made
- Used the **actual** `listingSchema` field set for the draft, NOT CONTEXT's stale `description`/`location` (those columns don't exist — it's `damageNotes`, and there is no `location`).
- `fitment` saved as the full `FitmentSelection[]` (names + ids) so chips re-render on rehydrate; mapped to `{modelId, configId}` for `form.reset`.
- Verify-return toast and draft-restored toast both fire on a `verified=1` return (distinct messages) — they convey different things, no de-dup.
- Banner built as a bordered token-class div with `ShieldAlert` since no `Alert` primitive exists under `components/ui`.

## Deviations from Plan
None - plan executed exactly as written. (Task 2 and Task 3 share one file and were committed together as a single atomic file commit; no behavior change vs. the plan.)

## Issues Encountered
- Parallel-wave executor (17-05) held `.git/index.lock` on the first form commit attempt (`Unable to create index.lock`). Resolved by waiting for the lock to clear then retrying with the race-proof `git commit -- <pathspec>` form; `git show --stat` confirms each commit holds exactly its plan's file with no cross-attribution.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Sell UX gate is wired end-to-end against the 17-01 server boundary and 17-03 `/verify` parameters. Edit mode and the EXIF/photo upload path are untouched (behavior freeze honored).
- The draft is sessionStorage-scoped only (cross-session localStorage persistence intentionally deferred per CONTEXT).

## Self-Check: PASSED

- FOUND: app/(app)/sell/page.tsx
- FOUND: components/listings/listing-form.tsx
- FOUND: .planning/phases/17-seller-activation-transaction-trust-gates/17-04-SUMMARY.md
- FOUND commit: 8bcc869 (Task 1)
- FOUND commit: 905e9c0 (Tasks 2+3)

---
*Phase: 17-seller-activation-transaction-trust-gates*
*Completed: 2026-06-19*
