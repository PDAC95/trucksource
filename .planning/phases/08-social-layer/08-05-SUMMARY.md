---
phase: 08-social-layer
plan: 05
subsystem: social
tags: [react, nextjs, rsc, infinite-scroll, saves, listings-lifecycle, ui]

# Dependency graph
requires:
  - phase: 08-social-layer (08-03)
    provides: SaveButton three-state heart, getSavedIds/getMySavedListings readers, markSold/markAvailable actions, MyListing.saveCount/newCommentCount
  - phase: 07-search-feed-public-profile
    provides: ListingCard/FeedGrid/feed page/api-search infinite-scroll surface
  - phase: 05-listings-photos-exif
    provides: /sell/listings owner index + RenewButton pattern
provides:
  - ListingCard extended with optional saveState (heart overlay) + statusBadge (Vendido/Expirado overlay) — additive, omitted props render the card unchanged
  - FeedGrid + /api/search saved-state plumbing across infinite-scroll pages
  - /saved owner-scoped grid (sold/expired saves badged, never dropped) + Guardados nav entry
  - /sell/listings save counts, new-comment badges, and a confirmed reversible sold toggle (LIST-06's management home)
affects: [09-contact-chat, 10-admin-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RSC -> client saved-state handoff as number[] (Sets don't serialize); the client derives the Set with useMemo"
    - "Per-page savedIds in the /api/search JSON: the route runs with request cookies so owner RLS scopes the read; anon gets an empty array for free"
    - "Card overlays as siblings of the body Link (heart z-20 top-right, status scrim matching the aspect-4/3 photo area, pointer-events-none)"

key-files:
  created:
    - app/(app)/saved/page.tsx
    - app/(app)/sell/listings/sold-toggle.tsx
  modified:
    - components/search/listing-card.tsx
    - components/search/feed-grid.tsx
    - app/(public)/page.tsx
    - app/api/search/route.ts
    - app/(app)/layout.tsx
    - app/(app)/sell/listings/page.tsx

key-decisions:
  - "SoldToggle lives colocated with the page at app/(app)/sell/listings/sold-toggle.tsx — NOT components/listings/* (08-04's surface) and NOT imported from 08-04's parallel uncommitted detail-page toggle (zero cross-wave coupling, 07-04 precedent)"
  - "Save count shown only when > 0 (quiet rows); seller sees COUNT only, never WHO"
  - "Sold rows badge as 'Vendido' in the management list; expired rows keep the existing RenewButton reactivate path and never show the sold toggle"
  - "Feed page mounts a Toaster so SaveButton toggle failures surface (was missing — Rule 2)"

patterns-established:
  - "Optional additive card props: saveState/statusBadge default-off so every pre-existing ListingCard consumer (07-04 profile grid) renders byte-identical"
  - "Infinite-scroll auth state: isAuthenticated resolved ONCE server-side on the page; each appended page merges its own savedIds into client state"

requirements-completed: [SOCL-02, LIST-06]

# Metrics
duration: ~15min
completed: 2026-06-10
---

# Phase 8 Plan 05: Feed Save Hearts, /saved Page + My-Listings Management Summary

Save hearts on every feed/search card (anon login-invite, authenticated optimistic toggle correct across infinite scroll), a /saved grid that badges sold/expired saves instead of dropping them, and the seller's /sell/listings rows upgraded with save counts, new-comment badges, and a confirmed markSold/markAvailable toggle.

## What was built

### Task 1 — Save hearts on feed/search cards (commit 7985082)
- `components/search/listing-card.tsx`: additive `saveState?` + `statusBadge?` props. The SaveButton renders as a sibling of the body `<Link>` (absolute top-right, z-20) so markup stays valid and the card never navigates on a heart tap (SaveButton also preventDefaults). `statusBadge` renders a pointer-events-none scrim + Badge sized to the photo area (aspect-4/3). Omitting both props renders the card exactly as before — the 07-04 profile grid is untouched.
- `app/(public)/page.tsx`: resolves the viewer once (existing getClaims), batches `getSavedIds` for the first page when authenticated, passes `initialSavedIds` (array — Sets don't serialize to client components) + `isAuthenticated` into FeedGrid. Also mounts `<Toaster />` (SaveButton error toasts had no outlet on the feed).
- `components/search/feed-grid.tsx`: keeps `appendedSavedIds` state merged from each fetched page, derives the Set with `useMemo` (no render-time writes — strict react-hooks gate), resets on query change via the existing render-time guard.
- `app/api/search/route.ts`: each infinite-scroll page response now carries `savedIds` — the route runs with the request cookies so `getSavedIds` is owner-RLS-scoped (empty for anon).

### Task 2 — /saved + nav (commit ee27c17)
- `app/(app)/saved/page.tsx` (force-dynamic, getClaims → redirect("/login") guard mirroring /sell/listings): `getMySavedListings` into the SAME 2/3/4-col card grid the feed uses; every card gets `saveState={{ initiallySaved: true, isAuthenticated: true }}` (heart = manual removal, toggleSave revalidates /saved) and `statusBadge` "Vendido"/"Expirado" from the reader's derived effective status (LOCKED: sold/expired saves REMAIN). Header with count, friendly empty state (Heart icon + CTA back to `/` — no dead end), Toaster.
- `app/(app)/layout.tsx`: "Guardados" header link (Heart icon, ghost/sm matching the UserMenu trigger; label hidden on mobile widths).

### Task 3 — /sell/listings management upgrades (commit 09d5c02)
- Save count: muted "{n} guardados" with Heart icon, shown only when > 0 (count only, never WHO).
- New-comment badge: primary Badge "{n} comentarios nuevos" (MessageSquare) linking to `/listings/[id]` — viewing as owner fires 08-04's markCommentsSeen and clears it. In-app indicator only (LOCKED: not a notification system). Existing expiring/expired attention counter untouched.
- `app/(app)/sell/listings/sold-toggle.tsx` (NEW, colocated client component): active → "Marcar vendido", sold → "Marcar disponible", both behind the vendored AlertDialog confirmation, calling `markSold`/`markAvailable` in a transition with sonner feedback + `router.refresh()`. Renders nothing for expired rows (RenewButton owns reactivation). Sold status badge displays "Vendido".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Feed page had no `<Toaster />`**
- **Found during:** Task 1
- **Issue:** SaveButton reports toggle failures via sonner; the feed page never mounted a Toaster, so error toasts would silently no-op for the new hearts.
- **Fix:** Mounted `<Toaster />` in `app/(public)/page.tsx` (same pattern as every other toast-bearing page).
- **Files modified:** app/(public)/page.tsx
- **Commit:** 7985082

No other deviations — plan executed as written.

## Parallel-wave notes (08-04 ran concurrently)

- One transient red `npm run build` / `npx tsc` mid-Task-1: the error was in `app/(public)/listings/[id]/page.tsx` (08-04's file, mid-edit). Out of scope per file ownership; it self-resolved when 08-04 finished its edit. Zero touches to 08-04's files — verified per-commit (`git show --name-only`): my 3 commits contain exactly this plan's 8 files.
- Build lock contention (`Another next build process is already running`) handled with a retry loop; no shared-file conflicts.
- No husky stash/restore cross-attribution this time — each commit's file list is exactly its task's files, verified on disk.

## Verification

- `npx tsc --noEmit` clean; `npm run build` green — `/saved` present as a dynamic route, no route collisions.
- `npx vitest run`: 35 files / 224 passed / 1 skipped — no regression.
- Privacy greps on all 8 touched files: no `profiles_private`, no `select('*')`, no `getSession` calls (two pre-existing "never getSession" comments only), no `supabase/admin`.
- File-ownership: `app/(public)/listings/[id]/page.tsx` and `components/listings/*` untouched (08-04's surface).

## Commits

- `7985082` feat(08-05): save hearts on feed/search cards with infinite-scroll saved-state plumbing
- `ee27c17` feat(08-05): /saved page with status badges plus Guardados nav entry
- `09d5c02` feat(08-05): save count, new-comment badge and confirmed sold toggle on /sell/listings

## Self-Check: PASSED

- app/(app)/saved/page.tsx FOUND (82 lines, min 40 met)
- app/(app)/sell/listings/sold-toggle.tsx FOUND
- Commits 7985082 / ee27c17 / 09d5c02 FOUND in git log
