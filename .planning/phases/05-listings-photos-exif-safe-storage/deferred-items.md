# Phase 05 — Deferred Items

Out-of-scope discoveries logged during execution (not fixed by the owning plan).

## From 05-02 execution (2026-06-05)

- **tsc error in `tests/unit/exif-strip.test.ts`** (belongs to plan 05-01's wave, not 05-02):
  `TS2345 ... { gps: true; exif: true; ifd0: boolean } is not assignable ...` at line 76.
  This file is owned by the parallel plan 05-01 (EXIF strip pipeline). Out of scope for 05-02
  (no file overlap with 05-02's `lib/listings/*` + migration 0008). 05-02's own modules compile clean.
  Owner: 05-01.

- **Migration `0008_active_listing_count.sql` could not be applied to Staging during 05-02** because
  `public.listings` does not exist yet — it is created by plan 05-01, which runs in the SAME wave and
  had not landed its migration at 05-02 execution time. The plan's `language sql` body resolves
  `public.listings` at function-creation time. The migration FILE is complete and content-verified;
  it must be APPLIED to Staging AFTER 05-01's listings migration lands (wave-ordering constraint the
  orchestrator owns). Apply with: `supabase db query --linked -f supabase/migrations/0008_active_listing_count.sql`.
