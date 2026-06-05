# Phase 05 — Deferred Items

Out-of-scope discoveries logged during execution (not fixed by the owning plan).

## From 05-02 execution (2026-06-05)

- **tsc error in `tests/unit/exif-strip.test.ts`** (belongs to plan 05-01's wave, not 05-02):
  `TS2345 ... { gps: true; exif: true; ifd0: boolean } is not assignable ...` at line 76.
  This file is owned by the parallel plan 05-01 (EXIF strip pipeline). Out of scope for 05-02
  (no file overlap with 05-02's `lib/listings/*` + migration 0008). 05-02's own modules compile clean.
  Owner: 05-01.

- **[RESOLVED] Migration `0008_active_listing_count.sql` Staging apply was blocked on 05-01's `listings` table.**
  At first attempt `public.listings` did not exist (created by parallel plan 05-01, same wave) →
  `42P01`. Retried after 05-01 landed `0006_listings.sql`; 0008 applied cleanly and the RPC was
  verified (`active_listing_count('…000'::uuid)` returns 0). No outstanding action.
