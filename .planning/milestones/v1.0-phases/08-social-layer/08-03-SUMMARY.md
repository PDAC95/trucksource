---
phase: 08-social-layer
plan: 03
subsystem: social
tags: [supabase, rls, server-actions, saves, listings-lifecycle, react, optimistic-ui]

# Dependency graph
requires:
  - phase: 08-social-layer (08-01)
    provides: saved_listings owner-only RLS table, my_listing_save_counts() RPC, listings.comments_seen_at watermark, listing_comments table
  - phase: 07-search-feed-public-profile
    provides: SearchCard shape + batch-hydration pattern (lib/search/queries.ts), FitsMyTruckControl anon-invite pattern
  - phase: 05-listings-photos-exif
    provides: renewListing/reactivateListing owner-scoped action template, getMyListings, listingPhotoPublicUrl
provides:
  - toggleSave Server Action (idempotent delete-first flip, owner RLS)
  - getMySavedListings hydrating sold/expired saves WITH effective-status badge (never drops them)
  - getSavedIds batched initial heart-state reader
  - markSold / markAvailable owner-scoped status flips that NEVER touch expires_at
  - MyListing extended with saveCount (count-only) + newCommentCount (watermark-based)
  - SaveButton three-state client component (anon invite / saved / unsaved, optimistic)
affects: [08-04 listing detail page, 08-05 feed/saved/management UI, 10-admin-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Saved hydration bypasses the search RPC: direct enumerated listings read keeps sold/expired rows visible with a derived effective status"
    - "Toggle action = delete-first then insert (idempotent under the composite PK + owner with-check)"
    - "Seller-side social counts: one RPC (counts only, never WHO) + one batched comment read bucketed in JS against comments_seen_at"

key-files:
  created:
    - lib/saves/queries.ts
    - lib/actions/saves.ts
    - components/search/save-button.tsx
  modified:
    - lib/actions/listings.ts
    - lib/listings/queries.ts
    - tests/unit/listing-lifecycle-actions.test.ts

key-decisions:
  - "getMySavedListings reads seller_id in the same enumerated listings select (one fewer round trip than searchListings' separate id->seller_id read; still no PII)"
  - "Effective status derived in JS: active-with-lapsed-expires_at badges as expired even before the pg_cron flip runs"
  - "markAvailable is sold->active ONLY and never touches expires_at — a listing whose clock lapsed while sold expires on schedule via cron, preserving the renew/reactivate-only clock invariant"
  - "Watermark comparison uses Date.getTime(), not string compare, for timestamptz robustness"

patterns-established:
  - "Status-flip actions clone renewListing byte-for-byte: getClaims -> isValidId -> owner+precondition-scoped update -> zero rows = not_found"
  - "SaveButton: every click preventDefault+stopPropagation so a wrapping card Link never fires; anon state toggles an inline login-invite popover"

requirements-completed: [SOCL-02, LIST-06]

# Metrics
duration: ~9min
completed: 2026-06-10
---

# Phase 8 Plan 03: Saves + Sold-Flip Backend Summary

**Owner-RLS save toggle + saved-page hydration that keeps sold/expired rows badged, reversible markSold/markAvailable that never touch the 90-day clock, seller save/new-comment counts on MyListing, and a reusable three-state SaveButton heart.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-10T17:36:54Z
- **Completed:** 2026-06-10T17:46:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- **SOCL-02 backend:** `toggleSave` (delete-first idempotent flip, getClaims + owner RLS, FK-violation→invalid), `getMySavedListings` (saved order preserved, batch-hydrated into the feed-card shape with NO N+1, sold/expired rows kept with a derived effective status — explicitly NOT routed through the active-only search RPC), `getSavedIds` (batched heart-state reader).
- **LIST-06:** `markSold` (active→sold) and `markAvailable` (sold→active) clone the renewListing template exactly; update payloads are precisely `{status:"sold"}` / `{status:"active"}` — `expires_at` is structurally untouched (renew/reactivate remain the only clock writers, asserted by unit tests).
- **Seller dashboard data:** `MyListing` now carries `saveCount` (via the seller-scoped `my_listing_save_counts()` RPC — counts only, never WHO) and `newCommentCount` (one batched `listing_comments` read, seller's own comments excluded, bucketed against the `comments_seen_at` watermark; null watermark = all new). Exactly two extra queries.
- **SaveButton:** three states (anon login-invite popover / saved filled heart / unsaved outline), optimistic flip in a transition reconciled against the server's returned state, revert + sonner toast on failure, `preventDefault`/`stopPropagation` so a wrapping card Link never navigates.

## Task Commits

1. **Task 1: lib/saves — queries + toggleSave action** - `3514e15` (feat)
2. **Task 2: markSold/markAvailable + getMyListings counts** - `0885a86` (feat)
3. **Task 3: SaveButton client component** - `667dcae` (feat)

## Files Created/Modified

- `lib/saves/queries.ts` - getMySavedListings (sold/expired-preserving hydration) + getSavedIds
- `lib/actions/saves.ts` - toggleSave Server Action (owner RLS, idempotent flip)
- `lib/actions/listings.ts` - markSold/markAvailable appended (renewListing clones; expires_at never written)
- `lib/listings/queries.ts` - MyListing + getMyListings extended with saveCount/newCommentCount
- `tests/unit/listing-lifecycle-actions.test.ts` - 8 new cases (guard order, exact payloads, status preconditions)
- `components/search/save-button.tsx` - auth-aware optimistic heart toggle

## Decisions Made

- seller_id rides in the single enumerated saved-listings read (vs. searchListings' separate read) — one fewer round trip, still PII-free.
- Effective status derived in JS so an active row with a lapsed clock badges "expired" even before the pg_cron flip.
- Watermark comparison via `Date.getTime()` instead of ISO string compare.

## Deviations from Plan

None - plan executed exactly as written. (The plan's grep gates initially flagged the literal strings `search_listings`/`getSession` inside my own explanatory comments; reworded the comments before committing — no code change.)

## Issues Encountered

- **Known husky stash/restore cross-attribution hazard fired on the Task-2 commit:** `0885a86` also carried two parallel 08-02 files (`tests/unit/comment-schema.test.ts`, `tests/unit/social-actions.test.ts`) that the parallel wave had on disk. Verified by file-on-disk: my 3 staged files are committed correctly; the riders are 08-02's own intended content (its tests pass in the full suite). No action needed per the established convention.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 08-04 (detail page) and 08-05 (feed/saved/management UI) can import `SaveButton`, `toggleSave`, `getSavedIds`, `getMySavedListings`, `markSold`/`markAvailable`, and the extended `MyListing` without touching these files again.
- Full suite 35 files / 224 passed / 1 skipped (includes 08-02's parallel output); `tsc --noEmit` clean; privacy greps clean.

---
*Phase: 08-social-layer*
*Completed: 2026-06-10*

## Self-Check: PASSED

- lib/saves/queries.ts — FOUND
- lib/actions/saves.ts — FOUND
- components/search/save-button.tsx — FOUND
- Commits 3514e15 / 0885a86 / 667dcae — FOUND in git log
