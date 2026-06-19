---
phase: 17-seller-activation-transaction-trust-gates
plan: 02
subsystem: database
tags: [supabase, postgres, rls, security, migrations]

# Dependency graph
requires:
  - phase: 02-verified-seller-otp
    provides: is_verified_seller() SECURITY DEFINER function + profiles_private.phone_verified_at
  - phase: 05-listings
    provides: listings owner-insert RLS policy
  - phase: 09-contact-chat
    provides: contact_log buyer-insert RLS policy (contact persists before chat)
provides:
  - "RLS WITH CHECK backstop on listings owner-insert requiring is_verified_seller() — closes anon-key publish bypass"
  - "RLS WITH CHECK backstop on contact_log buyer-insert requiring phone_verified_at (phone-only EXISTS) — closes anon-key contact bypass"
affects: [17-01-server-action-gates, 17-07-e2e-trust-gates, future-charm-buyer-gates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Defense-in-depth: server action is primary gate, RLS WITH CHECK is the anon-key backstop"
    - "Gate the FIRST write of a multi-write flow (contact_log, not message_threads) to avoid orphan rows"

key-files:
  created:
    - supabase/migrations/0027_trust_gate_rls.sql
  modified: []

key-decisions:
  - "Gated contact_log (first write, invariant #5) not message_threads — avoids orphan contact_log rows from unverified buyers (Pitfall 1)"
  - "contact_log uses phone-only EXISTS, NOT is_verified_seller — buyers don't accept marketplace selling terms"
  - "Reused is_verified_seller() (SECURITY DEFINER, granted to authenticated) inside the listings WITH CHECK — callable, reads profiles_private past caller RLS"
  - "Exact existing policy names preserved verbatim: 'listings owner-insert' and 'contact buyer-insert' (the latter differs from the plan interface's guessed 'contact_log buyer-insert')"

patterns-established:
  - "RLS verification arm appended to owner-scope: (select auth.uid()) = owner AND <verification predicate>"

requirements-completed: [LIST-01, MSG-05, VERF-04]

# Metrics
duration: 3min
completed: 2026-06-19
---

# Phase 17 Plan 02: Trust-Gate RLS Backstops Summary

**RLS `WITH CHECK` defense-in-depth on the two transaction writes — listings owner-insert now requires `is_verified_seller()`, contact_log buyer-insert now requires `phone_verified_at` — closing the public anon-key bypass the server-action gate alone cannot.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-19T13:48:48Z
- **Completed:** 2026-06-19T13:51:15Z
- **Tasks:** 2
- **Files modified:** 1 (created)

## Accomplishments
- Authored forward-only migration `0027_trust_gate_rls.sql` that drops + recreates both insert policies, each preserving its owner-scope arm and adding a verification arm.
- `listings owner-insert` WITH CHECK = `(select auth.uid()) = seller_id AND public.is_verified_seller((select auth.uid()))`.
- `contact buyer-insert` WITH CHECK = `(select auth.uid()) = buyer_id AND exists(... profiles_private.phone_verified_at is not null)`.
- `message_threads` insert policy left untouched (Pitfall 1 — no orphan-log gating mistake).
- Pushed to Staging cleanly (no history desync); `supabase migration list` shows 0027 applied (Local + Remote).

## Task Commits

1. **Task 1 + Task 2: Author + push migration 0027** - `b969615` (feat)

Tasks 1 and 2 share a single artifact (the migration file), so they committed together after the Staging push succeeded.

**Plan metadata:** (this SUMMARY + STATE/ROADMAP) committed separately as docs.

## Files Created/Modified
- `supabase/migrations/0027_trust_gate_rls.sql` - RLS WITH CHECK backstops on listings + contact_log insert policies.

## Decisions Made
- Used the **exact existing policy names** read from the repo: `"listings owner-insert"` (0006) and `"contact buyer-insert"` (0016). The plan's `<interfaces>` block guessed `"contact_log buyer-insert"`; the real name is `"contact buyer-insert"`. Used the verbatim name as the plan instructed ("confirm exact name; do not invent names").
- `contact_log` gated with a **phone-only EXISTS**, not `is_verified_seller()` — buyers never accept marketplace selling terms, so requiring those terms would wrongly block legitimate buyers.
- Gated `contact_log` (the first write, invariant #5), not `message_threads`, to prevent orphan contact_log rows.

## Deviations from Plan
None - plan executed exactly as written. (The only nuance: the corrected policy name `"contact buyer-insert"` was used per the plan's own "confirm exact name verbatim" instruction — this is following the plan, not a deviation.)

## Issues Encountered
- The IDE emitted T-SQL (SQL Server) syntax errors on the `create policy ... for insert to authenticated with check (...)` statements. These are false positives: the file is PostgreSQL/Supabase RLS, identical in form to the existing 0006/0016 migrations. Confirmed valid by the clean `supabase db push` (a syntax or wrong-policy-name error would have aborted the push).
- pg_policies confirmation via psql was not run directly (no DB password stored in the repo / no DB URL in env). The successful `db push` is the de-facto confirmation — the DROP statements reference the exact policy names, so a wrong name would have failed; the CREATE statements with the new WITH CHECK applied without error. The plan's gating automated verify (`migration list | rg 0027`) passed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DB backstop is live on Staging. End-to-end rejection of unverified-seller publish and unverified-buyer contact is covered by Plan 07's e2e suite.
- Plan 01 (server-action gates) is the primary gate and runs concurrently; this migration is the independent backstop layer.

## Self-Check: PASSED
- FOUND: supabase/migrations/0027_trust_gate_rls.sql
- FOUND: commit b969615 (migration), single-file (verified via git show --stat)
- 0027 applied on Staging (migration list Local + Remote)

---
*Phase: 17-seller-activation-transaction-trust-gates*
*Completed: 2026-06-19*
