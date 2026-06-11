---
phase: 10-admin-operations-analytics
plan: 09
subsystem: admin
tags: [admin, csv-import, papaparse, exif, storage, drafts, audit]
requires:
  - phase: 10-admin-operations-analytics (10-01)
    provides: migration 0019 — 'draft' status accepted by the listings check + public-read policy excludes drafts
  - phase: 10-admin-operations-analytics (10-02)
    provides: requireAdmin() gate, logAdminAction('csv_import') audit writer
  - phase: 10-admin-operations-analytics (10-04)
    provides: /admin/listings?status=draft review + one-click bulk-publish surface
  - phase: 05-listings-photos-exif
    provides: stripAndReencode() EXIF/GPS gate, listing-photos bucket + <uid>/staging path convention
provides:
  - lib/admin/import.ts — csvRowSchema (zod), resolveSeller, resolveTaxonomy, importPhoto (URL fetch → EXIF gate → seller-uid Storage path), importRow per-row pipeline
  - POST /api/admin/import — requireAdmin-gated route handler, Papa.parse, 100-row cap, sequential import, csv_import audit row, per-row JSON results
  - /admin/import — upload UI, expandable column reference, progress state, failed-rows report linking to the draft bulk-publish surface
  - tests/unit/csv-import.test.ts — row-schema cases + GPS-fixture no-GPS regression through importPhoto
affects: [10-10]
tech-stack:
  added: [papaparse@^5.5.3, "@types/papaparse (dev)"]
  patterns:
    - "imported photos NEVER bypass the P0 gate: importPhoto fetches the URL then calls stripAndReencode() — no parallel sharp pipeline; only the clean WebP buffer is uploaded"
    - "per-row firewall: importRow wraps the whole pipeline in try/catch returning {row, ok, error} — one bad row never aborts the file"
    - "photos processed BEFORE the draft insert (Pitfall 6): a mid-row photo failure leaves zero half-imported listings; already-uploaded objects are best-effort removed"
    - "fetchImpl is injectable on importPhoto so the EXIF regression test drives a GPS fixture through the real import path"
key-files:
  created:
    - lib/admin/import.ts
    - app/api/admin/import/route.ts
    - app/admin/import/page.tsx
    - components/admin/import-form.tsx
    - tests/unit/csv-import.test.ts
  modified:
    - package.json
key-decisions:
  - "barnyard-or-fitment enforced at IMPORT time (schema refine) because bulkPublishDrafts flips drafts active without re-validating; drafts may be photo-light (photo minimum stays a publish-time concern)"
  - "fitment make matching is longest-prefix over active makes so multi-word makes (Western Star 4900) parse correctly"
  - "ambiguous category names (same name under multiple parents) are a reported row error, not a silent pick"
  - "imported photos land under the existing <seller-uid>/staging/<uuid>.webp convention — same prefix uploadListingPhoto uses, so Storage RLS/ownership semantics are identical"
  - "row numbers in the report are 1-based DATA rows (header excluded) — what a spreadsheet user expects to fix"
metrics:
  duration: ~13 min
  completed: 2026-06-11
  tasks: 2
  files: 6
---

# Phase 10 Plan 09: CSV Bulk Import Summary

**One-liner:** CSV bulk-onboarding via Papa Parse + per-row zod validation: rows become draft listings owned by real sellers, photo URLs are fetched server-side through the existing stripAndReencode() EXIF gate, failures are reported per-row, and drafts publish via the 10-04 bulk-publish surface.

## What Was Built

### Task 1 — Import library (`lib/admin/import.ts`, commit 6a519b9)
- **csvRowSchema** (zod): seller (username/email), title (1–120), part_number?, asking_price (positive, 2-decimal), condition (name), shipping_option (normalized to the 3-option DB enum), damage_notes?, is_barnyard (truthy parse), fitments? ("Make Model[:Config]" `;`-separated), categories? (names `;`-separated), photo_url_1..8 (https-only). A `.refine` enforces barnyard-or-fitment at import time since bulk-publish does not re-validate.
- **resolveSeller**: `profiles_public.username` citext eq first, then `profiles_private.email` (service role, PII stays server-side); clear "seller not found" error.
- **resolveTaxonomy**: names → ids with `is_active = true` everywhere (ADMO-05 posture); longest-prefix make match; model scoped under the make; optional config resolved AND re-checked against `model_configurations` (same applicability rule as createListing); per-field error strings.
- **importPhoto**: https-only, 10MB cap (header + actual bytes), 10s `AbortSignal.timeout`, fetch → **`stripAndReencode()`** (the existing P0 gate — invariant #4) → upload only the clean WebP to `listing-photos` under `<seller-uid>/staging/<uuid>.webp`. `fetchImpl` injectable for the regression test.
- **importRow**: full per-row try/catch; photos all processed before the `status='draft'` listing insert; children (`listing_fitment`, ordered `listing_photos`, `listing_categories`) inserted after; orphan Storage cleanup when a later photo in the row fails.
- **Tests** (`tests/unit/csv-import.test.ts`, node env): valid row + normalization, bad price set, non-https/invalid URL, missing seller, barnyard rule, **GPS-laden JPEG fixture through importPhoto → stored buffer has no EXIF buffer and no exifr coordinates**, non-https rejected without fetching, >10MB rejected before the strip. 8/8 green.

### Task 2 — Route + UI (commit cbdb6f3)
- **`app/api/admin/import/route.ts`**: `maxDuration = 300` (noted: Vercel plan may cap lower; UI mentions the Staging-local fallback). `await requireAdmin()` FIRST → FormData CSV text (photos arrive by URL, dodging the ~4.5MB body cap) → `Papa.parse` (header:true, skipEmptyLines:"greedy", trimmed lowercase headers) → reject >100 data rows with a clear message → sequential `importRow` loop → `logAdminAction('csv_import', { fileName, imported, failed })` (throwing) → `{ imported, failed, results }`.
- **`/admin/import`** (force-dynamic, requireAdmin) + **`components/admin/import-form.tsx`** (client): .csv file input, expandable column-reference table mirroring csvRowSchema, "Importing — this can take a few minutes…" progress state, results report with summary line + failed-rows table (row #, seller — title context, reason) and a success link to `/admin/listings?status=draft` for review + one-click bulk publish. All copy in English.
- Sidebar already carried the `/admin/import` "CSV Import" link (shipped with the 10-02 shell).

## Verification

- `npx vitest run tests/unit/csv-import.test.ts` — 8/8 passed (schema + EXIF gate on the import path).
- `npm test -- --run` — 42/43 files green; the single failure is the **pre-existing** 0019-induced FTS GIN gate failure in `tests/integration/search.test.ts`, already tracked in `deferred-items.md` (out of scope here).
- `npm run typecheck` — clean.
- `npm run build` — clean; `/admin/import` and `/api/admin/import` both dynamic (ƒ).

## Deviations from Plan

None - plan executed exactly as written. (The only schedule note: the first `npm run build` collided with a parallel wave executor's build lock and was retried.)

## Deferred Issues

- Pre-existing FTS GIN gate failure in `tests/integration/search.test.ts` (0019 RLS qual vs non-leakproof `@@`) — already in `deferred-items.md`, fix planned at phase verification (definer-ize `search_listings`).
- Live end-to-end CSV import against Staging (real sellers + real photo URLs + bulk publish + contact flow on an imported listing) belongs to 10-10 UAT per the phase structure.

## Self-Check: PASSED

- lib/admin/import.ts — FOUND
- app/api/admin/import/route.ts — FOUND
- app/admin/import/page.tsx — FOUND
- components/admin/import-form.tsx — FOUND
- tests/unit/csv-import.test.ts — FOUND
- Commit 6a519b9 — FOUND
- Commit cbdb6f3 — FOUND
