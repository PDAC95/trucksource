---
phase: 07-search-feed-public-profile
plan: 04
subsystem: ui
tags: [nextjs, supabase, profile, listings, privacy, search-params]

# Dependency graph
requires:
  - phase: 07-02
    provides: SearchCard type + zero-PII card hydration pattern (lib/search/queries.ts)
  - phase: 05-listings-photos-exif-safe-storage
    provides: listings + listing_photos + listing_fitment tables, listingPhotoPublicUrl, getConditions
  - phase: 01-foundation-privacy-model
    provides: /u/[username] page + PublicProfileHeader + profiles_public enumerated read
provides:
  - "Seller active-listings grid wired into the existing /u/[username] public profile"
  - "ProfileListingsGrid (feed-shape card: photo + fitment chip + price)"
  - "ProfileSort (recent | price control via ?sort searchParam, shareable + cacheable)"
  - "Friendly empty state for sellers with zero active listings"
  - "No-PII contract assertion on the profile-grid listings read"
affects: [08-social-layer, 09-contact-chat, 10-admin-ops-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Profile grid reuses the feed SearchCard SHAPE without a build-time dep on the parallel 07-03 <ListingCard> (avoids cross-wave tsc race)"
    - "All-state-in-URL sort (?sort) keeps the profile a cacheable Server Component (no force-dynamic)"
    - "Batch hydration (photos + fitment chip + conditions) keyed by result ids — no N+1; seller name/state injected from the already-resolved profile (no extra profiles_public read)"

key-files:
  created:
    - components/profile/profile-listings-grid.tsx
    - components/profile/profile-sort.tsx
  modified:
    - app/(public)/u/[username]/page.tsx
    - tests/integration/search.contract.test.ts

key-decisions:
  - "Rendered a local card mirroring the feed SearchCard shape instead of importing 07-03's <ListingCard> — 07-03 is parallel/uncommitted, so importing it would create a cross-wave build dependency. Same visual, zero coupling."
  - "Profile is list + sort ONLY — no facet panel (LOCKED in plan; sellers rarely carry enough v1 inventory)."
  - "Sort default 'recent' is omitted from the URL for clean/canonical links; only ?sort=price is serialized."
  - "Empty seller renders header + reused EmptyListings copy → profile stays valid + shareable either way (LOCKED)."

patterns-established:
  - "Profile listings read: enumerated select on public-read `listings` filtered by seller_id + status='active' + (expires_at is null or > now()) — explicit filter is the scope (RLS doesn't auto-scope a public-read table)"
  - "Card hydration helper colocated in the page (hydrateProfileCards) producing the shared SearchCard type"

requirements-completed: [SRCH-01]

# Metrics
duration: ~10min
completed: 2026-06-10
---

# Phase 7 Plan 04: Public Profile Active-Listings Grid Summary

**The seller's `/u/[username]` profile now renders their active inventory as a feed-format grid (cover photo + Make/Model chip + price) with a recent|price URL-driven sort and a friendly empty state — zero PII on the wire.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-06-10
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- Replaced the Phase-1 `<EmptyListings/>` placeholder with the real active-listings grid; the Phase-1 header read is untouched.
- `ProfileListingsGrid` mirrors the feed `SearchCard` shape (photo + fitment chip + price + condition) without coupling to the parallel 07-03 `<ListingCard>`.
- `ProfileSort` writes `?sort=recent|price` via `router.replace` — sorted view is shareable and the page stays a cacheable Server Component.
- Batch hydration (cover photo, Make/Model chip, condition name) keyed by listing ids — no N+1; seller name/state injected from the already-resolved profile.
- Extended the no-PII contract test with a profile-grid case (enumerated shape honored + zero PII keys), satisfying the cross-cutting "public profile surface renders no PII" gate.

## Task Commits

1. **Task 1: Profile listings grid + sort + empty state** - `b12ba73` (feat)
2. **Task 2: Extend no-PII contract test to the profile-grid payload** - `4382013` (test)

## Files Created/Modified
- `components/profile/profile-listings-grid.tsx` - Seller active-listings grid, feed card shape (photo/chip/price), no facet panel
- `components/profile/profile-sort.tsx` - Client recent|price control driving the `?sort` searchParam (useTransition + router.replace)
- `app/(public)/u/[username]/page.tsx` - Added `searchParams`/sort coercion + active-listings read (enumerated, status=active, not-expired) + `hydrateProfileCards` + conditional grid/empty-state render
- `tests/integration/search.contract.test.ts` - New profile-grid PII assertion (discovers a real seller_id, reads as the page does, asserts allowed-shape + zero PII)

## Decisions Made
- Local card mirroring `SearchCard` instead of importing the parallel 07-03 `<ListingCard>` (avoids a cross-wave build dependency; same visual).
- No facet panel on the profile (LOCKED) — list + sort only.
- `'recent'` default omitted from the URL; `?sort=price` is the only serialized sort.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- During Task 1, `npx tsc --noEmit` initially reported two errors in `.next/types/validator.ts` referencing `app/(app)/page.js` — a route the PARALLEL plan 07-03 owns and has not yet created. These were stale generated Next.js validator types, NOT my code. Confirmed by clearing `.next/types` and re-running: tsc clean. Out of scope (07-03 territory); not touched.
- The husky stash/restore parallel-wave attribution hazard fired on the pre-commit staging: 07-03's deletions (`app/(app)/page.tsx`, `app/(app)/garage-banner.tsx`) appeared staged. Unstaged + restored from index so 07-03's files survive on disk; only my 3 files were committed in `b12ba73`. Verified my work by file-on-disk, not commit message.

## Verification
- `npx tsc --noEmit` clean (after clearing stale 07-03 `.next` validator types).
- `npm run build` succeeds; `/u/[username]` server-rendered on demand.
- `npx vitest run tests/integration/search.contract.test.ts` — 2 passed (RPC payload + profile-grid payload both PII-free), live vs Staging.
- Grep-clean: no `select('*')`, no `profiles_private` read, no facet panel on the profile (only explanatory comments reference what is NOT done).

## Next Phase Readiness
- SRCH-01 complete; the public profile is now centered on the active-listings grid (the buyer's primary view).
- Phase 7 Wave 3 remaining: 07-03 (search/feed UI) is the sibling parallel plan. Once it commits, the profile grid can optionally adopt its `<ListingCard>` (non-breaking — same shape).

## Self-Check: PASSED

All created files verified on disk (2 components, page, test, summary); both task commits (`b12ba73`, `4382013`) verified in git log.

---
*Phase: 07-search-feed-public-profile*
*Completed: 2026-06-10*
