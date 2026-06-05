---
phase: 05-listings-photos-exif-safe-storage
plan: 01
subsystem: database
tags: [sharp, exif, gps-strip, supabase-storage, rls, postgres, listings, vitest]

# Dependency graph
requires:
  - phase: 01-foundation-privacy-model
    provides: "RLS default-deny conventions, (select auth.uid()) policy wrapper, integration-test harness (_supabase.ts anonClient + self-skip)"
  - phase: 03-fitment-taxonomy-slang-library
    provides: "models / configurations / conditions reference tables (listing_fitment + listings FKs point at them)"
  - phase: 04-my-garage
    provides: "owner-scoped table pattern (garage_trucks), coalesce(config_id,0) unique-index trick, model_id + nullable config_id fitment shape"
provides:
  - "lib/images/strip.ts — server-only sharp re-encode + EXIF/GPS strip (the LIST-03 P0 gate); StripResult + stripAndReencode contract for downstream upload Server Actions"
  - "supabase/migrations/0006_listings.sql — listings / listing_fitment / listing_photos / listing_view_events with RLS default-deny in-migration"
  - "supabase/migrations/0007_listing_storage.sql — public listing-photos bucket + 4 owner-folder storage.objects policies"
  - "lib/listings/storage.ts — LISTING_PHOTOS_BUCKET const + listingPhotoPublicUrl helper"
  - "tests/unit/exif-strip.test.ts (CI no-GPS gate) + tests/integration/listings.test.ts (anon read/write RLS gate)"
affects: [05-02, 05-03, listing-form, photo-uploader, fitment-multi-select, 06-fitment-intelligence, 07-search-feed-public-profile, 10-admin-ops-analytics]

# Tech tracking
tech-stack:
  added: [sharp@^0.34.5, "@dnd-kit/core@^6.3.1", "@dnd-kit/sortable@^10.0.0", "@dnd-kit/utilities@^3.2.2", exifr@^7.1.3 (dev), piexifjs@^1.0.6 (dev, test fixture)]
  patterns:
    - "Server-side EXIF strip = full sharp re-encode to WebP (.rotate().webp(), NO keep-metadata methods); declared MIME + sniffed-format double check rejects HEIC"
    - "Listings is a PUBLIC table (no PII, no privacy split); seller_id resolves only to profiles_public"
    - "Owner-write on child tables via EXISTS against listings.seller_id (no direct user_id column)"
    - "Append-only event stream = insert-only RLS, NO select policy (service-role-read in P10)"
    - "money = numeric(12,2); evolving status = text + CHECK (not pg enum)"

key-files:
  created:
    - lib/images/strip.ts
    - lib/listings/storage.ts
    - supabase/migrations/0006_listings.sql
    - supabase/migrations/0007_listing_storage.sql
    - tests/unit/exif-strip.test.ts
    - tests/integration/listings.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "EXIF strip re-encodes to WebP q82 with .rotate() baking orientation; no withMetadata/keepMetadata/keepExif anywhere in the image path"
  - "HEIC rejected (not converted) — prebuilt sharp binary can't decode it; rejected by declared MIME AND by sniffed sharp().metadata().format"
  - "listing_view_events ships now (invariant #8): insert-only (anon+auth), no select policy; logs only listing_id + nullable viewer_id + created_at (no IP/PII)"
  - "asking_price numeric(12,2); status text+CHECK ('active'|'sold') so P8 mark-as-sold needs no breaking migration"
  - "Test fixture uses piexifjs (not sharp.withExif) because sharp 0.34 silently drops the GPS IFD; strip output verified two ways: sharp metadata().exif undefined + exifr readback"

patterns-established:
  - "P0 no-GPS regression test: build GPS-tagged JPEG via piexifjs -> stripAndReencode -> assert sharp metadata().exif undefined AND exifr gps falsy (throw-tolerant for metadata-less WebP)"
  - "Storage authz = storage.objects RLS scoped to (storage.foldername(name))[1] = auth.uid(); app code is not the boundary"

requirements-completed: [LIST-01, LIST-02, LIST-03]

# Metrics
duration: 13min
completed: 2026-06-05
---

# Phase 5 Plan 01: Listings Data + Privacy + EXIF Gate Summary

**Server-side EXIF/GPS strip (sharp re-encode to WebP, proven by an automated no-GPS test) plus the four listing tables (RLS default-deny) and the owner-folder Storage bucket — the Phase-5 privacy/P0 foundation.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-06-05T13:03:15Z
- **Completed:** 2026-06-05T13:16Z
- **Tasks:** 3
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments
- **LIST-03 P0 gate is GREEN:** a GPS-tagged image round-trips through `stripAndReencode` with no GPS out, proven by an automated test in the suite (CLAUDE.md invariant #4).
- The four listing tables (`listings`, `listing_fitment`, `listing_photos`, `listing_view_events`) exist with RLS enabled in the creating migration; anon reads public listing data and cannot write it; the view-event stream is not anon-readable.
- The public `listing-photos` Storage bucket scopes writes to the owner's own `<uid>/` folder via 4 `storage.objects` policies.
- sharp + @dnd-kit installed (lockfile settled); no `.withMetadata()`-family call anywhere in the image path.

## Task Commits

Each task was committed atomically:

1. **Task 1: EXIF strip helper + P0 no-GPS test + deps** - `e875e5d` (feat)
2. **Task 2: Listings data-model migration (4 tables, RLS)** - `8a1aee5` (feat)
3. **Task 3: Storage bucket + RLS migration, bucket helper, RLS integration test** - `78b1871` (feat)

_Note: `2950813 docs(05-02)` between commits 2 and 3 is the parallel 05-02 wave (cross-attribution via lint-staged stash/restore, per project memory) — not part of this plan._

## Files Created/Modified
- `lib/images/strip.ts` - server-only sharp re-encode to WebP; strips all metadata; rejects HEIC by declared MIME + sniffed format; >10MB and non-jpeg/png/webp rejected.
- `lib/listings/storage.ts` - `LISTING_PHOTOS_BUCKET` const + `listingPhotoPublicUrl` helper.
- `supabase/migrations/0006_listings.sql` - 4 listing tables, RLS default-deny in-migration.
- `supabase/migrations/0007_listing_storage.sql` - public bucket + 4 owner-folder storage policies.
- `tests/unit/exif-strip.test.ts` - the P0 no-GPS CI gate.
- `tests/integration/listings.test.ts` - anon read-public / write-deny / view-event RLS gate (4 tests, live vs Staging).
- `package.json` / `package-lock.json` - new deps; lint-staged `*.sql` no-op glob.

## Decisions Made
- **WebP q82 output** for the strip (small, broadly supported, one consistent format out of every upload).
- **HEIC rejected, not converted** (prebuilt sharp can't decode; convert needs a custom libvips+libheif build — out of scope).
- **Test fixture via piexifjs** instead of the plan's `sharp.withExif({GPS})` — see Deviations.
- **Storage RLS is the authz boundary** (Pitfall 4): app-code `auth.uid()` checks are not relied upon alone.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GPS test fixture replaced (sharp.withExif drops the GPS IFD)**
- **Found during:** Task 1 (P0 no-GPS test)
- **Issue:** The plan specified building the GPS-tagged fixture with `sharp(...).withExif({ GPS: {...} })`. Verified on sharp 0.34.5 that the GPS IFD is silently DROPPED — the round-tripped buffer has no `gps` block, so `exifr.gps()` returned undefined on the INPUT and the test's sanity assertion (`before` is truthy) failed. The fixture proved nothing.
- **Fix:** Build the fixture with `piexifjs` (the canonical JS EXIF writer, added as a dev dependency) — it injects a real GPS APP1 segment that exifr reads back as lat/long. Added a `jpegWithGps()` helper in the test.
- **Files modified:** tests/unit/exif-strip.test.ts, package.json (+piexifjs dev dep)
- **Verification:** `before` GPS read is now truthy; strip output has no GPS.
- **Committed in:** e875e5d (Task 1 commit)

**2. [Rule 1 - Bug] no-GPS assertion made WebP-robust**
- **Found during:** Task 1 (P0 no-GPS test)
- **Issue:** `exifr.gps()` / `exifr.parse()` THROW "Unknown file format" on a metadata-less WebP (the stripped output), rather than returning undefined — so the planned `expect(gps).toBeFalsy()` errored instead of passing.
- **Fix:** Made the PRIMARY assertion authoritative via `sharp(out.buffer).metadata().exif` being undefined (sharp exposes the raw embedded EXIF buffer if any survived). Kept exifr as a defensive second read, treating its throw as proof-of-absence (`.catch(() => undefined)`).
- **Files modified:** tests/unit/exif-strip.test.ts
- **Verification:** Test green; strip output proven metadata-free two independent ways.
- **Committed in:** e875e5d (Task 1 commit)

**3. [Rule 3 - Blocking] lint-staged `*.sql` glob set to no-op**
- **Found during:** Task 2 (committing the SQL migration)
- **Issue:** Project memory flagged that SQL-only commits abort as "empty" because lint-staged had no `*.sql` glob; the plan/memory suggested adding one with `prettier --write`. But prettier has no SQL parser installed, so `prettier --write` on a `.sql` file errors and aborts the commit.
- **Fix:** Added `"*.sql": []` (match the file so the commit isn't empty, but run no command).
- **Files modified:** package.json
- **Verification:** SQL commits 8a1aee5 / 78b1871 succeeded.
- **Committed in:** 8a1aee5 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs in the planned test approach, 1 blocking tooling fix)
**Impact on plan:** All necessary for the gate to actually prove what it claims and for SQL commits to land. No scope creep — the strip helper, schema, and policies match the plan exactly.

## Issues Encountered
- IDE T-SQL diagnostics flagged the Postgres `generated always as identity` syntax as errors — false positives from a MS-SQL parser; identical syntax is used in 0003/0004 and applies cleanly to Postgres 17 on Staging.
- The Task-2 automated verify substring-matched the word "float" inside an explanatory comment; reworded the comment (schema correctly uses `numeric`/`text+CHECK`).

## User Setup Required
None - no external service configuration required. (Bucket + policies applied to Staging via the linked CLI.)

## Next Phase Readiness
- Wave-2/3 plans (05-02 listing contracts/condition reader, 05-03 Server Actions + uploader UI) can now import `stripAndReencode`, `LISTING_PHOTOS_BUCKET`, `listingPhotoPublicUrl`, and write against the four tables under owner RLS.
- The pre-publish staging-path strategy (research Pattern 3) is supported by the owner-folder bucket policy; the upload Server Action and reconcile-on-create land in a later wave.
- `next.config` `images.remotePatterns` still needs the Supabase Storage host whitelisted when photo rendering ships (deferred to the rendering plan).

## Self-Check: PASSED

All 6 created files exist on disk; all 3 task commits (e875e5d, 8a1aee5, 78b1871) exist in history.

---
*Phase: 05-listings-photos-exif-safe-storage*
*Completed: 2026-06-05*
