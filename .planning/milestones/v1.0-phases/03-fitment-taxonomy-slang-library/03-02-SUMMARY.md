---
phase: 03-fitment-taxonomy-slang-library
plan: 02
subsystem: database
tags: [supabase, postgres, seed-data, fitment-taxonomy, slang-dictionary, idempotent-seed, anon-rls]

# Dependency graph
requires:
  - phase: 03-fitment-taxonomy-slang-library
    provides: "0003_fitment_taxonomy.sql — the 10 reference tables + unique constraints/indexes the seed's `on conflict` targets need"
provides:
  - "supabase/seed.sql — the user-reviewed LAUNCH DATASET: Peterbilt+Kenworth makes, 17 iconic models, 9 shared configurations + 44 model_configurations applicability rows, 45-node 2-level part_categories tree, and bounded materials/conditions/special_filters (8 each)"
  - "32-term curated trucker-slang dictionary with 40 arc-resolution rows — EVERY term resolves to ≥1 seeded make/model/config (0 dangling), closed by a do-block integrity assertion that raises if any term dangles"
  - "Reviewed seed applied to Staging idempotently (non-destructive) and confirmed anon-readable across all 10 reference tables"
  - "listing-fitment-join-spec.md — locked Phase-5 design: 7 listing_* join tables + is_barnyard boolean (FITL-09, FITL-10)"
affects: [03-03-tests, 05-listings-photos-exif, 06-fitment-intelligence, 07-search-feed-public-profile]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent natural-key seed: every FK resolved via `join public.<parent> on name=` inside the insert (never a literal generated id), `on conflict (<unique constraint>) do nothing` on every statement"
    - "NULL-parent top-level seeding via guarded `where not exists` (NULLs aren't equal in a unique index, so on-conflict can't dedupe them)"
    - "Seed-integrity do-block: counts search_terms with zero search_term_targets and `raise exception` — fails the seed fast on a dangling slang term"
    - "Remote seed apply via `supabase db query --linked -f` (Management API) — idempotent, non-destructive; NOT `db reset --linked`"

key-files:
  created:
    - supabase/seed.sql
    - .planning/phases/03-fitment-taxonomy-slang-library/listing-fitment-join-spec.md
  modified: []

key-decisions:
  - "Seed applied to Staging via `supabase db query --linked -f supabase/seed.sql` (runs the full multi-statement file incl. the do-block via the Management API), NOT `db reset --linked` which is destructive on the shared Staging DB"
  - "Verification is anon-client based (proves public readability, the product-relevant property), not service-role — all 10 tables return seeded rows under the anon key"
  - "User reviewed the AI-generated domain data (models/configs/slang correctness) and approved as-is with no corrections"

patterns-established:
  - "Natural-key idempotent seed (no literal ids) — re-runnable against any environment, the seed-portability standard for this project"
  - "Seed-integrity assertion as a required gate — a do-block that raises on a structural invariant (zero dangling slang terms) so a bad seed fails loudly instead of silently shipping unresolvable slang"

requirements-completed: [FITL-01, FITL-02, FITL-03, FITL-04, FITL-05, FITL-06, FITL-07, FITL-08, FITL-09, FITL-10]

# Metrics
duration: ~2min
completed: 2026-06-04
---

# Phase 3 Plan 02: Fitment Seed Dataset & Slang Dictionary Summary

**Idempotent natural-key seed of the Peterbilt+Kenworth launch taxonomy (17 models, 9 configs, 44 applicability links, 45-node category tree, L6–L8 dimensions) plus a 32-term trucker-slang dictionary where every term arc-resolves to a real entity — reviewed, applied to Staging non-destructively, and confirmed anon-readable across all 10 reference tables.**

## Performance

- **Duration:** ~2 min (Task-4 continuation; Tasks 1–3 authored in a prior session)
- **Started (continuation):** 2026-06-04T17:26:20Z
- **Completed:** 2026-06-04T17:28:57Z
- **Tasks:** 4 (Task 4 completed this session)
- **Files modified:** 2 (authored in Tasks 1–3)

## Accomplishments
- **Reviewed & approved launch dataset.** User reviewed the AI-generated domain data (models, configs, slang→entity mappings) and accepted it as-is — no corrections.
- **Applied to Staging idempotently and non-destructively.** Ran `supabase db query --linked -f supabase/seed.sql` (via the Management API), then re-ran it — both succeeded with no error and no integrity exception, proving idempotency.
- **Integrity assertion passed.** The closing `do $$` block (raises if any slang term has zero targets) ran without raising, so every one of the 32 terms resolves to ≥1 seeded entity.
- **Confirmed anon-readable across all 10 reference tables** via the anon Supabase client: makes=2, models=17, configurations=9, model_configurations=44, search_terms=32, search_term_targets=40, part_categories=45, materials=8, conditions=8, special_filters=8.
- **Independent dangling-term recheck via anon:** 0 dangling terms; the 5 doc-cited terms (359 Guys, Flat Glass Kenworth, Aerodyne, Large Car, Glider) all resolve.

## Task Commits

Each task was committed atomically:

1. **Task 1: Seed reference data — makes, models, shared configs, applicability, L5–L8** - `9a4fe4a` (feat)
2. **Task 2: Seed curated slang dictionary + arc targets + integrity assertion** - `73f3e92` (feat)
3. **Task 3: Lock Phase-5 listing↔fitment join + Barnyard spec (FITL-09, FITL-10)** - `2cf2694` (docs)
4. **Task 4: Apply reviewed seed to Staging — integrity passed, 10 tables anon-seeded** - `97a3803` (chore, `--allow-empty` verification record; seed.sql committed in Tasks 1–2)

**Plan metadata:** (final docs commit below)

## Files Created/Modified
- `supabase/seed.sql` - The idempotent, FK-by-natural-key launch dataset: makes → models → configurations → model_configurations → search_terms → search_term_targets, plus the flat part_categories tree and materials/conditions/special_filters, closed by a seed-integrity do-block.
- `.planning/phases/03-fitment-taxonomy-slang-library/listing-fitment-join-spec.md` - Locked Phase-5 spec: 7 `listing_*` join tables (composite PK, RLS owner-write) + the `is_barnyard` boolean design; documents that `listing_makes` is derived via `listing_models → models.make_id`.

## Decisions Made
- **Non-destructive remote apply.** `db reset --linked` would wipe Staging (a shared environment per the Staging-first infra decision), so the seed was applied with `supabase db query --linked -f`, which runs the full multi-statement file — including the `do $$` block — via the Management API. Re-running it is the idempotency proof.
- **Anon-client verification, not service-role.** The product-relevant property is that the taxonomy is publicly browsable, so verification used the anon key (matching 03-01's posture); all 10 tables returned rows and the integrity invariant (0 dangling terms) was independently re-checked.
- **Domain data approved as-is.** The AI-generated models/configs/slang were accepted without corrections at the human-verify checkpoint.

## Deviations from Plan

None - plan executed exactly as written. The plan's how-to-verify named two acceptable apply paths (`db push` if it carried the seed, or the SQL editor); since the CLI exposes `db query --linked -f` (which runs the whole seed file incl. the do-block via the Management API) this was the cleanest non-destructive idempotent path and matches the plan's explicit "do NOT use `db reset --linked`" constraint.

## Issues Encountered
- The pre-commit `lint-staged` hook reported "could not find any staged files" on the Task-4 commit. This is the known `*.sql`-glob gap (the hook doesn't match `.sql`, and Task 4 was an `--allow-empty` verification record with no staged source anyway). The commit succeeded — confirmed via `git rev-parse` (`97a3803`), per the project memo to verify by file/commit-on-disk rather than hook message.

## User Setup Required
None - no external service configuration required. (Staging Supabase project was already linked from Phase 1.)

## Next Phase Readiness
- The fitment library is now **populated and browsable on Staging** — 03-03 (tests) can assert against real seeded rows, and Phase 7 search has a real slang dictionary to query.
- The Phase-5 listing↔fitment join shapes + `is_barnyard` are locked in `listing-fitment-join-spec.md` for the Phase-5 planner to consume.
- The seed is re-runnable against the future Production project (natural-key, idempotent) — no portability work needed at launch.

## Self-Check: PASSED

- FOUND: supabase/seed.sql
- FOUND: .planning/phases/03-fitment-taxonomy-slang-library/listing-fitment-join-spec.md
- FOUND commit: 9a4fe4a (Task 1)
- FOUND commit: 73f3e92 (Task 2)
- FOUND commit: 2cf2694 (Task 3)
- FOUND commit: 97a3803 (Task 4)
- Staging: all 10 reference tables anon-readable with seeded rows; integrity do-block did not raise; 0 dangling slang terms.

---
*Phase: 03-fitment-taxonomy-slang-library*
*Completed: 2026-06-04*
