---
phase: 09-contact-private-chat
plan: 02
subsystem: messaging
tags: [server-actions, rls, rate-limit, zero-pii, invariant-5, vitest]
requires:
  - phase: 09-contact-private-chat
    plan: 01
    provides: "0016_messaging.sql schema, contactSchema/messageSchema, notify.ts senders"
provides:
  - "submitContact server action — the invariant-#5 spine (contact_log → admin copy → thread → first message, in that order)"
  - "sendMessage/markThreadRead/hideThread/blockUser/unblockUser actions"
  - "Zero-PII readers: getMyThreads, getThreadForViewer, getThreadMessages, getExistingThreadId, unreadThreadCount + exported MessageRow"
affects:
  - "09-03 contact CTA/modal (calls submitContact, getExistingThreadId)"
  - "09-04 inbox/thread UI (consumes readers + sendMessage/markThreadRead)"
tech-stack:
  added: []
  patterns:
    - "comments.ts action posture: getClaims → zod → head-count rate limit → RLS-gated write → revalidate"
    - "saves/queries.ts hydration: one batched read per dimension, no N+1"
    - "role-scoped watermark updates: viewer-side column only, double-scoped by role id eq"
key-files:
  created:
    - lib/messaging/queries.ts
    - lib/actions/contact.ts
    - lib/actions/messages.ts
    - tests/unit/contact-actions.test.ts
    - tests/unit/message-actions.test.ts
  modified:
    - lib/messaging/notify.ts
decisions:
  - "admin_emailed_at stamp lives inside sendAdminContactCopy via the admin client — contact_log stays client-immutable (no UPDATE policy)"
  - "unreadThreadCount reduces in JS: PostgREST cannot compare two columns (last_message_at vs viewer watermark) in a filter; per-user thread counts are small"
  - "blockUser/unblockUser are idempotent (23505 collapses to success); enforcement is RLS-only via the messages INSERT policy"
  - "raced duplicate thread insert re-reads the unique-pair winner and skips the first-message insert"
metrics:
  duration: "~12 min"
  completed: "2026-06-11T13:40:00Z"
  tasks: 3
  files: 6
---

# Phase 9 Plan 02: Contact/Chat Backend Spine Summary

submitContact implements invariant #5 (contact_log persists + admin copy attempted BEFORE any thread/message row) with a call-order unit-test proof, plus zero-PII thread/message readers and the RLS-gated chat actions.

## What Was Built

### Task 1 — Zero-PII readers (`lib/messaging/queries.ts`) — commit b1955d6
Five cookie-bound, RLS-scoped readers with explicit exported shapes (the 09-04 contract test target):
- `getMyThreads(viewerId)`: visible threads (viewer-side `*_hidden_at` null), newest activity first, hydrated with listing card (title/price/status/cover photo), counterparty public name (profiles_public + `resolvePublicName`), last-message snippet, and unread boolean (watermark + last-sender ≠ viewer).
- `getThreadForViewer(threadId, viewerId)`: thread + both public names + viewer role; null for non-participants (RLS zero rows — no existence leak).
- `getThreadMessages(threadId)`: ascending `MessageRow[]` (exported type for the realtime component).
- `getExistingThreadId(listingId, buyerId)`: indexed unique-pair lookup.
- `unreadThreadCount(viewerId)`: enumerated non-PII read reduced in JS (PostgREST can't compare two columns).

Shapes carry only UUIDs, public names, listing-card fields, and bodies. Verified: grep for star-selects / the PII table returns nothing.

### Task 2 — submitContact (`lib/actions/contact.ts`) — commit 716aea2
11-step guard order (research Pattern 3, each step commented):
getClaims → zod → 24h rate limit (`CONTACT_DAILY_LIMIT = 10`, head-count on contact_log) → listing pre-check (not_found / contacts_closed / own-listing invalid) → existing-thread dedupe (zero inserts) → **BLOCKING contact_log insert** → admin copy (best-effort) → thread insert (raced 23505 re-reads winner, skips message) → first message → throttled seller email → revalidate.

`notify.ts` deviation (sanctioned by the plan): `sendAdminContactCopy` now stamps `contact_log.admin_emailed_at` itself via the admin client on send success — contact_log has no UPDATE policy by design.

Unit test (11 cases) proves the event order `insert:contact_log → adminCopy → insert:message_threads → insert:messages → sellerEmail`, the failure short-circuit (contact_log error ⇒ no thread, no message), the zero-insert dedupe, the rate-limit branch, and unauthenticated-before-any-DB-call.

### Task 3 — Message actions (`lib/actions/messages.ts`) — commit 6912833
- `sendMessage`: getClaims → zod → 60s burst limit (`MESSAGE_BURST_LIMIT = 20`, strictly `>`) → RLS-gated insert (participant + not-blocked enforced ONLY in the policy; rejection collapses to `blocked_or_invalid` — no block-state leak) → `last_message_at` bump → throttled email to the OTHER participant → revalidate. Returns the inserted `MessageRow` for optimistic render.
- `markThreadRead` / `hideThread`: shared role-scoped helper updates ONLY the viewer-side column (`buyer_*` vs `seller_*`), double-scoped with the role id eq. Read re-arms the email throttle; hide ≠ delete (MSG-04).
- `blockUser` / `unblockUser`: owner-RLS, UUID-guarded, idempotent.

Unit test (16 cases) covers the guard order, the RLS collapse, own-watermark column discipline (buyer vs seller), and block idempotency.

## Verification

- `npx vitest run tests/unit/contact-actions.test.ts tests/unit/message-actions.test.ts` — 27/27 green.
- `grep getSession|service_role|admin` over both actions — no admin client, no getSession (only docstring words).
- `npm run typecheck`, `eslint` on all new files — clean.
- `npm run build` — exit 0.

## Deviations from Plan

### Auto-fixed / Sanctioned

**1. [Plan-sanctioned] `lib/messaging/notify.ts` modified for the admin_emailed_at stamp**
- **Found during:** Task 2 step 7
- **Issue:** contact_log is client-immutable (no UPDATE policy), so the action cannot stamp the email outcome
- **Fix:** the stamp moved inside `sendAdminContactCopy` via the existing admin client (the plan's explicit option)
- **Files modified:** lib/messaging/notify.ts
- **Commit:** 716aea2

**2. [Rule 1 - approximation note] `unreadThreadCount` is not a head-count**
- The plan asked for a head-count, but PostgREST cannot filter on a column-to-column comparison (`last_message_at > viewer watermark`). Implemented as an enumerated non-PII read reduced in JS — same cost class for per-user thread volumes; documented in the reader.

## Requirements

- **MSG-02/03**: contact persisted + admin-copied before chat opens — submitContact steps 6–8 + order proof.
- **MSG-05**: thread opens after submit (threadId returned; re-contact resolves to the existing thread).
- **MSG-06**: reader shapes expose UUIDs/public names/bodies only.

## Self-Check: PASSED

- All 6 files exist on disk with expected content (verified by file, not commit message — parallel-wave hook caveat).
- Commits b1955d6, 716aea2, 6912833 present on master.
- 27 unit tests green; build exit 0.
