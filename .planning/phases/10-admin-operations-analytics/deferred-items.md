# Deferred Items — Phase 10

Out-of-scope discoveries logged by plan executors. Not fixed inline (scope
boundary); resolve at phase verification or in a dedicated follow-up.

## [10-04] FTS GIN gate broken by the 0019 listings RLS policy (Pitfall 3 regression)

- **Found during:** 10-04 Task 3 (`npx vitest run tests/integration`).
- **Failing test:** `tests/integration/search.test.ts` → "FTS path uses listings_search_vector_idx, never Seq Scan on listings".
- **Symptom:** `explain_search_plan('bumper')` as anon now returns `Seq Scan on listings` even with `enable_seqscan=off` (cost=1e10 — no index path was ever generated).
- **Root cause:** migration 0019 (plan 10-01) replaced the `listings public-read` policy `using (true)` with `(hidden_at is null and status <> 'draft') or seller_id = (select auth.uid())`. With a non-trivial RLS qual in place, PostgreSQL refuses to push the user's NON-LEAKPROOF `search_vector @@ tsquery` predicate below the security qual, so the GIN index on `search_vector` becomes unusable for anon reads — this affects the EXPLAIN gate AND the live `search_listings` RPC (security invoker), i.e. anon keyword search is now a filtered Seq Scan.
- **Why not fixed in 10-04:** pre-existing (introduced by 10-01, applied to Staging before this plan ran); the fix touches the Phase-7 search architecture (e.g. making `search_listings` SECURITY DEFINER with the visibility predicate baked into its body — mirroring the 0020 `active_listing_count` fix — or a leakproof-compatible policy design). That is an architectural decision beyond ADMO-02's scope.
- **Suggested fix direction:** convert `search_listings` (and the EXPLAIN gate) to security definer with explicit `hidden_at is null and status = 'active'` predicates in the body (the same pattern 0020 used for `active_listing_count`), keeping RLS as the boundary for direct table reads. Harmless at launch volume; must land before search-scale matters.

## [10-06] Duplicate migration prefix: two 0020_* files

- **Found during:** 10-06 final docs commit (parallel lint-staged sweep pulled 10-04's in-flight files in).
- **Files:** `supabase/migrations/0020_analytics_helpers.sql` (10-06) and `supabase/migrations/0020_active_listing_count_hidden.sql` (10-04).
- **Impact:** none today — both were applied manually via `npx supabase db query --linked -f` and remote migration history only records 0001-0003 (db push already unusable). But duplicate version prefixes will break `supabase migration list`/`db push` if history repair is ever attempted.
- **Suggested fix:** rename one to `0021_*` (file rename only — both are already applied to Staging) during phase verification, when no parallel executors are running.

## [10-06] Cross-attributed commits in wave 2 (known lint-staged race)

- 10-06's Task-2 files landed inside 10-07's commit 553dec5; 10-04's `0020_active_listing_count_hidden.sql` + `tests/integration/admin-moderation.test.ts` landed inside 10-06's docs commit 477cc0d. Content verified correct on disk in all cases (memory note: verify by file-on-disk, not commit message). No action needed beyond awareness when reading history.
