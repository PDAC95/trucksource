---
phase: 09-contact-private-chat
plan: 01
subsystem: database
tags: [supabase, rls, postgres, realtime, messaging, zod, resend]
requires:
  - phase: 05-listings-photos-exif
    provides: listings table (FK target for contact_log/message_threads/reports)
  - phase: 08-social-layer
    provides: listing_comments table (reports.comment_id FK), shared-zod-schema + DB-CHECK lockstep precedent
  - phase: 01-foundation-privacy
    provides: profiles_private (opt-out column rides here), lib/supabase/admin.ts service-role client
provides:
  - contact_log table (buyer-insert, buyer/seller-select, NO update/delete — immutable trust record, MSG-04)
  - message_threads table (one per (listing,buyer) via unique constraint; contact_log_id NOT NULL makes invariant #5 structural; read/email watermarks + hidden-at columns)
  - messages table (append-only — NO update/delete policies; PII-free rows: UUIDs + text only, MSG-06; in supabase_realtime publication)
  - user_blocks table (owner-managed; enforced in the messages INSERT policy, single enforcement point)
  - reports table (exclusive-arc num_nonnulls target; one-report-per-user-per-item partial unique indexes; message reports require thread participation)
  - profiles_private.message_email_opt_out column
  - lib/messaging/schema.ts (contactSchema, messageSchema, reportSchema, MESSAGE_MAX_LENGTH, REPORT_REASONS)
  - lib/messaging/notify.ts (server-only: sendAdminContactCopy, sendAdminReportCopy, sendNewMessageEmail — throttled, opt-out aware, best-effort)
affects: [09-02, 09-03, 09-04, 09-05, 09-06, 09-07, 10-admin-ops]
tech-stack:
  added: []
  patterns:
    - "Append-only by ABSENCE of update/delete policies (0015 precedent) = MSG-04 enforcement"
    - "Realtime SELECT policy kept to ONE indexed EXISTS against message_threads PK (WALRUS per-change × per-subscriber cost)"
    - "Block check lives ONLY in the messages INSERT policy — blocks gate sending, never reading history"
    - "Watermark email throttle: send iff *_emailed_at null OR *_last_read_at > *_emailed_at; stamp on send"
key-files:
  created:
    - supabase/migrations/0016_messaging.sql
    - lib/messaging/schema.ts
    - lib/messaging/notify.ts
  modified: []
decisions:
  - "user_blocks is created BEFORE messages in 0016 — the messages INSERT policy references it and create policy resolves relations at creation time"
  - "reports.comment_id is ON DELETE CASCADE (set null would break the exclusive-arc CHECK; comment_deletion_log keeps the audit trace)"
  - "sendNewMessageEmail resolves the recipient side (buyer/seller) from the thread row itself and refuses to email non-participants"
metrics:
  duration: ~15 min
  completed: 2026-06-11
---

# Phase 9 Plan 01: Messaging Schema Root + Contracts Summary

**One-liner:** Entire Phase-9 schema landed live on Staging in one transactional migration (5 RLS-on tables, append-only messages in the realtime publication) plus the shared zod contracts and the server-only throttled Resend notification module.

## What was built

### Task 1 — Migration 0016_messaging.sql (applied + verified live)
- `contact_log`: the immutable buyer-contact trust record (buyer form PII lives here BY DESIGN); buyer INSERT, buyer/seller SELECT, no update/delete. `(buyer_id, created_at)` index for the daily rate-limit head-count.
- `message_threads`: `unique (listing_id, buyer_id)` race-proof one-thread rule; `contact_log_id NOT NULL` makes "contact persists before chat opens" structural; read/email watermarks and `*_hidden_at` (hide ≠ delete).
- `messages`: append-only (`char_length(body) between 1 and 2000`); SELECT policy is a single indexed EXISTS on the thread PK (WALRUS-cheap); INSERT policy enforces self-attribution + participation + not-blocked-either-direction; NEW-row columns qualified (`messages.thread_id`) per the 0015 depth-1 lesson.
- `user_blocks`: owner-only CRUD; the single block enforcement point is the messages INSERT policy.
- `reports`: exclusive-arc (`num_nonnulls(...) = 1`), reason CHECK, 3 partial unique indexes; reporting a message requires thread participation (message ids are guessable bigints).
- `profiles_private.message_email_opt_out boolean not null default false`.
- `alter publication supabase_realtime add table public.messages` (Pitfall 1).
- Verified live on Staging: all 5 tables `relrowsecurity = true`; `pg_publication_tables` returns the messages row; pg_policies shows zero UPDATE/DELETE policies on messages/contact_log.

### Task 2 — lib/messaging/schema.ts
- `MESSAGE_MAX_LENGTH = 2000` in documented lockstep with the messages.body DB CHECK.
- `contactSchema` (name 1..100, email, optional phone with empty→undefined, message 1..2000), `messageSchema`, `reportSchema` (+ inferred `ContactInput`/`MessageInput`/`ReportInput`).
- `REPORT_REASONS` labeled list (English UI copy) matching the DB reason CHECK exactly.

### Task 3 — lib/messaging/notify.ts
- `import "server-only"`; raw-fetch Resend posture cloned from lib/verify/alert.ts — every sender try/catch-swallows and never throws to the caller.
- `sendAdminContactCopy` / `sendAdminReportCopy` → `ADMIN_NOTIFICATIONS_EMAIL`, full context by locked decision; return booleans so callers can stamp `admin_emailed_at`; console.warn + false when the env var is unset (the DB row is the copy of record).
- `sendNewMessageEmail`: resolves recipient side from the thread row, watermark throttle (emailed_at null OR last_read_at > emailed_at), opt-out aware, service-role `profiles_private` read never returned to callers, ≤100-char snippet, "View message" button, no reply-to anywhere. From `Take-Off Parts <onboarding@resend.dev>` with the pre-launch domain-swap note.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reordered user_blocks before messages in 0016**
- **Found during:** Task 1 (first apply attempt failed: `relation "public.user_blocks" does not exist`)
- **Issue:** The plan/research SQL ordered user_blocks after messages, but `create policy` resolves referenced relations immediately — the messages INSERT policy needs user_blocks to exist first.
- **Fix:** Moved the user_blocks section ahead of messages; migration applied cleanly in one transaction (the failed attempt rolled back fully — verified no partial state).
- **Files modified:** supabase/migrations/0016_messaging.sql
- **Commit:** f9644e3

No other deviations — Tasks 2 and 3 executed as written.

## UAT notes for later plans
- `onboarding@resend.dev` only delivers to the Resend account address until pre-launch domain verification — notification emails degrade silently on Staging by design (best-effort posture).
- Realtime delivery (subscribe → insert → receipt, plus non-participant receives nothing) gets exercised at the Plan 04/05 human-verify checkpoint.

## Commits
- f9644e3 feat(09-01): add messaging schema migration 0016 (applied to Staging)
- 582c951 feat(09-01): add shared messaging zod schemas
- 1fabc2c feat(09-01): add server-only messaging notification module

## Self-Check: PASSED
