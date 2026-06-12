---
phase: 05-listings-photos-exif-safe-storage
plan: 04
subsystem: seller-listing-ui
tags: [list-01, list-02, list-04, list-05, listing-form, photo-uploader, dnd-kit, exif, multi-fit, barnyard, force-dynamic, human-verify]

# Dependency graph
requires:
  - phase: 04-my-garage
    provides: "the Make→Model→Config dependent-cascade pattern (truck-cascade.tsx) + the force-dynamic owner-page + owner-index + add/edit dialog wiring REUSED here"
  - phase: 05-listings-photos-exif-safe-storage
    plan: 02
    provides: "listingSchema/ListingInput/ListingFormValues (the single client+server contract the form binds to via zodResolver) + getConditions cascade reader"
  - phase: 05-listings-photos-exif-safe-storage
    plan: 03
    provides: "createListing/updateListing/uploadListingPhoto/removeListingPhoto Server Actions + getListing/getMyListings read surface (the form's submit + the index/edit pre-fill)"
  - phase: 05-listings-photos-exif-safe-storage
    plan: 01
    provides: "the server-side EXIF strip pipeline (uploadListingPhoto runs stripAndReencode) + dnd-kit dependency + listing-photos Storage bucket"
provides:
  - "components/listings/photo-uploader.tsx — dnd-kit sortable photo grid, immediate per-photo upload (EXIF stripped server-side), first=cover, ≤8"
  - "components/listings/fitment-multi-select.tsx — reused Make→Model→Config cascade producing a multi-fit list + Barnyard toggle"
  - "components/listings/listing-form.tsx — the single sectioned create/edit form (RHF + zodResolver(listingSchema)) shared by /sell and /sell/[id]/edit"
  - "app/(app)/sell/page.tsx — create-listing route (force-dynamic, getClaims-gated)"
  - "app/(app)/sell/listings/page.tsx — seller's 'my listings' index (LIST-05 entry point; getMyListings → edit links)"
  - "app/(app)/sell/[id]/edit/page.tsx — edit route, same form pre-filled, ownership-checked via seller_id (LIST-05)"
  - "components/ui/radio-group.tsx + components/ui/textarea.tsx — shadcn primitives"
  - "next.config.ts serverActions.bodySizeLimit=12mb — lets 10MB photo uploads reach the Server Action locally"
affects: [07-search-feed-public-profile, 09-contact-chat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One sectioned page (Part data → Fitment → Photos → Shipping), NOT a wizard, NO draft state — publish-or-discard (CONTEXT lock)"
    - "Edit reuses the SAME ListingForm component pre-filled (mode='edit') — no second form"
    - "Photos upload the moment they're selected (per-photo spinner, not one global bar); EXIF stripped server-side inside uploadListingPhoto before any Storage write"
    - "dnd-kit/sortable for reorder (NEVER native HTML5 DnD); the first tile is the cover (no separate set-cover control)"
    - "Radix-controlled fields (Barnyard toggle, fitment list, Condition Select) must be MIRRORED into RHF via form.setValue(...,{shouldValidate:true}) — component-only useState never reaches the zodResolver and silently blocks submit"
    - "onInvalid handler surfaces zod refine failures as a toast so a blocked submit is never a dead silent button"
    - "Edit ownership is a SEPARATE seller_id read (getListing returns public data only); non-owner AND nonexistent both collapse to notFound() — no existence leak"

key-files:
  created:
    - components/listings/photo-uploader.tsx
    - components/listings/fitment-multi-select.tsx
    - components/listings/listing-form.tsx
    - components/ui/radio-group.tsx
    - components/ui/textarea.tsx
    - app/(app)/sell/page.tsx
    - app/(app)/sell/listings/page.tsx
    - app/(app)/sell/[id]/edit/page.tsx
  modified:
    - next.config.ts
    - lib/listings/queries.ts

key-decisions:
  - "The listing form is ONE sectioned page (part data / fitment / photos / shipping), not a wizard, with no draft state (CONTEXT lock) — submit publishes and redirects to the public listing page."
  - "Edit reuses the same ListingForm (mode='edit', defaults pre-fill); ownership is enforced by a separate seller_id read (getListing is public-only), notFound() on non-owner OR nonexistent."
  - "Barnyard toggle + multi-fit fitment list + Condition Select are mirrored into RHF state (form.setValue with shouldValidate) — the barnyard-or-fitment refine lives in listingSchema and must see those values; component useState alone silently blocked publish (UAT fix)."
  - "next.config serverActions.bodySizeLimit raised to 12mb so 10MB photos (per lib/images/strip.ts) reach the Server Action locally. KNOWN LIMITATION: Vercel caps the serverless request body at ~4.5MB, so this path will FAIL in production — a signed-URL-direct-to-Storage uploader is a pre-launch blocker (deferred)."
  - "Public seller embed could not be expressed as a PostgREST relationship: seller_id FKs auth.users, which has no FK to profiles_public, so getListing now resolves the seller via a separate enumerated profiles_public read (public columns, no PII; mirrors /u/[username])."

requirements-completed: [LIST-04]

# Metrics
duration: ~3 days (build 2026-06-05; live UAT + fixes + close 2026-06-08)
completed: 2026-06-08
---

# Phase 5 Plan 04: Seller Listing UI (Create / My-Listings / Edit) Summary

**The full seller listing experience: one sectioned create/edit form (RHF + zodResolver(listingSchema)) with a reused Make→Model→Config multi-fit selector + Barnyard toggle, a dnd-kit photo grid that uploads each photo immediately with EXIF stripped server-side (first tile = cover, ≤8), a 3-option shipping radio, a /sell/listings owner index (the LIST-05 entry point) and a /sell/[id]/edit route that re-uses the same form pre-filled and ownership-checked. Live UAT surfaced and fixed three real blockers (Server Action body cap, silent publish, public-page 404).**

## Performance

- **Tasks:** 5 (4 auto + 1 blocking human-verify checkpoint)
- **Files:** 10 (8 created, 2 modified — `next.config.ts`, `lib/listings/queries.ts`)
- **Build (2026-06-05):** Tasks 1-4 + the union/price tsc fix committed.
- **Checkpoint (2026-06-08):** Task-5 human-verify exercised live; three UAT bugs fixed in a follow-up commit; user typed **"approved"**.

## Accomplishments

- **LIST-04 done.** The Shipping section is a RadioGroup of the three `shipping_option` values (Shipping Available / Local Pickup Only / Shipping Assistance Requested); the account contact preference is shown read-only (the control itself lives in 05-05's `/account`).
- **The sectioned create form** (`listing-form.tsx`, `"use client"`) binds `useForm` to `zodResolver(listingSchema)`. Sections in order: Part data (title, part#, USD price, condition Select, damage notes) → Fitment → Photos → Shipping. Submit runs in `startTransition` → `createListing`/`updateListing` → `router.push('/listings/{id}')` + success toast on `{ok:true}`; typed errors map to friendly copy and keep the form mounted.
- **Multi-fit fitment** (`fitment-multi-select.tsx`) reuses the Phase-4 `getModels`/`getConfigs` cascade (configs scoped THROUGH `model_configurations`, never the master), an "Add this fitment" button appends to a removable-badge list, and a Barnyard toggle relaxes the Make+Model requirement.
- **Photo uploader** (`photo-uploader.tsx`) — dnd-kit sortable grid (NOT native DnD), each selected file gets an immediate `createObjectURL` preview + a per-photo spinner, then calls `uploadListingPhoto` (which strips EXIF server-side before any Storage write — invariant #4). First tile shows a "Cover" badge; remove calls `removeListingPhoto`; ≤8 enforced; HEIC/unsupported shows a friendly message; object URLs revoked on unmount.
- **/sell** (force-dynamic, getClaims-gated) renders the create form. **/sell/listings** (force-dynamic) is the LIST-05 entry point — consumes `getMyListings`, lists cover + title + status + an Edit link per row, with an actionable empty state. **/sell/[id]/edit** (force-dynamic) loads `getListing`, ownership-checks via a separate `seller_id` read (notFound on non-owner OR nonexistent), and renders the same form pre-filled.
- **shadcn primitives** `radio-group.tsx` + `textarea.tsx` added (repo owns them).
- **Live UAT passed** — the user exercised create → multi-fit → Barnyard → drag-drop photo upload (EXIF-stripped) → shipping → publish-redirect → reaching edit via the index → edit-prefill, and approved.

## Task Commits

1. **Task 1: shadcn primitives + dnd-kit photo uploader** — `2ea3429` (feat)
2. **Task 2: multi-fit fitment selector + sectioned listing form** — `0510486` (feat)
3. **Task 3: /sell create route + /sell/listings owner index** — `7f3e4d2` (feat)
4. **Task 4: /sell/[id]/edit route — same form pre-filled, ownership-checked** — `16d5dcc` (feat)
5. **(Task-2 follow-up) narrow create/update result union + coerce price input value** — `6e5809b` (fix) — cleared the two tsc errors 05-05 had flagged as a 05-04 build blocker (`result.id` on the un-narrowed `UpdateListingResult | CreateListingResult` union, and the askingPrice `<Input value>` type). Phase build now green.
6. **Task 5 checkpoint fixes: unblock live publish + public detail (UAT)** — `86d0fae` (fix) — the three live-UAT bugs below.

## Files Created/Modified

- `components/listings/photo-uploader.tsx` — dnd-kit sortable photo grid, immediate per-photo upload (EXIF stripped server-side), first=cover, ≤8, friendly HEIC message.
- `components/listings/fitment-multi-select.tsx` — reused Make→Model→Config cascade → multi-fit badge list + Barnyard toggle.
- `components/listings/listing-form.tsx` — the single sectioned create/edit form (RHF + zodResolver(listingSchema)); shared by /sell and /sell/[id]/edit.
- `components/ui/radio-group.tsx`, `components/ui/textarea.tsx` — shadcn primitives.
- `app/(app)/sell/page.tsx` — create route (force-dynamic, getClaims-gated).
- `app/(app)/sell/listings/page.tsx` — owner my-listings index (LIST-05 entry point).
- `app/(app)/sell/[id]/edit/page.tsx` — edit route, same form pre-filled, ownership-checked via seller_id.
- `next.config.ts` — serverActions.bodySizeLimit = "12mb" (UAT fix).
- `lib/listings/queries.ts` — getListing now resolves the seller via a separate enumerated profiles_public read (UAT fix; this is a 05-05-owned file, touched here to make the publish→redirect→public-page flow work end-to-end).

## Decisions Made

- **One sectioned page, no draft, edit reuses the same form** (CONTEXT locks) — publish redirects to the public listing.
- **Edit ownership via a separate seller_id read** — getListing is public-only; non-owner and nonexistent both notFound() (no existence leak).
- **RHF must own the Barnyard/fitment/Condition values** — mirrored via setValue so the barnyard-or-fitment refine in listingSchema actually sees them (see UAT fix 2).
- **bodySizeLimit raised to 12mb** for local uploads, with the Vercel ~4.5MB prod cap flagged as a deferred pre-launch blocker.

## Deviations from Plan

All three were discovered exercising the **live /sell flow during the Task-5 human-verify checkpoint** and fixed before "approved" (commit `86d0fae`). These are checkpoint-driven, not autonomous deviations.

### Checkpoint-driven Fixes (UAT)

**1. [Rule 3 - Blocking] Server Action body limit too low for 10MB photos**
- **Found during:** Task 5 (live photo upload).
- **Issue:** Photo uploads hit Next.js's default 1MB Server Action body cap; photos are up to 10MB each (per `lib/images/strip.ts`), so every upload failed.
- **Fix:** `next.config.ts` → `experimental.serverActions.bodySizeLimit = "12mb"`.
- **KNOWN LIMITATION (flagged):** Vercel's platform caps the serverless request body at **~4.5MB**, so 10MB photos will fail in **production** even though local works. The uploader needs a signed-URL-direct-to-Storage path. **Deferred** — logged to `deferred-items.md` as a pre-launch blocker for the photo pipeline.
- **Files modified:** next.config.ts
- **Commit:** `86d0fae`

**2. [Rule 1 - Bug] Publish failed silently (dead Publish button)**
- **Found during:** Task 5 (clicking Publish did nothing visible).
- **Issue:** `isBarnyard` and `fitment` lived only in component `useState` and never reached the `zodResolver`, so the `barnyard-or-fitment` refine blocked submit with no surfaced error.
- **Fix:** `listing-form.tsx` — mirror both into RHF via `form.setValue(..., {shouldValidate:true})`; added an `onInvalid` handler that surfaces validation errors as a toast; kept the Condition Select controlled (`""`, not `undefined`).
- **Files modified:** components/listings/listing-form.tsx
- **Commit:** `86d0fae`

**3. [Rule 1 - Bug] Public listing page 404 after publish**
- **Found during:** Task 5 (publish redirect landed on notFound()).
- **Issue:** `getListing` embedded `profiles_public:seller_id(...)`, but `seller_id` FKs `auth.users` (no FK to `profiles_public`) → PostgREST `PGRST200` → null → `notFound()`.
- **Fix:** `lib/listings/queries.ts` — resolve the seller in a separate enumerated `profiles_public` read (public columns only, no PII; mirrors `/u/[username]`).
- **Note:** This fix touched a **05-05-owned file** (`queries.ts`) but was necessary to make the 05-04 publish→redirect flow work end-to-end.
- **Files modified:** lib/listings/queries.ts
- **Commit:** `86d0fae`

## Deferred Issues (out of scope — logged, not fixed)

Logged to `.planning/phases/05-listings-photos-exif-safe-storage/deferred-items.md`:

1. **[Pre-launch blocker — photo pipeline] Vercel ~4.5MB request-body cap.** `serverActions.bodySizeLimit=12mb` makes 10MB uploads work locally, but Vercel's platform request-body limit (~4.5MB) will reject them in production. The uploader needs a **signed-URL-direct-to-Storage** path.
2. **[Photo pipeline follow-up] Published photos stay at their `<uid>/staging/...webp` path.** They are never moved to a final location after publish, so a future orphan-file cleanup could delete them. Flag for the photo-pipeline follow-up.

## User Setup Required

None.

## Next Phase Readiness

- **LIST-01/02/04/05 all satisfied at the UI level** (01/02/05 were contract-complete from 05-03; 04 — the shipping radio — is now wired and verified).
- The seller listing flow is end-to-end live and user-approved (create → publish → public page → my-listings → edit).
- **Pre-launch blocker carried forward:** the photo uploader must move to signed-URL-direct-to-Storage before production (Vercel 4.5MB cap); staging-path orphan-cleanup must be handled at publish.
- Phase 5 closes with this plan (5/5).

## Self-Check: PASSED

- All 8 created files + the 2 modified files (`next.config.ts`, `lib/listings/queries.ts`) exist on disk.
- All task commits exist in history: `2ea3429`, `0510486`, `7f3e4d2`, `16d5dcc`, `6e5809b`, `86d0fae`.
- `npx tsc --noEmit` exits clean (the two errors 05-05 flagged were resolved in `6e5809b`).

---
*Phase: 05-listings-photos-exif-safe-storage*
*Completed: 2026-06-08*
