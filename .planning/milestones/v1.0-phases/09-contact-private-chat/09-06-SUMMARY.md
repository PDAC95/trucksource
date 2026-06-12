---
phase: 09-contact-private-chat
plan: 06
subsystem: messaging
tags: [realtime, postgres-changes, optimistic-ui, zero-pii, msg-05, msg-06]
requires:
  - phase: 09-contact-private-chat
    plan: 02
    provides: "getThreadForViewer/getThreadMessages/MessageRow readers + sendMessage/markThreadRead/blockUser/unblockUser actions"
  - phase: 09-contact-private-chat
    plan: 03
    provides: "ReportMenu kebab (targetType=message pass-through)"
provides:
  - "Participant-only thread page /messages/[threadId] (force-dynamic, notFound on non-participant, read watermark on open)"
  - "ThreadHeader part card: photo/title/price/status badge + block/unblock kebab with confirm AlertDialog"
  - "ThreadView: postgres_changes realtime subscription on topic thread:{id} + optimistic de-duped composer + per-message ReportMenu"
affects:
  - "09-07 verification (live two-browser realtime check happens at its human checkpoint)"
  - "future Broadcast migration (topic convention thread:{id} locked here)"
tech-stack:
  added: []
  patterns:
    - "First Realtime usage: supabase.channel(`thread:${id}`).on('postgres_changes', INSERT, filter thread_id=eq.{id}) with removeChannel cleanup and router.refresh() on CHANNEL_ERROR/TIMED_OUT"
    - "Optimistic send: negative temp id → sendMessage → replace by server row, de-dupe by id against the realtime echo"
    - "/saved page-guard precedent: force-dynamic + getClaims re-derive inside the (app) layout"
key-files:
  created:
    - app/(app)/messages/[threadId]/page.tsx
    - components/messaging/thread-header.tsx
    - components/messaging/thread-view.tsx
  modified: []
decisions:
  - "ThreadHeader is a client component (block/unblock kebab needs interactivity); all data arrives as plain server-resolved props — zero client-side PII reads"
  - "Optimistic temp ids are NEGATIVE so they can never collide with bigint identity ids; ReportMenu only mounts on non-own messages so it always sees a real DB id"
  - "Viewer-blocked-counterparty disables the composer via sendDisabled prop (honest UX over a guaranteed RLS rejection); enforcement stays RLS-only"
  - "markThreadRead also fires client-side when a realtime message arrives while the thread is open — keeps unread badge and email throttle honest"
metrics:
  duration: "~8 min"
  completed: "2026-06-11T13:56:00Z"
  tasks: 2
  files: 3
---

# Phase 9 Plan 06: Realtime Thread View Summary

The private chat surface (MSG-05/06): a force-dynamic participant-only thread page with a part-card header, plus the project's first Supabase Realtime usage — postgres_changes INSERT delivery on the future-proof `thread:{id}` topic with an optimistic, id-de-duped composer and username-only identity.

## What Was Built

### Task 1 — Thread page + ThreadHeader — commit 4c6225a

`app/(app)/messages/[threadId]/page.tsx` (`force-dynamic`, invariant #6):
- getClaims re-derives viewerId (defense in depth over the (app) layout guard); malformed/non-positive ids and non-participant views collapse to the same `notFound()` — no existence leak (RLS yields zero rows either way).
- `getThreadForViewer` + `getThreadMessages` server-fetch; participant name map `{userId: publicName}` built from the thread's two profiles_public identities — the ONLY identity source in the chat (the buyer's contact-form name never appears, locked).
- Viewer→counterparty block state resolved via owner-RLS read of `user_blocks`.
- `markThreadRead(threadId)` fires server-side on render — clears unread and re-arms the email throttle.

`components/messaging/thread-header.tsx`: fixed part card — photo thumb + title linked to `/listings/[id]`, price, Active/Sold/Expired Badge (Sold/Expired keeps the thread usable; only the badge changes, locked), "Chatting with {publicName}", and a kebab DropdownMenu with Block/Unblock wired to blockUser/unblockUser behind a confirm AlertDialog ("They won't be able to message you. You can unblock anytime.").

### Task 2 — ThreadView realtime + optimistic composer — commit f5b368f

`components/messaging/thread-view.tsx` (`"use client"`):
- Subscription per research Pattern 4: `channel(\`thread:${threadId}\`)` + `postgres_changes` INSERT filtered to the thread, cleanup via `removeChannel` (Pitfall 7), `router.refresh()` fallback on `CHANNEL_ERROR`/`TIMED_OUT` (messages persist — refresh heals). Topic string is the locked future Broadcast topic.
- Append de-dupes by message id (optimistic insert vs realtime echo). Incoming non-own messages also fire `markThreadRead`.
- Composer: Textarea with MESSAGE_MAX_LENGTH counter, Enter-to-send / Shift+Enter newline; optimistic temp row (negative id) → `sendMessage` → replace with the persisted row; on error rollback + restore draft + honest English toasts (rate_limited / blocked_or_invalid mapped per the action contract).
- Bubbles: own right/primary, other left/muted; sender public name + relative timestamp; every non-own message carries a hover/focus-revealed `ReportMenu targetType="message"`. No typing indicators, no read receipts (locked).

## Verification

- `npm run typecheck`, `npm run lint` (0 errors), `npm run build` (route `ƒ /messages/[threadId]` dynamic), `npm run test` (285 passed, 1 skipped) — all green.
- `grep force-dynamic|notFound|markThreadRead` on the page: hits. `grep postgres_changes|removeChannel` on thread-view: hits.
- `grep -rn "getSession|profiles_private" app/(app)/messages components/messaging/`: zero code references (one COMMENT mention in the sibling 09-05 `contact-form-modal.tsx` describing its server-side-props posture — not a query, out of this plan's scope).
- Live two-browser realtime verification deferred to the 09-07 human checkpoint (needs two sessions), as planned.

## Deviations from Plan

None - plan executed exactly as written. (Note: ThreadHeader is `"use client"` rather than a server component — the plan's own spec requires an interactive kebab + AlertDialog; data flow stays server-resolved props, so the "server-compatible" privacy intent holds.)

## Self-Check: PASSED

- app/(app)/messages/[threadId]/page.tsx — FOUND
- components/messaging/thread-header.tsx — FOUND
- components/messaging/thread-view.tsx — FOUND
- Commit 4c6225a — FOUND
- Commit f5b368f — FOUND
