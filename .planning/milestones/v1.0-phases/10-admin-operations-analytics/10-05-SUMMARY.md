---
phase: 10-admin-operations-analytics
plan: 05
subsystem: admin
tags: [admin, taxonomy, fitment, slang, crud, is_active, service-role, audit]
requires:
  - phase: 10-admin-operations-analytics (10-01)
    provides: is_active boolean on all 8 taxonomy tables (migration 0019)
  - phase: 10-admin-operations-analytics (10-02)
    provides: requireAdmin() gate + logAdminAction() audit writer + admin shell/sidebar
  - phase: 03-fitment-taxonomy-slang-library
    provides: the 8 taxonomy tables + search_terms/search_term_targets exclusive-arc shape (0003)
provides:
  - lib/admin/taxonomy-config.ts — TAXONOMY_LEVELS config map (table, label, columns, parent FK, special flags) driving pages AND actions
  - lib/actions/admin/taxonomy.ts — createValue/updateValue/setActive/deleteValue + createSlangTerm/updateSlangTerm/setSlangTargets (requireAdmin + zod + column whitelist + service-role + audit)
  - /admin/fitment level picker + /admin/fitment/[level] generic CRUD page (part_categories doubles as the sidebar Categories link target)
  - components/admin/slang-editor.tsx — add-term + map-target ≤3-click slang surface
  - is_active = true filters on every NEW-listing/garage picker query + fitment-rules suggestions
  - createListing/updateListing server-side rejection of newly-ADDED inactive taxonomy ids (retained values stay valid)
affects: [10-09 (CSV import writes the same tables), 10-10 (UAT)]
tech-stack:
  added: []
  patterns:
    - "config-driven generic CRUD: one record per level drives page columns, form fields, action whitelist — adding a level is config-only"
    - "FK-guarded hard delete: attempt delete, catch 23503, surface 'In use by existing data — deactivate instead.'"
    - "picker-only is_active filter: new-value selection UIs filter; search/read/display surfaces never do"
    - "edit-diff validation: updates compare submitted taxonomy ids vs the listing's current rows and only block ADDING inactive values"
key-files:
  created:
    - lib/admin/taxonomy-config.ts
    - lib/actions/admin/taxonomy.ts
    - app/admin/fitment/page.tsx
    - app/admin/fitment/[level]/page.tsx
    - components/admin/taxonomy-crud.tsx
    - components/admin/slang-editor.tsx
    - tests/unit/picker-active-filter.test.ts
  modified:
    - lib/garage/cascade.ts
    - lib/listings/cascade.ts
    - lib/fitment/suggest.ts
    - lib/actions/listings.ts
    - app/(app)/sell/page.tsx
    - app/(app)/sell/[id]/edit/page.tsx
    - app/(app)/profile/garage/page.tsx
    - tests/unit/listing-lifecycle-actions.test.ts
key-decisions:
  - "taxonomy-config.ts is a plain shared module (not server-only): zero secrets (table names are public in migrations), and the client CRUD form generates its fields from the column specs"
  - "Term/value search boxes filter client-side (case-insensitive substring) instead of a trigram RPC round-trip — reference data is small; the trigram index still backs live search"
  - "Inactive-add rejections reuse existing error variants (invalid_combo for fitment, invalid for condition/category/term) — no listing-form changes needed"
  - "model_configurations join management is flagged in the config (special: configurations) but has no dedicated editor in v1 — applicability stays seed/CSV-managed"
metrics:
  duration: ~22 min
  tasks: 3
  files: 15
  completed: 2026-06-11
---

# Phase 10 Plan 05: Fitment Library Management Summary

**One-liner:** Config-driven CRUD over all 8 taxonomy levels plus a dedicated slang (search_terms → exclusive-arc targets) editor, with is_active lifecycle semantics enforced end-to-end — pickers and suggestions hide deactivated values, server actions block newly-added inactive ids, and existing listings are never disturbed.

## What was built

### Task 1 — Level config map + generic taxonomy actions (eca1e40)
- `lib/admin/taxonomy-config.ts`: `TAXONOMY_LEVELS` keyed by URL slug (makes, models, configurations, terms, part_categories, materials, conditions, special_filters) with table name, labels, editable columns, parent FK spec (models→make_id required; part_categories→parent_id optional), and special flags (terms→slang editor, configurations→join note).
- `lib/actions/admin/taxonomy.ts`: every action runs requireAdmin() → zod → service-role write → logAdminAction(). Inserts/updates are built ONLY from the config column whitelist (raw input never spread). `deleteValue` catches Postgres 23503 and returns "In use by existing data — deactivate instead."; `setActive` flips is_active and nothing else. Slang: `createSlangTerm` (term + initial targets), `updateSlangTerm`, `setSlangTargets` (wholesale replace of search_term_targets rows matching the 0003 make/model/config exclusive arc).

### Task 2 — Fitment Library pages (07e8a72)
- `/admin/fitment`: 8-level card grid with live row counts (service-role head counts), force-dynamic.
- `/admin/fitment/[level]`: slug validated against the config map (404 otherwise); lists ALL values including inactive (badged + dimmed); `taxonomy-crud.tsx` renders the RHF+zod dialog form generated from the column list, native parent selector, Deactivate/Reactivate toggle, and FK-guarded Delete with confirm. part_categories renders as an indented tree; the 10-02 sidebar "Categories" link lands on this same generic page.
- `slang-editor.tsx`: top-of-page add-term flow (type term → map target → Create = ≤3 clicks), per-term target chips with remove, inline add-target picker, rename dialog, deactivate/delete riding the generic actions.

### Task 3 — is_active filtering, pickers only (e3754d9)
- Filtered: `getModels`/`getConfigs` (garage cascade), `getConditions`/`getPartCategories` (listing cascade), the three inline makes readers (sell, sell-edit, garage pages), and `suggestFitment` rule expansion (inactive implied models/configs/terms/filters/categories are skipped).
- NOT filtered (locked decision): `search_listings` RPC, synonym expansion, listing display, public profile/feed — deactivated values on existing listings stay visible and searchable.
- Trust boundary: `createListing` rejects any inactive model/config/condition/category/term; `updateListing` first reads the listing's current fitment/category/term/condition rows and validates only newly-added ids — an edit that merely retains an inactive value still saves.
- `tests/unit/picker-active-filter.test.ts` asserts all four picker helpers apply `.eq("is_active", true)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Lifecycle unit-test mock incompatible with the new edit-diff reads**
- **Found during:** Task 3 (`npm test`)
- **Issue:** `listing-lifecycle-actions.test.ts` mocked `.select()` as the awaitable terminal; updateListing now composes `.select().eq()…` and `.select().in().eq()` reads, so the chain broke.
- **Fix:** mock chain made thenable (PostgREST-builder semantics) with `.select`/`.in` chainable; all 15 lifecycle tests pass unchanged in intent.
- **Files modified:** tests/unit/listing-lifecycle-actions.test.ts
- **Commit:** e3754d9

### Minor scope notes
- Slang/value search boxes are client-side substring filters rather than server trigram round-trips (documented decision; reference data is small).
- `npm run build` for Task 2 had to wait on another wave-2 executor's build lock (parallel execution); retried and passed.

## Deferred Issues
- `tests/integration/search.test.ts` FTS GIN gate failure is pre-existing (introduced by 10-01's 0019 listings RLS policy) and already logged in `deferred-items.md` under [10-04] — observed again during this plan's full test run; not touched (out of scope).

## Verification
- `npm run typecheck` clean after each task; `npm run build` green (all /admin/fitment routes compiled).
- Unit suite: 25/25 across the three affected files; full suite 291 passed / 1 pre-existing deferred integration failure / 1 skipped.

## Self-Check: PASSED
