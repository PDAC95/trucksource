---
phase: 10-admin-operations-analytics
plan: 01
subsystem: database
tags: [postgres, rls, supabase, security-definer, app_metadata, moderation, audit-log]

# Dependency graph
requires:
  - phase: 09-contact-private-chat
    provides: messages/message_threads/reports schema + 0018 participant-insert policy body (thread_pair_blocked)
  - phase: 05-listings-photos-exif-safe-storage
    provides: listings table + 0006 public-read policy + listing_view_events stream
  - phase: 03-fitment-taxonomy-slang-library
    provides: the 8 taxonomy tables receiving is_active
provides:
  - migration 0019 applied on Staging — user_restrictions, admin_audit_log, report queue columns, listing moderation (draft + hidden_at/hidden_reason + replaced public-read policy), thread freeze, messages INSERT restriction/freeze arms, taxonomy is_active, analytics indexes, admin_user_activity_stats RPC
  - scripts/grant-admin.mjs + npm run grant:admin (app_metadata.role = 'admin' flag, --revoke supported)
  - pdmckinster@gmail.com flagged as admin on Staging
affects: [10-02, 10-03, 10-04, 10-05, 10-06, 10-07, 10-08, 10-09, 10-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy suspension expiry: restricted = banned OR (suspended AND suspended_until > now()) — never cron-flipped"
    - "Audit table = RLS enabled with ZERO policies (default-deny both directions, service-role only)"
    - "Restriction check in policy is a plain subquery (caller sees own user_restrictions row via self-select — unlike the 0018 user_blocks visibility bug)"
    - "Admin identity = app_metadata.role in the verified JWT, set only via service-role script"

key-files:
  created:
    - supabase/migrations/0019_admin_operations.sql
    - scripts/grant-admin.mjs
  modified:
    - package.json

key-decisions:
  - "Applied 0019 via `npx supabase db query --linked -f` (db push unsafe: remote migration history only records 0001-0003 — 09-04 precedent)"
  - "Restriction + freeze arms added ONLY to the messages INSERT policy; SELECT policy untouched (WALRUS realtime hot path, Pitfall 4)"
  - "admin_user_activity_stats: execute revoked from public/anon/authenticated; only service_role retains it"

patterns-established:
  - "Listing visibility boundary is the listings public-read RLS policy: (hidden_at is null and status <> 'draft') or seller_id = auth.uid()"
  - "hidden_reason ('moderation'|'suspension'|'ban') decides what reactivation restores — only suspension-hidden rows"

requirements-completed: [ADMO-01, ADMO-02, ADMO-03, ADMO-04, ADMO-05, ADMO-06]

# Metrics
duration: ~14min
completed: 2026-06-11
---

# Phase 10 Plan 01: Admin Operations Schema Summary

**Migration 0019 lands the entire Phase-10 structural layer on Staging — suspension/ban state, default-deny audit log, report queue, RLS-enforced listing hiding + drafts, thread freeze, taxonomy is_active, analytics indexes, and the definer MAU RPC — plus grant-admin.mjs flagging admins via JWT app_metadata.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-06-11T17:23:53Z
- **Completed:** 2026-06-11T17:38:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- `supabase/migrations/0019_admin_operations.sql` (9 sections, requirement IDs annotated) applied cleanly to Staging via `npx supabase db query --linked -f`.
- Structural enforcement verified live with 15/15 behavioral checks against Staging (throwaway confirmed user + anon + service-role clients):
  - `user_restrictions`: service-role insert OK, anon read = 0 rows, owner reads own row, anon insert denied.
  - `admin_audit_log`: authenticated read = 0 rows, authenticated insert denied (zero policies, default-deny both directions).
  - Listings: anon cannot see a draft listing, owner sees own draft, anon cannot see a hidden active listing, anon sees it again after un-hide.
  - `admin_user_activity_stats()`: anon AND authenticated get permission denied; service role returns `{registered: 3, active_30d: 3}`.
- Messages INSERT policy recreated with the full 0018 body (sender self-attribution, participant EXISTS, `thread_pair_blocked`) plus the two new arms (not restricted, thread not frozen) — confirmed in `pg_policies.with_check`. SELECT policy untouched.
- `scripts/grant-admin.mjs` + `npm run grant:admin`: flagged `pdmckinster@gmail.com` (1ceb627b-…) — `raw_app_meta_data->>'role' = 'admin'` verified by direct query; re-login note printed; `--revoke` flag included.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author migration 0019_admin_operations.sql** - `6796ef4` (feat)
2. **Task 2: Apply migration to Staging and verify structural enforcement** - no file change (apply + live verification only; 03-01 Task-3 precedent)
3. **Task 3: grant-admin.mjs script** - `5894615` (feat)

## Files Created/Modified

- `supabase/migrations/0019_admin_operations.sql` - all Phase-10 enforcement/audit/analytics schema in one reviewable boundary
- `scripts/grant-admin.mjs` - service-role admin flag script (app_metadata.role), email lookup via `auth.admin.listUsers`, `--revoke` support
- `package.json` - `grant:admin` npm script

## Decisions Made

- **Apply path:** `npx supabase db query --linked -f` (Management API), NOT `db push` — remote migration history only records 0001-0003, so push would re-apply already-applied migrations (09-04 SUMMARY precedent).
- **Restriction arm uses a plain subquery** on `user_restrictions` inside the INSERT policy: correct because the caller can see their OWN restriction row through the self-select policy — the 0018 `user_blocks` visibility bug does not apply here (the bug arose when the relevant row belonged to the *other* party).
- **Freeze arm implemented as the plan's literal separate EXISTS (`t2.frozen_at is null`)** to match the documented key_link pattern; both new arms are PK index hits.

## Deviations from Plan

None - plan executed exactly as written.

(Noted, not a deviation: an uncommitted `.github/workflows/ci.yml` edit — the service-role-key bundle grep gate — appeared in the working tree during execution. It belongs to a parallel wave-1 plan and was deliberately left unstaged; this plan committed only its own files.)

## Issues Encountered

None. The only judgment call was the apply mechanism (resolved from 09-04's recorded lesson before touching the DB).

## User Setup Required

None - no external service configuration required. Reminder embedded in the script output: the flagged admin must sign out/in before the `role` claim appears in their JWT (Pitfall 1).

## Next Phase Readiness

- Every Phase-10 plan now has its structural substrate: enforcement state (10-02 requireAdmin gate reads the JWT claim set here), listing moderation columns + RLS boundary, report queue columns, thread freeze, taxonomy is_active, analytics indexes + MAU RPC.
- `pdmckinster@gmail.com` is the live admin account for console UAT (must re-login to pick up the claim).
- Restated for downstream plans: never add arms to the messages SELECT policy; "currently restricted" is always the lazy predicate, never a flag.

## Self-Check: PASSED

- supabase/migrations/0019_admin_operations.sql — FOUND
- scripts/grant-admin.mjs — FOUND
- Commit 6796ef4 — FOUND
- Commit 5894615 — FOUND

---
*Phase: 10-admin-operations-analytics*
*Completed: 2026-06-11*
