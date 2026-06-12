---
phase: 10-admin-operations-analytics
plan: 07
subsystem: admin
tags: [admo-04, messaging, privacy, audit, moderation, freeze, contact-log]
requires:
  - "10-01: message_threads.frozen_at/frozen_by + messages INSERT frozen arm + reports queue columns (migration 0019)"
  - "10-02: requireAdmin() gate + logAdminAction() audit writer"
  - "Phase 9: contact_log / message_threads / messages / reports schema (0016)"
provides:
  - "/admin/messages — metadata-only thread monitoring + filterable contact-log table"
  - "/admin/messages/threads/[id] — report-gated, audited thread content view"
  - "getThreadContentJustification() — the ONE content-unlock rule (message report in-thread)"
  - "freezeThread / unfreezeThread server actions (audited, reason-required freeze)"
affects:
  - "10-05 reports queue (message reports link into the content view)"
tech-stack:
  added: []
  patterns:
    - "audit-before-render: logAdminAction('thread_content_access') awaited before any message body is fetched"
    - "metadata/content tier split encoded in query shape (list queries never select body)"
    - "filter pre-resolution: username/title ilike -> id sets -> .in() filters on the base table"
key-files:
  created:
    - lib/admin/messaging-queries.ts
    - app/admin/messages/page.tsx
    - app/admin/messages/threads/[id]/page.tsx
    - lib/actions/admin/threads.ts
    - components/admin/thread-actions.tsx
  modified: []
decisions:
  - "Content unlock rule lives in exactly one function (getThreadContentJustification); a listing report alone never unlocks chat content (Pitfall 8)"
  - "Audit row is written BEFORE bodies are fetched; logAdminAction throws on failure so an unaudited view cannot render"
  - "Freeze requires a reason (stored on the audit row, not the thread); enforcement is the 0019 RLS INSERT arm, the action only flips frozen_at/frozen_by"
  - "'View content' button disabled-when-unreported is UX only; the content page itself enforces the rule (still navigable by URL, still locked)"
  - "Oldest justifying report wins as the banner's report id (stable across re-renders)"
metrics:
  duration: "~10 min"
  completed: "2026-06-11"
---

# Phase 10 Plan 07: Message & Contact-Log Monitoring (ADMO-04) Summary

**One-liner:** Privacy-tiered admin messaging ops — metadata-only thread list, report-justified + audit-before-render content view, RLS-enforced thread freeze, and the filterable contact-log copy-of-record table.

## What Was Built

### Task 1 — Monitoring queries + justification rule (`lib/admin/messaging-queries.ts`, server-only, service-role)
- `getAdminThreads({ q, page })`: participants (public usernames via profiles_public), listing title, message count, last activity, frozen state, and a `hasMessageReport` flag (the content key). **No message body is selected anywhere in this function** — the metadata tier is enforced by query shape. `q` pre-resolves username/display-name and listing-title `ilike` matches into id sets, then filters threads with `.or(buyer_id.in / seller_id.in / listing_id.in)`.
- `getAdminContactLogs({ buyer, seller, listing, from, to, q, page })`: the contact_log table with username + listing-title resolution; full `message_text` rendered by design (the row IS the admin copy of record per 0016 / locked decision). Filters via id pre-resolution + date range + `ilike` on message_text.
- `getThreadContentJustification(threadId)`: returns the OLDEST report whose `message_id` belongs to a message in this thread, else null. Step 1 selects message **ids only**. This single function encodes Pitfall 8 — listing/comment reports never unlock chat content.
- `getThreadMessagesForAdmin(threadId)`: bodies + sender names; called only by the content page after justification + audit.
- `getAdminThreadMeta(threadId)`: single-thread metadata for the content page's locked-notice tier.

### Task 2 — Messages page + freeze (`app/admin/messages/page.tsx`, `lib/actions/admin/threads.ts`, `components/admin/thread-actions.tsx`)
- `/admin/messages` (force-dynamic), link-tabs via `?tab=threads|contacts` (no client tab state; shareable URLs).
  - Threads tab: metadata table with Frozen (secondary) / Reported (destructive) badges, participant search, "View content" (enabled only when reported — UX hint; the content page enforces), Freeze/Unfreeze.
  - Contacts tab: buyer / seller / listing / date-range / message-text filter bar (plain GET form) + paginated table (Date, Buyer, Seller, Listing, Initial message).
- `freezeThread({ threadId, reason })`: requireAdmin → reason required → service-role update `frozen_at=now(), frozen_by=adminId` guarded by `.is("frozen_at", null)` (idempotent, never overwrites the original freeze) → `logAdminAction('thread_freeze')` with the reason → revalidate. `unfreezeThread` mirrors with `thread_unfreeze`. Send-blocking itself is the 0019 messages INSERT policy arm — DB-enforced for every code path.
- `ThreadFreezeToggle` (client): AlertDialog confirm with required-reason textarea on freeze, sonner toasts, `router.refresh()` (sold-toggle pattern).

### Task 3 — Audited content view (`app/admin/messages/threads/[id]/page.tsx`)
Strict order, each step gating the next:
1. `requireAdmin()` re-called in the page (layout is UX, not an authorization boundary).
2. `getThreadContentJustification()` — null → locked notice ("No report justifies access to this conversation's content.") with metadata only; **zero bodies fetched on that path**.
3. `logAdminAction({ action: 'thread_content_access', targetType: 'thread', metadata: { report_id } })` — awaited BEFORE any body fetch; it throws on insert failure, so an unaudited transcript cannot render.
4. `getThreadMessagesForAdmin()` → read-only transcript (usernames, timestamps, bodies) under the banner "Access justified by report #{id} — this access has been logged." Freeze/unfreeze available; no composer exists on the page.

## Verification

- `npm run typecheck`: clean after each task (zero errors in any 10-07 file).
- `npm run build`: passed after Task 2. After Task 3 the full build failed **only** on files belonging to plan 10-08's in-flight parallel work (`app/admin/fitment/[level]/page.tsx` missing `slang-editor` module; `components/admin/taxonomy-crud.tsx` zodResolver overload) — out of scope per the parallel-wave boundary; `npx tsc --noEmit` confirmed no 10-07 file appears in the error list.
- Live Staging checks (audit-row ordering, listing-report lock, two-browser freeze) are the phase UAT's job (10-10) — the structural guarantees (audit-before-fetch, ids-only justification query, RLS freeze arm) are encoded in code order and query shape.

## Deviations from Plan

### Auto-fixed / Implementation additions

**1. [Rule 3 - Blocking] Added `getAdminThreadMeta(threadId)` to messaging-queries**
- **Found during:** Task 3
- **Issue:** The content page must render thread metadata on the locked path; the plan only named the list query.
- **Fix:** Single-thread metadata reader (same enumerated no-body columns), used by the content page header and locked notice.
- **Files modified:** lib/admin/messaging-queries.ts
- **Commit:** beb9bad

No other deviations — plan executed as written.

## Deferred Issues

- Full `npm run build` is currently red due to plan 10-08's in-progress files (parallel wave agent owns them); no action taken here.

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 | beb9bad | metadata-only thread queries + report-justification rule |
| 2 | ba895c6 | admin messages page (threads + contact logs) with thread freeze |
| 3 | 553dec5 | audited thread content view (report-gated, audit-before-render) |

## Self-Check: PASSED

All 5 created files exist on disk; all 3 task commits (beb9bad, ba895c6, 553dec5) present in git history.
