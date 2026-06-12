---
phase: 09-contact-private-chat
plan: 07
subsystem: messaging
tags: [inbox, unread-badge, email-opt-out, uat, trust-spine, msg-05, msg-06]
requires:
  - phase: 09-contact-private-chat
    plan: 05
    provides: "Contact CTA + form modal on the listing page (contact_log persist-first → thread)"
  - phase: 09-contact-private-chat
    plan: 06
    provides: "ThreadHeader/ThreadView (realtime thread page) reused 1:1 in the desktop split"
provides:
  - "Inbox at /messages: thread list (photo, counterparty username, snippet, unread, status badge) + desktop split via ?thread= + Hide conversation"
  - "Global MessagesBadge (unreadThreadCount, 9+ cap) mounted in the shared site header"
  - "Auth-aware components/layout/site-header.tsx shared by (app) AND (public) layouts — Messages badge visible everywhere, Sign in/Register for anon"
  - "Account settings 'Email me about new messages' toggle → profiles_private.message_email_opt_out (owner RLS)"
  - "Phase 9 trust spine human-verified end-to-end live (two browsers, realtime, privacy, block, report, Sold)"
affects:
  - "Phase 10 admin ops (contact_log/reports surfaces now have proven live data flow)"
  - "post-v1 UI/UX redesign phase (stakeholder request recorded — not a Phase 9 gap)"
tech-stack:
  added: []
  patterns:
    - "Desktop split view by pure CSS + ?thread= query param (list column always rendered, thread pane hidden lg:flex) — no parallel routes"
    - "Shared auth-aware server header: site-header.tsx getClaims → MessagesBadge + Saved (authed) or Sign in/Register (anon); both mounting layouts force-dynamic"
    - "Realtime under RLS requires await supabase.realtime.setAuth() before channel.subscribe() — otherwise the socket joins anon and postgres_changes are silently filtered out"
key-files:
  created:
    - app/(app)/messages/page.tsx
    - components/messaging/thread-list.tsx
    - components/messaging/messages-badge.tsx
    - components/account/message-email-form.tsx
    - components/layout/site-header.tsx
  modified:
    - app/(app)/layout.tsx
    - app/(public)/layout.tsx
    - app/(app)/account/page.tsx
    - lib/account/schema.ts
    - lib/actions/account.ts
    - components/messaging/thread-view.tsx
    - lib/messaging/notify.ts
decisions:
  - "Badge updates on navigation only (no realtime subscription for the badge) — locked research recommendation held"
  - "MSG-05 'always visible' forced a shared header: the badge moved from the (app)-only header into components/layout/site-header.tsx used by (app) AND (public); (public) layout became force-dynamic to read auth"
  - "supabase.realtime.setAuth() is mandatory before subscribing to RLS-protected postgres_changes — adopted as the project pattern for all future Realtime usage"
  - "Invalid/foreign ?thread= ids render the empty split pane (not an error) — no thread-existence leak from the inbox"
metrics:
  duration: "~30 min build + live two-browser UAT (2026-06-11)"
  completed: "2026-06-11"
  tasks: 3
  files: 12
---

# Phase 9 Plan 07: Inbox, Global Badge & Trust-Spine UAT Summary

The user-facing close of Phase 9: a split-view inbox at /messages, an always-visible Messages nav badge (via a new shared auth-aware site header on public AND app pages), the new-message email opt-out toggle — and the full contact → persist+admin-copy → private realtime chat → privacy/block/report spine human-verified live in two browsers.

## What Was Built

### Task 1 — Inbox at /messages — commit 45f997b

`app/(app)/messages/page.tsx` (`force-dynamic`, getClaims re-derive):
- `getMyThreads(viewerId)` → `<ThreadList/>`: part photo thumb, title, counterparty public username, ~60-char last-message snippet, relative time, unread indicator, Sold/Expired status badge.
- One URL scheme: rows link to `?thread={id}`; the thread pane (`hidden lg:flex`) renders ThreadHeader + ThreadView (09-06 components 1:1) when `searchParams.thread` resolves via `getThreadForViewer`, and `markThreadRead` fires. Mobile keeps `/messages/[threadId]`. Pure CSS split — no parallel routes (research Open Q3).
- Invalid/foreign thread id → empty pane (no error, no existence leak). No-thread default: "Select a conversation".
- Empty state: "No messages yet. When you contact a seller — or a buyer contacts you — conversations appear here." + Browse parts CTA (saved-page pattern).
- Per-row kebab → "Hide conversation" with AlertDialog confirm wired to the existing hideThread action.

### Task 2 — Global unread badge + email opt-out — commit 774b14d

- `components/messaging/messages-badge.tsx` (server): `unreadThreadCount(userId)` → Messages link with MessageSquare icon and a count Badge capped at "9+"; no realtime subscription (badge refreshes on navigation, locked).
- `components/account/message-email-form.tsx` + extensions to `lib/account/schema.ts` / `lib/actions/account.ts`: "Email me about new messages" switch (on by default, "We send at most one email per conversation until you read it."), owner-RLS update of `profiles_private.message_email_opt_out`, current value loaded server-side on `app/(app)/account/page.tsx`.

### Task 3 — End-to-end trust-spine UAT — APPROVED

User walked the full 10-step flow live with two browsers (buyer PatricioBuyer / seller account):
contact form (login redirect + return, pre-filled editable name/email) → `contact_log` row in Staging + admin email received → landed in the private thread → seller saw the unread badge, inbox row, and BUYER USERNAME ONLY (the form's real name appears nowhere in chat) → realtime delivery both directions WITHOUT refresh → "View conversation" CTA on revisit (no second form) → seller PII nowhere; third account got 404 on the thread URL → block stopped sends, unblock restored them → report on listing/comment/message with duplicate rejected → Sold badge shown, messaging still works, no contact CTA for third parties. All passed; user typed approved.

## Verification

- `npm run build` + typecheck green on every commit (45f997b, 774b14d, 579571a).
- Human checkpoint approved: realtime + invariant #5 (contact persists before chat) + privacy (username-only identity, owner-only PII) verified live — the four ROADMAP Phase 9 success criteria observed. MSG-01…MSG-07 satisfied.

## Deviations from Plan

### Auto-fixed Issues (discovered during the Task 3 UAT, fixed at the checkpoint)

**1. [Rule 2 - Missing critical functionality] Messages badge not "always visible" — public pages had no header at all**
- **Found during:** Task 3 UAT (steps 4/6)
- **Issue:** The badge only existed in the (app) layout header; the public feed/listing pages rendered NO header chrome, so a logged-in user browsing publicly lost the Messages entry (MSG-05) and anon visitors had no Sign in/Register affordance.
- **Fix:** Extracted an auth-aware `components/layout/site-header.tsx` shared by the (app) AND (public) layouts; authed users get Saved + Messages badge everywhere, anon users get Sign in/Register. `app/(public)/layout.tsx` is now force-dynamic.
- **Files modified:** components/layout/site-header.tsx (new), app/(app)/layout.tsx, app/(public)/layout.tsx
- **Commit:** 579571a

**2. [Rule 1 - Bug] Realtime channel joined as anon — RLS silently dropped live message delivery**
- **Found during:** Task 3 UAT (step 5)
- **Issue:** `thread-view.tsx` subscribed to postgres_changes without authenticating the realtime socket; under RLS the INSERT events were filtered out and the user had to reload to see new messages.
- **Fix:** `await supabase.realtime.setAuth()` before `channel.subscribe()`; adopted as the project Realtime pattern.
- **Files modified:** components/messaging/thread-view.tsx
- **Commit:** 579571a

**3. [Rule 2 - Security] HTML-escape user-supplied values in the new-message notification email**
- **Found during:** security review earlier in the plan window
- **Issue:** `lib/messaging/notify.ts` interpolated user-controlled strings into email HTML unescaped.
- **Fix:** Escape all user-supplied values before interpolation.
- **Files modified:** lib/messaging/notify.ts
- **Commit:** aeba26f

### Notes (not deviations)

- A second Staging test user (PatricioBuyer) was created via the admin API because public signup only delivers confirmation email to the Resend account address until domain verification (known Staging constraint, already in Pending Todos).
- Stakeholder feedback recorded for later: a dedicated professional UI/UX redesign phase after v1 — explicitly NOT a Phase 9 gap.

## Self-Check: PASSED

- app/(app)/messages/page.tsx — FOUND
- components/messaging/thread-list.tsx — FOUND
- components/messaging/messages-badge.tsx — FOUND
- components/account/message-email-form.tsx — FOUND
- components/layout/site-header.tsx — FOUND
- Commits 45f997b, 774b14d, 579571a, aeba26f — FOUND
