---
phase: 10-admin-operations-analytics
plan: 08
subsystem: admin
tags: [admo-03, reports, moderation, enforcement, audit, queue]
requires:
  - "10-01: reports queue columns (status/resolved_by/resolved_at/admin_note) + (status, created_at desc) index (0019)"
  - "10-02: requireAdmin() gate + logAdminAction() audit writer"
  - "10-03: warnUser/suspendUser/banUser + EnforcementActions dialogs"
  - "10-04: hideListing/restoreListing + HideRestoreControls"
  - "10-07: freezeThread + ThreadFreezeToggle + the audited /admin/messages/threads/[id] content view"
  - "Phase 9: reports exclusive-arc schema (0016)"
provides:
  - "/admin/reports — grouped, state+type-filterable abuse-report queue"
  - "/admin/reports/[targetKey] — group detail with enforcement panel + one-action resolve/dismiss"
  - "admin_report_queue(p_status, p_type) RPC — per-target grouping over the exclusive arc (migration 0021, applied to Staging)"
  - "resolveReportGroup / dismissReportGroup server actions (audited, note-required)"
  - "parseTargetKey / targetColumn — the one targetKey round-trip parser"
affects:
  - "10-10 UAT (queue is the enforcement front door to verify end-to-end)"
tech-stack:
  added: []
  patterns:
    - "group-by in a service-role-only SQL function when PostgREST can't express the expression (coalesce over the exclusive arc) — 0020 helper posture"
    - "targetKey ('listing:7'/'comment:3'/'message:9') as the URL-safe group identity, parsed in exactly one place"
    - "one UPDATE closes the whole group: .eq(arcColumn, id).eq('status','pending')"
key-files:
  created:
    - supabase/migrations/0021_report_queue_rpc.sql
    - lib/admin/reports-queries.ts
    - lib/actions/admin/reports.ts
    - app/admin/reports/page.tsx
    - app/admin/reports/[targetKey]/page.tsx
    - components/admin/report-queue-actions.tsx
  modified: []
decisions:
  - "Grouping is per (target, status): a target re-reported after its group was resolved surfaces again in Pending as a fresh group — correct re-triage behavior"
  - "Message-report groups NEVER render the message body — queue + detail show thread metadata and link to the audited 10-07 content view (the report on that message is exactly what unlocks it there)"
  - "Comment targets have no hide mechanism (Phase 8 comments hard-delete by author only) — enforcement on a comment group is against the author; no mechanism invented"
  - "Enforcement and resolve stay two explicit clicks: enforcing never auto-resolves, resolving never auto-enforces"
  - "Closed rows are immutable: resolve/dismiss only flips status='pending' rows; resolved history keeps its original note/resolver"
  - "RPC is SECURITY INVOKER with execute revoked from public/anon/authenticated (service-role bypasses RLS) — same posture as the 0020 analytics helpers"
metrics:
  duration: "~14 min"
  completed: "2026-06-11"
---

# Phase 10 Plan 08: Abuse-Report Queue (ADMO-03) Summary

**One-liner:** Grouped per-target report queue (counter + merged reasons) with Pending/Resolved/Dismissed tabs, type filters, note-required one-action group close, and an enforcement panel that reuses the entire 10-03/10-04/10-07 ladder.

## What Was Built

### Task 1 — Grouped queue queries (`supabase/migrations/0021_report_queue_rpc.sql`, `lib/admin/reports-queries.ts`)
- **`admin_report_queue(p_status, p_type)`** (0021): plain-SQL, SECURITY INVOKER, `set search_path = ''`; groups `reports` on the coalesce of the exclusive-arc columns into `target_key` (`listing:<id>` / `comment:<id>` / `message:<id>`) with `count(*)`, `array_agg(distinct reason)`, first/last reported, and the latest admin note/resolved_at. Execute revoked from `public, anon, authenticated` — service-role only, the 0019/0020 posture. **Applied to Staging via `npx supabase db query --linked -f`** (db push remains unsafe); verified live: existing pending report groups as `listing:7`, and `has_function_privilege` confirms anon/authenticated=false, service_role=true.
- **`getReportQueue({ state, type? })`** (server-only): calls the RPC then batch-enriches per id type — listing titles; comment excerpt + parent listing title; message → thread id + participant names (via profiles_public, `resolvePublicName`). **No message body is ever selected.**
- **`getReportGroup(targetKey)`**: every report row for the target (any status — closed history stays visible) with reporter names, plus the target context: listing (title/status/hidden state/seller + restriction), comment (body, author + restriction, listing link), message (thread metadata, participants, sender + restriction, frozen state — body deliberately absent). `target: null` when the row no longer exists (e.g. comment cascade) so the page can still close the group.
- **`parseTargetKey` / `targetColumn`**: the single round-trip parser shared by queries and actions.

### Task 2 — Queue pages + group close actions (`lib/actions/admin/reports.ts`, pages, `components/admin/report-queue-actions.tsx`)
- **`resolveReportGroup` / `dismissReportGroup`** (`"use server"`): requireAdmin → parse targetKey → required note → ONE service-role UPDATE setting `status/resolved_by/resolved_at/admin_note` on **all** rows of the target's arc column `where status='pending'` (`.select("id")` derives the count; 0 rows → `not_found`) → `logAdminAction('report_resolve'|'report_dismiss', targetType 'report_group', targetId targetKey, metadata { targetKey, count })` (throws = action fails) → revalidate list + detail.
- **`/admin/reports`** (force-dynamic): server-rendered state tabs (Pending default / Resolved / Dismissed) + type filter pills (All/Listings/Comments/Messages) — shareable URLs, no client state. Table: type badge, target summary (links to group detail), report-counter badge (destructive when >1), merged reason badges, first reported; closed tabs add the admin-note column.
- **`/admin/reports/[targetKey]`** (force-dynamic, `decodeURIComponent` on the param): individual reports list (reporter, reason, detail, status, note), target context panel, and the Actions column:
  - listing → `HideRestoreControls` + `EnforcementActions` against the seller;
  - comment → `EnforcementActions` against the author (no comment-hide invented);
  - message → `ThreadFreezeToggle` + "View thread content (audited)" link into the 10-07 page + `EnforcementActions` against the sender.
  - Below: `ReportQueueActions` — Resolve/Dismiss dialogs with a required admin note, shown only while the group has pending rows; closed groups show "this group is closed".

## Deviations from Plan

None - plan executed exactly as written. (The anticipated "only if PostgREST can't express the group-by" migration was indeed needed, as the plan predicted.)

## Verification

- `npm run typecheck` clean after each task; `npm run build` clean — `/admin/reports` and `/admin/reports/[targetKey]` both registered as dynamic routes.
- Live Staging checks: `admin_report_queue('pending', null)` returns the existing report grouped as `target_key='listing:7', report_count=1, reasons={wrong_info}`; execute privileges service-role-only.
- End-to-end two-reports-collapse + resolve flow is exercised in 10-10 UAT (this plan kept Staging data unmutated).

## Self-Check: PASSED

- supabase/migrations/0021_report_queue_rpc.sql — FOUND
- lib/admin/reports-queries.ts — FOUND
- lib/actions/admin/reports.ts — FOUND
- app/admin/reports/page.tsx — FOUND
- app/admin/reports/[targetKey]/page.tsx — FOUND
- components/admin/report-queue-actions.tsx — FOUND
- Commit 18dcf06 (Task 1) — FOUND
- Commit 235325c (Task 2) — FOUND
