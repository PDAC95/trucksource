---
phase: 16-part-taxonomy-guided-cascade
plan: 01
subsystem: database
tags: [postgres, supabase, recursive-cte, taxonomy, search, rls, vitest]

# Dependency graph
requires:
  - phase: 03-fitment-taxonomy
    provides: part_categories self-referencing adjacency tree + listing_categories join
  - phase: 07-search-feed-public-profile
    provides: search_listings RPC (signature frozen) + lib/search/queries.ts reader
  - phase: 10-admin-ops-analytics
    provides: 0024 search_listings (slang target expansion) — the body cloned here
provides:
  - "3-level part taxonomy seeded (18 roots + full Fuel Tanks subtree: 14 subcats + ~100 items)"
  - "Recursive-CTE subtree match on search_listings part-category facet (ancestor selection matches all descendants)"
  - "Old 12-root flat tree deactivated (not deleted) + listings re-tagged onto a valid new leaf"
  - "Migration 0025 applied to Staging; migration history repaired (0004-0024 marked applied)"
  - "search.subtree integration gate (ancestor result-set ⊇ leaf result-set)"
affects: [16-02, 16-03, 16-04, guided-cascade, browse-filters, getChildCategories]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recursive WITH RECURSIVE subtree CTE inside a security-definer SQL function (search_path = '')"
    - "Coupled migration: body-only RPC rewrite + idempotent re-seed + forward-migrate, one atomic file"
    - "Keep-on-collision: deactivate old row in Section C, explicit reactivate in Section B so on-conflict-do-nothing doesn't swallow a kept name (Pitfall 5)"

key-files:
  created:
    - supabase/migrations/0025_part_taxonomy_v2.sql
    - tests/integration/search.subtree.test.ts
  modified:
    - supabase/seed.sql

key-decisions:
  - "Root set = the 18 unique roots from 16-CONTEXT.md, as-listed (Task 0 checkpoint resolved: context-18)"
  - "'Lighting' kept as a root despite name collision with the old flat tree: deactivate-then-reactivate (Pitfall 5)"
  - "search_listings signature + return columns byte-identical to 0024; only the part-category facet arm body changed"
  - "Staging forward-migrated via db push (NOT reset): old tree deactivated, listings re-tagged onto 'Driver Side Fuel Tanks'"
  - "Repaired remote migration history (0004-0024 marked applied) to unblock the 0025 push — pre-existing desync"

patterns-established:
  - "Subtree facet: p_category_id expands to {self + descendants} via recursive CTE, join subtree on listing_categories"
  - "Idempotent taxonomy seed: roots via guarded where-not-exists (NULL parent_id), children/items via on conflict (parent_id,name) do nothing"

requirements-completed: [FITL-05, SRCH-03, FINT-03]

# Metrics
duration: ~8min
completed: 2026-06-18
---

# Phase 16 Plan 01: Part Taxonomy v2 + Subtree Search Summary

**Recursive-CTE subtree match on the search_listings part-category facet, plus an idempotent re-seed of the 18 confirmed root categories and the full Fuel Tanks subtree — shipped in one atomic migration (0025), applied to Staging, with the old flat tree deactivated and listings re-tagged.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-18T14:31:29Z
- **Completed:** 2026-06-18T14:39:06Z
- **Tasks:** 2 auto (Task 0 decision gate resolved before this continuation)
- **Files modified:** 3 (1 migration created, 1 test created, seed.sql edited)

## Accomplishments
- **Subtree search (SRCH-03 / FINT-03):** rewrote ONLY the part-category facet arm of `search_listings` to expand `p_category_id` to itself + all descendants via `with recursive subtree`, matching listings tagged at any node. Signature, return columns, and `security definer set search_path = ''` posture are byte-identical to 0024 (verified by diff — the contract gate stays green).
- **Taxonomy re-seed (FITL-05):** seeded the 18 confirmed roots + the full "Fuel Tanks, Straps & Accessories" subtree (14 subcategories, ~100 items) idempotently; deactivated the old 12-root flat tree (11 roots — Lighting kept) + their children; re-tagged listings on deactivated leaves onto a valid new leaf and dropped the stale join rows.
- **Lighting collision handled (Pitfall 5):** Section C deactivates the old "Lighting" root, then Section B's explicit `update ... set is_active = true, parent_id = null where name = 'Lighting'` runs after and wins — verified on Staging (Lighting is id=1, active, root).
- **Applied to Staging:** migration history desync (remote `schema_migrations` only had 0001-0003 while objects 0004-0024 existed) was repaired, then 0025 pushed cleanly. Subtree + contract integration gates re-run live against Staging: 3/3 pass.
- **seed.sql fixed:** old flat-tree block replaced with the new tree so a fresh `db reset` yields exactly one taxonomy.

## Task Commits

1. **Task 1: migration 0025 — subtree-match RPC + idempotent re-seed + forward-migrate** - `7340b74` (feat)
2. **Task 2: replace seed.sql category block + subtree integration test** - `71c04c7` (feat)

## Files Created/Modified
- `supabase/migrations/0025_part_taxonomy_v2.sql` - Section A subtree-CTE RPC (signature frozen), B seed (18 roots + Fuel Tanks subtree + Lighting reactivate), C deactivate old tree, D re-tag + cleanup
- `supabase/seed.sql` - L5 part_categories block replaced with the new 3-level tree (old 12-root flat tree removed)
- `tests/integration/search.subtree.test.ts` - asserts ancestor (root/subcategory) result set ⊇ leaf result set against Staging; self-skips without env

## Decisions Made
- **Root set = context-18** (Task 0 checkpoint resolution): the 18 unique roots from 16-CONTEXT.md, as-listed.
- **Lighting kept as a root** via deactivate-then-reactivate (Pitfall 5 fix).
- **Staging forward-migrated, not reset.** Old tree deactivated; affected listings re-tagged onto `Driver Side Fuel Tanks` (no FK violation, no orphan tags — verified 0 stale tags).
- **New leaf chosen for re-tagging:** `Driver Side Fuel Tanks` (under Fuel Tanks → Fuel Tanks, Straps & Accessories).

## Exported Staging IDs (for Plans 03/04 chip-label + cascade testing)
> NOTE: these ids are Staging-specific. A fresh local `db reset` assigns different ids — resolve by NAME in code/tests, not by literal id.

- **Fuel Tanks, Straps & Accessories** (root): `91`
- **Fuel Tanks** (subcategory under 91): `96`
- **Driver Side Fuel Tanks** (leaf under 96, the re-tag target): `111`
- **Lighting** (kept root, original row): `1`
- Active roots on Staging: **18**; total categories: **172** (active **128**, the rest are the deactivated old flat tree).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Repaired remote migration history to land 0025 on Staging**
- **Found during:** Post-Task-2 deployment of 0025 to Staging
- **Issue:** `supabase db push` failed with `relation "garage_trucks" already exists` (0004). Remote `supabase_migrations.schema_migrations` only recorded 0001-0003, although every object through 0024 already exists on Staging (the app runs there; the contract test passes live). A pre-existing history desync (predates Phase 16) blocked pushing 0025.
- **Fix:** `supabase migration repair --status applied 0004 … 0024` (marks the already-applied migrations as recorded WITHOUT re-running their SQL), then `supabase db push` applied ONLY 0025.
- **Files modified:** none (remote history table only)
- **Verification:** `db push` applied 0025; subtree + contract gates re-run live against Staging — 3/3 pass; queried Staging shows 18 active roots, Lighting kept, 11 old roots deactivated, 0 stale listing tags.
- **Committed in:** n/a (no repo files changed; remote-state operation)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to satisfy the plan's success criterion "staging test-seller listings re-tagged onto a valid new leaf" — without the repair the new tree never reaches Staging. No scope creep; no app/migration file changed by the fix.

## Issues Encountered
- IDE inline SQL diagnostics flagged `insert ... select` / `on conflict` as "Incorrect syntax" in seed.sql — false positives from a T-SQL (SQL Server) parser misreading valid Postgres. No action; the file matches the rest of seed.sql and applies cleanly.

## User Setup Required
None - no external service configuration required. (Staging already migrated; a future Production project will get 0025 via the same `db push` path.)

## Next Phase Readiness
- The tree exists and the RPC expands subtrees — the foundation Plans 02/03/04 depend on is in place.
- `getChildCategories(parentId)` reader (Plan 02) can build directly on `part_categories` (public-read, `is_active` filter excludes the old flat tree).
- Guided cascade (welcome + /browse) and chip labels (Plans 03/04) can resolve categories by name and rely on ancestor selection returning the full subtree.
- No blockers. Year remains out of scope (separate later phase).

## Self-Check: PASSED

- FOUND: supabase/migrations/0025_part_taxonomy_v2.sql
- FOUND: tests/integration/search.subtree.test.ts
- FOUND: supabase/seed.sql
- FOUND: .planning/phases/16-part-taxonomy-guided-cascade/16-01-SUMMARY.md
- FOUND commit: 7340b74 (Task 1)
- FOUND commit: 71c04c7 (Task 2)

---
*Phase: 16-part-taxonomy-guided-cascade*
*Completed: 2026-06-18*
