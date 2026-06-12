---
phase: 08-social-layer
plan: 01
subsystem: database
tags: [supabase, rls, postgres, comments, saves, audit-trigger, security-definer]
requires:
  - phase: 05-listings-photos-exif
    provides: listings table (public-read, owner-write, status CHECK)
  - phase: 05.1-stakeholder-lifecycle
    provides: listings.status 'expired' + expires_at (the ACTIVE-only insert arm)
provides:
  - listing_comments table (public-read; self-attribution + ACTIVE-only + depth-1 enforced in INSERT RLS; author-or-seller delete; NO update policy)
  - saved_listings table (owner-only select/insert/delete, zero anon policy)
  - comment_deletion_log table (RLS on, zero policies = default-deny; service-role read in Phase 10)
  - listing_comments_audit BEFORE DELETE definer trigger (audits parents AND FK-cascaded replies)
  - my_listing_save_counts() definer RPC (seller-scoped counts, anon revoked)
  - listings.comments_seen_at watermark column
  - TEST-ONLY authenticated-fixture harness in tests/integration/_supabase.ts (createTestUser/deleteTestUser/serviceClient)
  - COMMENT_SELECT_COLUMNS / COMMENT_AUTHOR_COLUMNS / SAVED_LISTING_COLUMNS contract constants (08-02 readers mirror these)
affects: [08-02, 08-03, 08-04, 10-admin-ops]
tech-stack:
  added: []
  patterns:
    - "Structural RLS rules: depth-1 + sold-closed + self-attribution live in the INSERT policy, not app code"
    - "Default-deny audit table written only by a SECURITY DEFINER row trigger (cascade-aware)"
    - "NEW-row columns inside policy subqueries MUST be table-qualified (listing_comments.parent_id)"
key-files:
  created:
    - supabase/migrations/0015_social.sql
    - tests/integration/social.test.ts
    - tests/integration/social.contract.test.ts
  modified:
    - tests/integration/_supabase.ts
    - vitest.config.mts
decisions:
  - "Authenticated RLS gates use service-role-created CONFIRMED user fixtures (Staging email-confirm is ON); gates themselves always assert via anon/authenticated clients"
  - "SUPABASE_SERVICE_ROLE_KEY surfaced into the vitest env (TEST-ONLY; app-side service-role usage stays in lib/supabase/admin.ts per invariant #3)"
  - "Audit-row verification (2 rows, deleted_by = deleter) done via the service client since the log is default-deny for all client roles"
metrics:
  duration: ~12 min
  completed: 2026-06-10
---

# Phase 8 Plan 01: Social Layer Schema Root Summary

**One-liner:** Migration 0015 lands comments/saves/deletion-audit with all three structural comment rules (self-attribution, comments-closed-when-sold, depth-1) enforced in INSERT RLS and proven by 10 live gates plus a zero-PII read-shape contract.

## What Was Built

- **`supabase/migrations/0015_social.sql`** (applied + verified live on Staging):
  - `listing_comments` — public-read (anon+authenticated); INSERT policy enforces `(select auth.uid()) = author_id`, listing ACTIVE+unexpired (Pitfall 2), and depth-1 same-listing parent (Pitfall 3); delete = author OR listing seller; **no UPDATE policy** (locked: no editing).
  - `saved_listings` — composite PK `(user_id, listing_id)`, owner-only on every operation, no anon policy of any kind.
  - `comment_deletion_log` — RLS on with **zero policies** (default-deny, mirrors `listing_view_events`); written only by `log_comment_deletion()` (plpgsql, `security definer`, `search_path = ''`) via the `listing_comments_audit` BEFORE DELETE row trigger — row triggers fire per FK-cascaded reply, so replies are audited with the same `deleted_by`.
  - `my_listing_save_counts()` — sql stable security definer, hard-scoped to `l.seller_id = (select auth.uid())`, revoked from public/anon, granted to authenticated (0008 hygiene).
  - `listings.comments_seen_at` — nullable watermark, additive, no new RLS policy.
- **`tests/integration/social.test.ts`** — 10 live RLS gates vs Staging: public-read, anon-write-denied, self-attribution, sold-closed, depth-1 (reply OK, reply-to-reply rejected), no-update-path (0 rows + body unchanged), owner-only saves (anon 0 rows, cross-user read 0 rows, cross-user insert rejected), audit default-deny (anon + authed), cascade-audited delete (parent delete removes the reply AND writes 2 audit rows with `deleted_by` = the deleter), RPC hygiene (anon rejected; seller sees count 1 only for own listing; non-seller gets empty).
- **`tests/integration/social.contract.test.ts`** — zero-PII contract for the exact page read shapes; exports `COMMENT_SELECT_COLUMNS`, `COMMENT_AUTHOR_COLUMNS`, `SAVED_LISTING_COLUMNS` for 08-02; re-asserts `profiles_private` anon-deny on this surface.
- **Harness extension** (`_supabase.ts` + `vitest.config.mts`): TEST-ONLY `serviceClient()` + `createTestUser()`/`deleteTestUser()` confirmed-user fixtures, gated by `SERVICE_INTEGRATION_ENABLED` (suite self-skips without the key).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Depth-1 policy subquery bound NEW-row columns to the subquery table**
- **Found during:** Task 2 (gate 5 failed — every legitimate depth-1 reply was RLS-rejected)
- **Issue:** In the research SQL, the depth-1 EXISTS used unqualified `parent_id`/`listing_id`; inside `from public.listing_comments p` those resolve to `p.*` (innermost scope wins), so the check became `p.id = p.parent_id and p.parent_id is null` — never true.
- **Fix:** Qualified the NEW row's columns as `listing_comments.parent_id` / `listing_comments.listing_id`; policy dropped + recreated live on Staging; migration file corrected with an explanatory comment.
- **Files modified:** supabase/migrations/0015_social.sql
- **Commit:** cafdde1

**2. [Rule 3 - Blocking] No authenticated test harness existed**
- **Found during:** Task 2
- **Issue:** The plan's gates require real signed-in users, but every existing integration test is anon-only and Staging has email-confirm ON (signUp users cannot password-sign-in), so the self-attribution/depth-1/sold-closed/saves/audit gates were unprovable.
- **Fix:** Added TEST-ONLY service-role fixture helpers to `_supabase.ts` (admin-created confirmed users, signed-in anon-key clients, teardown) and surfaced `SUPABASE_SERVICE_ROLE_KEY` into the vitest env. Gates still assert exclusively through anon/authenticated clients; the service client is fixtures + default-deny audit verification only.
- **Files modified:** tests/integration/_supabase.ts, vitest.config.mts
- **Commit:** 887ca94

## Verification

- Staging live state: 3 tables `relrowsecurity = true`; 6 policies total with **zero** on `comment_deletion_log`; `listing_comments_audit` trigger present; both functions `prosecdef = true`; `comments_seen_at` present.
- `npx vitest run tests/integration/social.test.ts` — 10/10 passed live.
- `npx vitest run tests/integration/social.contract.test.ts` — 4/4 passed live.
- Full suite: 33 files, 191 passed / 1 skipped — no regression. `npx tsc --noEmit` clean.
- Grep gate: 3× `enable row level security`, 2× `set search_path = ''` in 0015.

## Commits

| Commit | Type | Description |
| ------ | ---- | ----------- |
| 00592d0 | feat | migration 0015 (comments, saves, deletion audit) |
| cafdde1 | fix | qualify NEW-row columns in depth-1 insert policy |
| 887ca94 | test | 10 live RLS gates + authenticated fixture harness |
| ff404e6 | test | zero-PII read-shape contract + exported column constants |

## Notes for Downstream Plans

- 08-02 readers must import/mirror `COMMENT_SELECT_COLUMNS` / `COMMENT_AUTHOR_COLUMNS` / `SAVED_LISTING_COLUMNS` from `tests/integration/social.contract.test.ts`.
- The no-UPDATE posture means "edit comment" must never be added without a migration + explicit decision.
- `comment_deletion_log` reads are Phase-10/service-role territory; clients see 0 rows by design.

## Self-Check: PASSED

- supabase/migrations/0015_social.sql — FOUND
- tests/integration/social.test.ts — FOUND
- tests/integration/social.contract.test.ts — FOUND
- Commits 00592d0, cafdde1, 887ca94, ff404e6 — FOUND
