---
phase: 03-fitment-taxonomy-slang-library
plan: 03
subsystem: testing
tags: [vitest, integration-test, anon-rls, seed-integrity, fitment-taxonomy, regression-gate]

# Dependency graph
requires:
  - phase: 03-fitment-taxonomy-slang-library
    provides: "0003_fitment_taxonomy.sql (10 reference tables + RLS) and supabase/seed.sql (launch dataset) applied to Staging"
  - phase: 01-foundation-privacy-model
    provides: "tests/integration/_supabase.ts (anonClient + INTEGRATION_ENABLED self-skip), Vitest-against-Staging infra"
provides:
  - "tests/integration/fitment.test.ts — the CI-visible Phase-3 gate: 10-table anon-read + anon-write-deny, seed presence, and the gated every-slang-term-resolves assertion"
  - "Automated proof (8 tests) that the taxonomy is browsable, write-locked, seeded, and has zero dangling slang terms"
  - "Full-suite regression proof: Phase 3 added 10 tables without regressing the Phase 1-2 privacy/RLS gates (68 passed / 1 skipped across 13 files)"
affects: [06-fitment-intelligence, 07-search-feed-public-profile]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mirror the rls.test.ts gate shape for new reference tables: `INTEGRATION_ENABLED ? describe : describe.skip` self-skip + anonClient() worst-case caller, no new fixtures"
    - "Read-side seed-integrity double-check: compute the orphan-term set client-side from two anon SELECTs (search_terms vs search_term_targets) rather than trusting the seed's do-block alone"
    - "Resilient seed assertions: assert presence/non-emptiness + the locked doc-cited terms, never exact counts (seed breadth is user-tunable)"

key-files:
  created:
    - tests/integration/fitment.test.ts
  modified: []

key-decisions:
  - "Tasks 1 and 2 author one inseparable artifact (fitment.test.ts), so the test file was committed once (test(03-03)); Task 3 is a verification-only --allow-empty record, matching the 03-02 Task-4 precedent"
  - "Seed-integrity is proven at THREE layers now: the migration's num_nonnulls=1 CHECK (write-time), the seed.sql do-block (apply-time), and this read-side anon assertion (CI-time) — defense in depth on the gated deliverable"
  - "Assertions check presence + the 5 locked doc-cited terms, not counts, so the user-tunable seed breadth can grow without breaking the gate"

patterns-established:
  - "Every new public reference table added in later phases gets an anon-read + anon-write-deny pair in its integration gate, mirroring fitment.test.ts"

requirements-completed: [FITL-01, FITL-02, FITL-03, FITL-04, FITL-05, FITL-06, FITL-07, FITL-08]

# Metrics
duration: ~2min
completed: 2026-06-04
---

# Phase 3 Plan 03: Fitment Taxonomy Verification Gate Summary

**`tests/integration/fitment.test.ts` — an 8-test CI gate proving all 10 Phase-3 reference tables are anon-readable and anon-write-denied, the Peterbilt/Kenworth launch dataset is seeded (models, configs, applicability, L5–L8), and EVERY slang term resolves to a real entity (zero orphans, 5 doc-cited terms present); the full suite stays green (68 passed) so Phase 3 added the taxonomy without regressing the Phase 1–2 privacy/RLS gates.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-04T17:33:27Z
- **Completed:** 2026-06-04T17:35:24Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- **Anon read/write-deny gate (Task 1).** One `it` iterates all 10 tables [makes, models, configurations, model_configurations, search_terms, search_term_targets, part_categories, materials, conditions, special_filters] asserting anon SELECT returns `error===null` + an array; a second `it` asserts an anon INSERT into `makes` is rejected (no write policy → RLS blocks).
- **Seed-presence + the gated assertion (Task 2).** Makes include Peterbilt+Kenworth; models include W900+379; configurations include Aerodyne and the applicability join is non-empty; materials/conditions/special_filters non-empty; part_categories has both a top-level (parent_id null) and a child. **The gated deliverable:** the orphan-term set (search_terms with no matching search_term_targets row, computed client-side from two anon SELECTs) is EMPTY, and the 5 doc-cited terms (359 Guys, Flat Glass Kenworth, Aerodyne, Large Car, Glider) are all present. A read-side exclusive-arc check confirms exactly one of make/model/config per target row.
- **Full-suite regression (Task 3).** `npm test` → 13 files, 68 passed, 1 skipped. The new fitment gate plus the Phase 1-2 gates (rls, privacy.contract, public-profile.contract, badge) all pass with 10 new tables present — Phase 3 did not regress the privacy guarantee.
- **Conventions mirrored exactly:** `// @vitest-environment node`, the `INTEGRATION_ENABLED ? describe : describe.skip` self-skip, and `anonClient()` from `./_supabase` — zero new fixtures, no framework install. Prettier + ESLint clean.

## Task Commits

Each task was committed atomically:

1. **Task 1 + Task 2: Fitment RLS + seed-integrity test file** - `183fb10` (test) — the two authoring tasks produce one inseparable artifact (`fitment.test.ts`), committed once; all 8 tests pass live against Staging.
2. **Task 3: Full-suite regression record** - `8ccce74` (chore, `--allow-empty`) — verification-only; `npm test` green (68 passed / 1 skipped), no code change.

**Plan metadata:** (final docs commit below)

## Files Created/Modified
- `tests/integration/fitment.test.ts` - The Phase-3 CI gate: two describe blocks ("fitment reference tables: anon-readable, anon-write-denied" and "fitment seed integrity (gated deliverable)"), 8 `it`s, all green against Staging or self-skipping without env.

## Decisions Made
- **One commit for the test artifact.** Tasks 1 and 2 both write `fitment.test.ts`; the file is a single inseparable unit, so it was committed once under `test(03-03)`. Task 3 (a pure verification run) is recorded as an `--allow-empty` chore — matching the 03-02 Task-4 precedent for verification-only steps.
- **Triple-layered seed integrity.** Zero-dangling is now enforced at write time (`num_nonnulls=1` CHECK), apply time (the seed.sql do-block), and CI time (this read-side anon assertion) — the gated deliverable has defense in depth.
- **Count-agnostic assertions.** The gate checks presence + the 5 locked doc-cited terms, never exact row counts, so the user-tunable launch seed can grow (more makes/models/slang) without falsely failing the gate.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The pre-commit `lint-staged` hook reported "could not find any staged files" on the Task-3 `--allow-empty` commit — the known `*.sql`/empty-commit gap; the commit succeeded (`8ccce74`), verified via `git rev-parse` per the project memo to confirm by commit-on-disk rather than hook message. (Git also warns LF→CRLF on the new test file — cosmetic, Windows line-ending normalization.)

## User Setup Required
None - the tests run against the already-linked Staging project using the existing `.env.local` anon key; no new service configuration.

## Next Phase Readiness
- **Phase 3 is complete and CI-verified.** The fitment library (FITL-01..08) is browsable, write-locked, seeded, and proven to have zero dangling slang terms — the gated seed-integrity deliverable is automated and green.
- The `fitment.test.ts` anon-read + anon-write-deny pattern is the template every later phase reuses when it adds a public reference/join table (e.g. Phase 5's `listing_*` joins, Phase 7 search surfaces).
- Phase 6 (Fitment Intelligence) and Phase 7 (Search) can now build on a verified, non-orphaned slang dictionary.

## Self-Check: PASSED

- FOUND: tests/integration/fitment.test.ts
- FOUND commit: 183fb10 (Tasks 1+2 — test file)
- FOUND commit: 8ccce74 (Task 3 — full-suite green record)
- fitment.test.ts: 8/8 pass against Staging; full suite: 13 files / 68 passed, 1 skipped — no Phase 1-2 regression.

---
*Phase: 03-fitment-taxonomy-slang-library*
*Completed: 2026-06-04*
