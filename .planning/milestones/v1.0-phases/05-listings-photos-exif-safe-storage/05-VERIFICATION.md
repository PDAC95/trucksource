---
phase: 05-listings-photos-exif-safe-storage
verified: 2026-06-08T11:46:00Z
status: passed
score: 4/4 success criteria verified
re_verification: false
---

# Phase 5: Listings / Photos / EXIF-Safe Storage — Verification Report

**Phase Goal:** A seller can create, edit, and sell a listing with the full public field set, tag it against the fitment library, and upload multiple photos that are stripped of all metadata server-side — so no photo can ever leak the seller's exact location.

**Verified:** 2026-06-08T11:46:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | A seller can create a listing with the full public field set and edit their own listings afterward | ✓ VERIFIED | `createListing` + `updateListing` in `lib/actions/listings.ts`; `listingSchema` enforces Title, Part Number, Asking Price, Condition, Shipping, Damage Notes, Fitment, Date Listed; `app/(app)/sell/page.tsx` + `app/(app)/sell/[id]/edit/page.tsx` wired end-to-end; UAT confirmed |
| 2 | Uploaded photos have all EXIF/GPS stripped server-side, proven by automated test | ✓ VERIFIED | `lib/images/strip.ts` — `.rotate().webp({ quality: 82 }).toBuffer()` chain with zero `.withMetadata`/`.keepMetadata`/`.keepExif` calls; `tests/unit/exif-strip.test.ts` passes (2/2 tests: GPS-in → GPS-absent-out, HEIC rejected); full suite 107 passed / 1 skipped |
| 3 | A seller can select a shipping option per listing: Shipping Available / Local Pickup Only / Shipping Assistance Requested | ✓ VERIFIED | `listingSchema` z.enum with all three values; DB `CHECK` constraint in `0006_listings.sql`; `listing-form.tsx` renders three RadioGroup options |
| 4 | A seller can set an account-level contact preference: Email Only / Email + Phone / Marketplace Messaging Only | ✓ VERIFIED | Migration `0009_contact_preference.sql` adds `contact_preference` column on `profiles_public`; `lib/account/schema.ts` + `lib/actions/account.ts` implement the action; `app/(app)/account/` renders the form with all three options; defaults to `messaging_only` (most private) |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `lib/images/strip.ts` | ✓ VERIFIED | Exports `stripAndReencode`; `import "server-only"`; chain is `.rotate().webp().toBuffer()` — no metadata-keeping calls |
| `supabase/migrations/0006_listings.sql` | ✓ VERIFIED | Creates all 4 tables (listings, listing_fitment, listing_photos, listing_view_events); each has `enable row level security`; `asking_price numeric(12,2)`; `status text + CHECK`; view-events has exactly one INSERT policy |
| `supabase/migrations/0007_listing_storage.sql` | ✓ VERIFIED | Creates `listing-photos` bucket (public); 4 storage.objects RLS policies using `(storage.foldername(name))[1] = (select auth.uid())::text` |
| `supabase/migrations/0009_contact_preference.sql` | ✓ VERIFIED | `ADD COLUMN IF NOT EXISTS contact_preference text NOT NULL DEFAULT 'messaging_only' CHECK (...)` on `profiles_public` |
| `lib/listings/schema.ts` | ✓ VERIFIED | `listingSchema` (zod) with all required fields; barnyard/fitment refine; single client+server source of truth |
| `lib/listings/queries.ts` | ✓ VERIFIED | `getListing` + `getMyListings`; public columns only; seller resolved via `profiles_public` (enumerated columns: username, state_province, country — no PII) |
| `lib/actions/listings.ts` | ✓ VERIFIED | `createListing` / `updateListing` / `uploadListingPhoto` / `removeListingPhoto`; all use `getClaims()`; photo-path ownership guard; combo re-check; EXIF gate wired |
| `lib/actions/listing-view.ts` | ✓ VERIFIED | `recordListingView` uses `getClaims()`, inserts `listing_id + viewer_id` (no IP/PII), swallows errors |
| `lib/actions/account.ts` | ✓ VERIFIED | `updateContactPreference` uses `getClaims()`; re-validates with `contactPreferenceSchema`; owner-scoped update of `profiles_public` |
| `lib/account/schema.ts` | ✓ VERIFIED | `contactPreferenceSchema` with three enum values matching the DB CHECK |
| `tests/unit/exif-strip.test.ts` | ✓ VERIFIED | P0 no-GPS regression test; uses piexifjs to inject real GPS; asserts `outMeta.exif` is undefined; asserts `exifr.gps(out.buffer)` is null/undefined; HEIC rejection test — both pass |
| `tests/integration/listings.test.ts` | ✓ VERIFIED | anon SELECT allowed; anon INSERT denied; view-events anon INSERT permitted (FK vs RLS distinction tested); view-events anon SELECT returns empty array |
| `tests/integration/contact-preference.test.ts` | ✓ VERIFIED | anon can read `contact_preference` (non-PII); anon UPDATE is a no-op (0 rows) — owner-only write confirmed |
| `components/listings/listing-form.tsx` | ✓ VERIFIED | Sections: Part Data → Fitment → Photos → Shipping; uses `listingSchema` with zodResolver; barnyard/fitment state mirrored into RHF; redirect to `/listings/<id>` on create; redirect to `/listings/<listingId>` on edit |
| `components/listings/listing-detail.tsx` | ✓ VERIFIED | Renders photos, fitment, price, seller public identity (username + location only); Contact seller button is `disabled` (Phase 9 placeholder — by design) |
| `app/(public)/listings/[id]/page.tsx` | ✓ VERIFIED | `export const dynamic = "force-dynamic"`; calls `recordListingView` fire-and-forget after listing found; uses `getListing`; `notFound()` on missing id |
| `app/(app)/sell/page.tsx` | ✓ VERIFIED | `force-dynamic`; `getClaims()`; loads makes + conditions; reads contact preference defensively |
| `app/(app)/sell/listings/page.tsx` | ✓ VERIFIED | `force-dynamic`; `getClaims()`; calls `getMyListings()`; lists with Edit links to `/sell/<id>/edit` |
| `app/(app)/sell/[id]/edit/page.tsx` | ✓ VERIFIED | `force-dynamic`; `getClaims()`; owner-scoped fetch; double ownership check; `notFound()` for non-owner/nonexistent |
| `app/(app)/account/page.tsx` | ✓ VERIFIED | `force-dynamic`; `getClaims()`; reads `contact_preference` from `profiles_public`; defaults to `messaging_only` |
| `app/(app)/account/contact-preference-form.tsx` | ✓ VERIFIED | RHF + `contactPreferenceSchema`; `updateContactPreference` called in `startTransition`; `router.refresh()` after save |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/images/strip.ts` | `sharp` | `.rotate().webp().toBuffer()` — no metadata methods | ✓ WIRED | Confirmed; grep of `lib/images/` finds ZERO occurrences of `withMetadata`/`keepMetadata`/`keepExif` as callable methods |
| `tests/unit/exif-strip.test.ts` | `lib/images/strip.ts` | imports `stripAndReencode`; round-trips GPS-tagged buffer | ✓ WIRED | Both tests pass; piexifjs used to inject genuine GPS that `exifr` reads back |
| `lib/actions/listings.ts` → `uploadListingPhoto` | `lib/images/strip.ts` | `stripAndReencode(input, file.type)` before any Storage write | ✓ WIRED | Original GPS bytes never reach Storage; only `stripped.buffer` is uploaded |
| `app/(public)/listings/[id]/page.tsx` | `lib/actions/listing-view.ts` | `void recordListingView(listing.id)` on every force-dynamic render | ✓ WIRED | Called before rendering, swallows errors, page is force-dynamic |
| `listing-form.tsx` → `createListing` | `lib/actions/listings.ts` | `await createListing(payload)` in `startTransition` | ✓ WIRED | Redirect to `/listings/${result.id}` on success |
| `listing-form.tsx` → `updateListing` | `lib/actions/listings.ts` | `await updateListing(listingId, payload)` in edit branch | ✓ WIRED | Redirect to `/listings/${listingId}` on success |
| `contact-preference-form.tsx` | `lib/actions/account.ts` | `await updateContactPreference(values)` in `startTransition` | ✓ WIRED | `router.refresh()` after save; toast on error |

---

### Cross-Cutting Gate Verification (CLAUDE.md Invariants)

| Invariant | Check | Status | Evidence |
|-----------|-------|--------|---------|
| #4 EXIF/GPS strip | `strip.ts` chain has `.rotate().webp()` — no `withMetadata`/`keepExif`/`keepMetadata`; automated test passes | ✓ VERIFIED | `tests/unit/exif-strip.test.ts` 2/2 pass; grep of `lib/images/` finds only comment-references, zero live calls |
| #1/#2 Privacy + RLS default-deny | All 4 listing tables have RLS enabled in `0006`; `listing_view_events` insert-only; `listings` public-read + owner-write | ✓ VERIFIED | Migration confirmed; integration tests confirm anon read allowed, anon write blocked |
| #8 View events ship with listings (Phase 5) | `listing_view_events` table in `0006`; `recordListingView` action in Phase 5; wired to force-dynamic public listing page | ✓ VERIFIED | All three pieces present and wired |
| #6 getClaims not getSession | All 5 server actions and all 4 server pages use `supabase.auth.getClaims()` | ✓ VERIFIED | grep of phase 5 files — zero `getSession()` calls in application code |
| #1 No PII on public surfaces | `getListing` selects enumerated columns from `profiles_public` (username, state_province, country only); `listing_detail.tsx` never receives PII | ✓ VERIFIED | grep confirms no `profiles_private`, no first_name/last_name/phone/email/address columns in listing query or detail component |

---

### Requirements Coverage

| Requirement | Plans | Description | Status | Evidence |
|-------------|-------|-------------|--------|---------|
| LIST-01 | 05-01, 05-02, 05-03, 05-04 | Seller creates listing with full public field set | ✓ SATISFIED | `createListing` + `listingSchema` + `ListingForm`; all public fields present; UAT confirmed |
| LIST-02 | 05-01, 05-03, 05-04 | Seller uploads multiple photos | ✓ SATISFIED | `uploadListingPhoto` Server Action; `PhotoUploader` component; per-photo upload with spinner; cover = sort_order 0 |
| LIST-03 | 05-01, 05-02, 05-03 | Photos EXIF/GPS stripped server-side | ✓ SATISFIED | P0 gate: `stripAndReencode`; no-GPS regression test passes; nothing reaches Storage un-stripped |
| LIST-04 | 05-01, 05-02, 05-04 | Shipping option: Shipping Available / Local Pickup Only / Shipping Assistance Requested | ✓ SATISFIED | `listingSchema` z.enum; DB CHECK; RadioGroup in `ListingForm` |
| LIST-05 | 05-02, 05-03, 05-04 | Seller can edit own listings | ✓ SATISFIED | `updateListing`; `/sell/[id]/edit/page.tsx`; owner-scoped; notFound for non-owner; UAT confirmed |
| LIST-07 | 05-05 | Contact preference per account: Email Only / Email + Phone / Marketplace Messaging Only | ✓ SATISFIED | Migration 0009; `updateContactPreference`; `ContactPreferenceForm`; defaults to `messaging_only` |

All 6 phase-5 requirement IDs (LIST-01 through LIST-05, LIST-07) are satisfied. LIST-06 (mark as Sold) is correctly mapped to Phase 8 and is not a Phase 5 requirement.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `components/listings/listing-detail.tsx` | 23–33 | `shippingLabel()` switch cases use stale strings (`ships`, `ships_or_pickup`) that don't match DB enum values (`shipping_available`, `shipping_assistance`); those two options fall through to `default: return option` showing raw snake_case | ⚠️ Warning | Cosmetic only — shows `shipping_available` / `shipping_assistance` as raw strings on the public listing page instead of "Shipping Available" / "Shipping Assistance Requested". No security, privacy, or data-integrity impact. |
| `deferred-items.md` | — | Vercel ~4.5MB body cap blocks production photo uploads >4.5MB (documented pre-launch blocker) | ⚠️ Warning (known/deferred) | Documented in `deferred-items.md`; photo upload works locally (Server Action body limit raised to 12MB in `next.config.ts`); production path requires signed-URL-direct-to-Storage. Does not affect EXIF privacy gate. |
| `deferred-items.md` | — | Published photos remain at `<uid>/staging/...` path — a future cleanup job could delete live photos | ℹ️ Info (known/deferred) | Documented; no immediate impact; requires decision on publish-time move before any cleanup job ships. |

No blocker anti-patterns detected. `withMetadata`/`keepMetadata`/`keepExif` are absent from all executable code in `lib/images/`.

---

### TypeScript / Test Gate

- `npx tsc --noEmit`: **CLEAN** (no output, exit 0)
- `npx vitest run tests/unit/exif-strip.test.ts`: **2/2 PASSED**
- `npx vitest run` (full suite): **107 passed, 1 skipped** (the 1 skipped is an integration test that self-skips in CI without Supabase env vars — expected behavior)

---

### Human Verification Required

#### 1. Shipping option display labels on public listing page

**Test:** Create a listing with "Shipping Available" selected, publish it, open the public `/listings/<id>` page.
**Expected:** The shipping row should read "Shipping Available" (human-readable), not `shipping_available` (snake_case).
**Why human:** The `shippingLabel()` bug in `listing-detail.tsx` is confirmed by code reading but only visible in a rendered browser page. The fix is a one-liner (add the missing cases) but the cosmetic impact needs a human to confirm severity before treating it as a blocker.

#### 2. Photo upload → EXIF strip → public display end-to-end

**Test:** Upload a photo taken on a phone (JPEG with GPS EXIF) through the `/sell` page; publish the listing; navigate to the public `/listings/<id>` page; download the displayed photo and check metadata with a tool (e.g. ExifTool or https://exifdata.com).
**Why human:** The automated no-GPS regression test proves the strip function works in isolation. A full-stack confirmation that the stripped WebP — after round-tripping through Storage and back via the public URL — carries no GPS is the highest-confidence check.

---

### Gaps Summary

No functional gaps blocking the phase goal. The phase goal ("A seller can create, edit, and sell a listing… and upload multiple photos that are stripped of all metadata") is fully achieved:

- The create/edit/publish flow works end-to-end (live UAT confirmed, three bugs fixed in commit `86d0fae`).
- The EXIF/GPS strip is automated-tested and the gate is green.
- All RLS invariants hold across 4 tables + Storage.
- The view-event stream ships with this phase (invariant #8).
- Contact preference (LIST-07) is implemented with privacy-correct defaults.

Two known deferred items (Vercel body cap, staging path) are pre-launch concerns, documented in `deferred-items.md`, and do not affect the core phase guarantees.

One cosmetic display bug exists in `listing-detail.tsx` (`shippingLabel` stale switch cases) — human verification requested to confirm its priority.

---

_Verified: 2026-06-08T11:46:00Z_
_Verifier: Claude (gsd-verifier)_
