---
phase: 06-fitment-intelligence
plan: 02
subsystem: listings
tags: [fitment-intelligence, FINT-03, listings, persistence, read-surface]
requires:
  - "06-01: fitment_rules + listing_categories + listing_search_terms tables (RLS in-migration), listingSchema categoryIds/searchTermIds"
provides:
  - "getPartCategories() — anon-public 2-level part-category tree reader"
  - "createListing/updateListing persist + replace listing_categories + listing_search_terms children"
  - "getListing returns categories[] + searchTerms[] (public names, no PII)"
  - "listing-detail renders Part-categories + Also-tagged badge sections"
  - "edit page reads category/term ids into ListingFormDefaults (categoryIds/searchTermIds)"
  - "ListingFormDefaults gains optional categoryIds/searchTermIds (06-04 consumes)"
affects:
  - "06-04 (category selector + suggestion chips: consumes getPartCategories + pre-fill defaults)"
  - "Phase 7 (search surfaces the confirmed categories/terms)"
tech-stack:
  added: []
  patterns:
    - "best-effort sequential child inserts (mirrors fitment/photo, 05-RESEARCH Open Q3)"
    - "replace-children on update (delete-all-then-reinsert)"
    - "embedded reference-name resolution via PostgREST (public tables only, no PII)"
    - "shape-equivalence assertion at the action-input layer (no live auth write)"
key-files:
  created: []
  modified:
    - lib/listings/cascade.ts
    - lib/actions/listings.ts
    - lib/listings/queries.ts
    - components/listings/listing-detail.tsx
    - "app/(app)/sell/[id]/edit/page.tsx"
    - components/listings/listing-form.tsx
    - tests/integration/fitment-intelligence.test.ts
decisions:
  - "FINT-03 is proven by shape-equivalence at the action INPUT layer (not a live auth write) — accept-path and manual-add both fold into the SAME listingSchema.fitment, inserted by the SAME action, producing byte-identical listing_fitment rows. No separate suggestion plumbing exists."
  - "ListingFormDefaults categoryIds/searchTermIds added as OPTIONAL minimal-unblock fields here; Plan 06-04 owns listing-form.tsx and wires them into the selector + suggestion chips."
  - "Invariant #8: NO accept/reject telemetry is logged — the confirmation is fully reconstructible from the resulting join rows (listing_categories/listing_search_terms/listing_fitment)."
metrics:
  duration: ~8 min
  tasks: 3
  files: 7
  completed: "2026-06-09T14:24:17Z"
---

# Phase 6 Plan 02: Part-Category + Search-Term Persistence & Read-Back Summary

The new Phase-6 dimensions (part-categories + slang search-terms) are now REAL end-to-end on the persistence + read side: a `getPartCategories()` reader, category/term child writes in the UNCHANGED-shape `createListing`/`updateListing` trust boundary, read-back on the public listing detail page (so FINT-03 is visible before Phase 7), and edit-mode id pre-fill — with the FINT-03 "accepted suggestion = manual tag" equivalence asserted at the action-input layer.

## What Was Built

**Task 1 — reader + writes (`b9a4228`)**
- `getPartCategories()` in `lib/listings/cascade.ts`: anon-public read of `part_categories(id, name, parent_id)`, ordered roots-first then alphabetically, mapped to `{ id, name, parentId }`, `[]` on error. Mirrors `getConditions()`.
- `createListing`: after the existing listing + fitment + photo inserts, best-effort sequential inserts of `listing_categories` (from `v.categoryIds`) + `listing_search_terms` (from `v.searchTermIds`). Same posture as fitment/photo; owner-write EXISTS policy admits them.
- `updateListing`: extended the REPLACE-CHILDREN block — added both tables to the delete sweep AND the re-insert, preserving order (delete all children, then re-insert all).
- The existing fitment/photo handling is byte-for-byte unchanged (the FINT-03 row-identity guarantee depends on it).

**Task 2 — read-back (`11de6a4`)**
- `getListing` (`lib/listings/queries.ts`): added `listing_categories ( category_id, part_categories:category_id ( name ) )` + `listing_search_terms ( term_id, search_terms:term_id ( term ) )` embeds; extended `ListingDetailRow`; added `categories[]` + `searchTerms[]` to `ListingDetail` (names resolved from PUBLIC reference tables only, null-tolerant filter — no `profiles_*` touched, Pitfall 7).
- `listing-detail.tsx`: two new badge sections after "Fits" — "Part categories" + "Also tagged" — each rendered only when non-empty, mirroring the fitment block markup. Makes FINT-03 visually verifiable at the 06-04 checkpoint.
- `app/(app)/sell/[id]/edit/page.tsx`: added the two id embeds + `EditableRow` fields, mapped to `categoryIds`/`searchTermIds`, passed into `defaults`.
- `components/listings/listing-form.tsx`: `ListingFormDefaults` gains optional `categoryIds?`/`searchTermIds?` (minimal unblock; 06-04 wires them into the selector).

**Task 3 — FINT-03 equivalence test (`9474013`)**
- Appended a `describe("FINT-03: accepted suggestion = manual tag (identical fitment rows)")` block to `tests/integration/fitment-intelligence.test.ts` (alongside the sibling 06-03 FINT-01 block — both preserved). Three pure shape-equivalence assertions via `listingSchema.parse`: accept-path vs manual fitment array, category/term id arrays, and model-level (configId omitted → null-config). Documents the live equivalence at the 06-04 checkpoint + the Phase-7 search split + the no-telemetry (invariant #8) determination.

## Deviations from Plan

None — plan executed exactly as written. The `ListingFormDefaults` minimal-field extension was anticipated by the plan (Task 2 cross-plan type-race note) and done as instructed.

## Verification

- `npx tsc --noEmit` clean after every task.
- `npm run test` full suite green: **27 files / 150 passed / 1 skipped** (no regression). The targeted file passes 13 tests (RLS gate + 06-03 FINT-01 + my FINT-03).
- Live persistence + public-page render of confirmed categories/terms is verified at the Plan 06-04 human-verify checkpoint; actual search surfacing is Phase 7.

## Parallel-Wave Note

Ran in parallel with 06-03. The shared `tests/integration/fitment-intelligence.test.ts` carries BOTH plans' assertions (06-03's FINT-01 block, committed in `0a83dd4`, plus this plan's FINT-03 block) — both preserved per the coordination directive. The husky stash/restore hazard fired once (it transiently reverted in-progress unstaged queries.ts edits between commits); all my work was re-applied and verified by file-on-disk, not by commit contents.

## Self-Check: PASSED

- All 6 plan files + listing-form.tsx present on disk with my content (greps: getPartCategories=1, listing_categories|listing_search_terms in actions=6, categories|searchTerms in queries=13, Part-categories|Also-tagged in detail=2, FINT-03 block=1).
- Commits present: `b9a4228` (Task 1), `11de6a4` (Task 2), `9474013` (Task 3).
