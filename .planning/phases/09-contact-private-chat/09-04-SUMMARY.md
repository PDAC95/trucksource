---
phase: 09-contact-private-chat
plan: 04
subsystem: testing
tags: [supabase, rls, vitest, integration-tests, privacy, messaging, realtime]
requires:
  - phase: 09-contact-private-chat
    plan: 01
    provides: 0016_messaging.sql schema (contact_log, message_threads, messages, user_blocks, reports)
provides:
  - "Live Staging RLS gate suite for the entire 0016 messaging surface (17 gates)"
  - "Zero-PII read-surface contract incl. the realtime full-row payload snapshot (MSG-06)"
  - "0017: service_role-only messages_realtime_published() introspection helper"
  - "0018: block-enforcement bug fix (thread_pair_blocked definer helper + recreated messages INSERT policy)"
affects:
  - 09-05 (contact form ships on a proven RLS surface)
  - 09-06 (thread view / realtime ships on a proven zero-PII payload)
  - 09-07 (inbox ships on proven participant-only reads)
tech-stack:
  added: []
  patterns:
    - "Definer-helper-in-policy: RLS policy subqueries run as the caller, so cross-user visibility checks (blocks) must go through SECURITY DEFINER functions"
    - "Realtime payload contract = select('*') snapshot, not a curated column list"
key-files:
  created:
    - tests/integration/messaging.test.ts
    - tests/integration/messaging.contract.test.ts
    - supabase/migrations/0017_realtime_guard.sql
    - supabase/migrations/0018_fix_block_enforcement.sql
  modified: []
key-decisions:
  - "pg_publication_tables is unreachable via PostgREST — added 0017 definer helper messages_realtime_published(), EXECUTE granted only to service_role"
  - "0016 block check was unenforceable (policy subquery ran as the blocked sender, who cannot see the blocker's user_blocks row under RLS) — fixed in 0018 with a thread-scoped definer helper; user_blocks visibility unchanged (blocked party never learns who blocked them)"
  - "Migrations applied to Staging via `supabase db query --linked -f` (the 03-02/04-01 non-destructive path) — `db push` is unsafe here because remote migration history only records 0001-0003"
duration: 10min
completed: 2026-06-11
---

# Phase 9 Plan 04: Messaging RLS Gate + Zero-PII Contract Summary

**One-liner:** 24 live Staging tests gate the 0016 messaging schema (participant-only access, append-only logs, block enforcement, exclusive-arc reports, realtime publication) and pin the realtime payload to exactly five PII-free columns — catching and fixing a real block-enforcement bypass (0018) in the process.

## What Was Built

### Task 1 — Live RLS gates (tests/integration/messaging.test.ts, 17 tests)

Clones the social.test.ts harness (anon + three confirmed authed fixtures; service role for fixtures/teardown only):

1. **contact_log** — buyer self-attributed insert OK; impersonated buyer_id rejected; buyer+seller SELECT, third/anon 0 rows; UPDATE/DELETE affect 0 rows for every client (immutable, MSG-04).
2. **message_threads** — buyer-only create (seller/third insert rejected); participant-only SELECT; participant watermark UPDATE works, third-user UPDATE 0 rows; no DELETE path.
3. **messages append-only** — self-attributed participant insert OK; sender spoofing rejected; non-participant INSERT rejected / SELECT 0 rows; UPDATE/DELETE 0 rows for buyer (sender), seller, third, anon; body verified unchanged.
4. **block enforcement** — blocker_id self-attribution enforced; blocked sender's INSERT RLS-rejected; both parties still read history; unblock restores sending.
5. **reports** — one-per-target dedupe (23505); exclusive arc rejects two targets (23514); non-participant cannot report a private message (participant can); anon insert denied; reporter UPDATE/DELETE 0 rows.
6. **realtime publication** — `messages_realtime_published()` returns true via service role; anon execution denied.

### Task 2 — Zero-PII contract (tests/integration/messaging.contract.test.ts, 7 tests)

Mirrors the EXACT selects in `lib/messaging/queries.ts` (exported column constants):

- Thread row (THREAD_COLUMNS), listing-card hydration, counterparty profiles_public attribution, message reader shape — all deep-asserted against the PII denylist.
- **Realtime payload snapshot:** `select('*')` on messages as a participant must be exactly `{id, thread_id, sender_id, body, created_at}` — a new column must consciously pass this test before it broadcasts (MSG-06).
- **Scoped contact_log exception documented:** the seller's initial-contact context legitimately carries buyer_name/buyer_email (form inputs, by design); third user and anon get 0 rows.
- Non-participant `select('*')` across threads/messages/contact_log returns 0 rows everywhere.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] pg_publication_tables unreachable via supabase-js**
- **Found during:** Task 1 (gate 6 design)
- **Issue:** The plan called for a service-role `select ... from pg_publication_tables`, but PostgREST cannot expose pg_catalog views — no raw SQL path exists from the test client.
- **Fix:** Migration `0017_realtime_guard.sql`: `messages_realtime_published()` SECURITY DEFINER boolean helper, EXECUTE revoked from public/anon/authenticated, granted only to service_role. Applied to Staging via `supabase db query --linked -f`.
- **Files modified:** supabase/migrations/0017_realtime_guard.sql
- **Commit:** c1a13b6

**2. [Rule 1 - Bug] Block enforcement was a no-op in the blocked direction**
- **Found during:** Task 1 (gate 4 failed live — the test caught exactly what it gates)
- **Issue:** The 0016 `messages participant-insert` policy checked `not exists (select 1 from user_blocks ...)` as a plain subquery. Policy subqueries run AS THE CALLING USER, and user_blocks' only SELECT policy is blocker-owned — so when the seller blocked the buyer, the buyer's policy evaluation could not see the block row and the blocked buyer kept sending.
- **Fix:** Migration `0018_fix_block_enforcement.sql`: `thread_pair_blocked(thread bigint)` SECURITY DEFINER helper (thread-id-scoped to minimize probing — callers cannot pass raw user uuids), and the INSERT policy recreated to use it. user_blocks row visibility is unchanged (blocked users never learn who blocked them). Applied to Staging; gate 4 green on re-run.
- **Files modified:** supabase/migrations/0018_fix_block_enforcement.sql
- **Commit:** c1a13b6

### Operational note (not a deviation)

`supabase db push` is unsafe on this project: remote migration history records only 0001-0003 (0004-0016 were applied via the Management API path), so push would re-apply existing migrations. Both new migrations were applied with `npx supabase db query --linked -f` (established 03-02/04-01 path) and verified live.

## Verification

- `npx vitest run tests/integration/messaging.test.ts tests/integration/messaging.contract.test.ts` — 24/24 green vs Staging.
- Full `npm run test` — 40 files, 285 passed, 1 skipped (no harness regressions).
- `messages_realtime_published()` verified `true` directly via `supabase db query` as well.

## Commits

- `c1a13b6` test(09-04): add live messaging RLS gate suite + fix block enforcement bypass
- `1881dfd` test(09-04): add zero-PII messaging read-surface contract test

## Self-Check: PASSED
