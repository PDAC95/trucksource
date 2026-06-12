---
phase: 09-contact-private-chat
verified: 2026-06-11T00:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
human_verification:
  - test: "Full trust spine end-to-end flow"
    expected: "Contact form → contact_log row + admin email → thread opens → second browser receives message live → non-participant sees nothing"
    why_human: "Realtime delivery, two-browser session, admin email receipt require live observation"
    result: "APPROVED 2026-06-11 — stakeholder UAT with two live browsers confirmed the full flow"
---

# Phase 9: Contact — Private Chat Verification Report

**Phase Goal:** The trust spine — a buyer contacts a seller through a form that persists the submission and copies admin BEFORE any chat thread opens, then exchanges messages in a private in-site chat that never exposes seller PII, with reporting and abuse logging throughout.

**Verified:** 2026-06-11
**Status:** PASSED
**Re-verification:** No — initial verification


## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each listing has a "Contact Seller About This Part" action requiring a contact form before any thread opens | VERIFIED | `ContactSellerButton` + `ContactFormModal` mounted in `listing-detail.tsx` (lines 267, 151); `submitContact` is the only code path to a thread |
| 2 | Contact persisted to DB and admin-copied BEFORE chat opens; every buyer→seller communication logged | VERIFIED | `contact.ts` action comment + code: step 6 = blocking `contact_log` INSERT, step 7 = `sendAdminContactCopy`, step 8 = thread INSERT; no UPDATE/DELETE policy on `contact_log` in migration |
| 3 | Private in-site chat opens after form; messages exchange without exposing seller PII | VERIFIED | `thread-view.tsx` uses `postgres_changes` subscription; `queries.ts` resolves identity exclusively from `profiles_public` (username/display_name), never `profiles_private` |
| 4 | User can report a listing, comment, or message for abuse | VERIFIED | `ReportMenu` mounted on comments (`comment-section.tsx`), listing page (`listing-detail.tsx`), and message rows (`thread-view.tsx`); `submitReport` action writes to `reports` table with exclusive-arc constraint |

**Score:** 4/4 truths verified


### Required Artifacts

| Artifact | Plan | Status | Details |
|----------|------|--------|---------|
| `supabase/migrations/0016_messaging.sql` | 09-01 | VERIFIED | 263 lines; 5 tables (contact_log, message_threads, messages, user_blocks, reports); RLS enabled in-migration on all 5; `alter publication supabase_realtime add table public.messages` present; no UPDATE/DELETE policy on messages or contact_log (13 policies total, all SELECT/INSERT/UPDATE on threads/blocks only) |
| `lib/messaging/schema.ts` | 09-01 | VERIFIED | 86 lines; exports `contactSchema`, `messageSchema`, `reportSchema`, `MESSAGE_MAX_LENGTH = 2000`, `REPORT_REASONS` |
| `lib/messaging/notify.ts` | 09-01 | VERIFIED | 255 lines; `import "server-only"` at line 1; exports `sendAdminContactCopy`, `sendAdminReportCopy`, `sendNewMessageEmail`; reads `profiles_private` via admin client only; opt-out + watermark throttle implemented |
| `lib/actions/contact.ts` | 09-02 | VERIFIED | 217 lines; invariant-#5 ordering documented and enforced: contact_log INSERT (step 6, blocking) → sendAdminContactCopy (step 7) → thread INSERT (step 8) |
| `lib/actions/messages.ts` | 09-02 | VERIFIED | 289 lines; exports `sendMessage`, `markThreadRead`, `hideThread`, `blockUser`, `unblockUser`; calls `sendNewMessageEmail` after successful insert |
| `lib/messaging/queries.ts` | 09-02 | VERIFIED | 374 lines; exports `getMyThreads`, `getThreadForViewer`, `getThreadMessages`, `getExistingThreadId`, `unreadThreadCount`; identity resolved from `profiles_public` only (line 150) — zero PII |
| `lib/actions/reports.ts` | 09-03 | VERIFIED | 121 lines; `getClaims` identity, rate limit, insert, `sendAdminReportCopy` |
| `components/messaging/report-menu.tsx` | 09-03 | VERIFIED | 232 lines; imports `submitReport`; `ReportMenu` exported; reason select + optional detail dialog |
| `components/comments/comment-section.tsx` | 09-03 | VERIFIED | `ReportMenu` imported and mounted (line 84) |
| `tests/unit/contact-actions.test.ts` | 09-02 | VERIFIED | Exists in `tests/unit/` |
| `tests/unit/message-actions.test.ts` | 09-02 | VERIFIED | Exists in `tests/unit/` |
| `tests/unit/report-actions.test.ts` | 09-03 | VERIFIED | Exists in `tests/unit/` |
| `tests/integration/messaging.test.ts` | 09-04 | VERIFIED | Exists; RLS gates — participant-only, append-only, block enforcement |
| `tests/integration/messaging.contract.test.ts` | 09-04 | VERIFIED | Exists; zero-PII contract over reader shapes |
| `components/messaging/contact-seller-button.tsx` | 09-05 | VERIFIED | 91 lines; four render states (owner/anon/existing-thread/inactive) |
| `components/messaging/contact-form-modal.tsx` | 09-05 | VERIFIED | 209 lines; RHF + zodResolver(contactSchema); calls `submitContact`; on success `router.push(/messages/${threadId})` |
| `app/(public)/listings/[id]/page.tsx` | 09-05 | VERIFIED | Imports `getExistingThreadId`; fetches viewer's own `profiles_private` for prefill; passes existingThreadId to CTA |
| `components/messaging/thread-view.tsx` | 09-06 | VERIFIED | 284 lines (> min 80); `postgres_changes` subscription on `thread:${threadId}`; `sendMessage` on submit; optimistic append |
| `app/(app)/messages/[threadId]/page.tsx` | 09-06 | VERIFIED | 92 lines; `export const dynamic = "force-dynamic"`; getClaims guard; `getThreadForViewer` + `getThreadMessages` + `markThreadRead` |
| `app/(app)/messages/page.tsx` | 09-07 | VERIFIED | 142 lines; `export const dynamic = "force-dynamic"`; `getMyThreads` for list; desktop split view |
| `components/messaging/messages-badge.tsx` | 09-07 | VERIFIED | 32 lines; `unreadThreadCount` called; mounted in `site-header.tsx` (not app/layout directly — routed through `components/layout/site-header.tsx`) |
| `components/account/message-email-form.tsx` | 09-07 | VERIFIED | 91 lines; opt-out toggle; imported and rendered in `app/(app)/account/page.tsx` with `profiles_private.message_email_opt_out` |


### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `0016_messaging.sql` | Supabase Staging | `alter publication supabase_realtime add table public.messages` | VERIFIED | Line 263 of migration |
| `lib/messaging/notify.ts` | `profiles_private` | admin client `.from("profiles_private").select("email, message_email_opt_out")` | VERIFIED | Lines 209-211; server-only, PII never returned to caller |
| `lib/messaging/schema.ts` | `0016_messaging.sql` | `MESSAGE_MAX_LENGTH = 2000` matches `check (char_length(body) between 1 and 2000)` | VERIFIED | Schema line 13; migration constraint in messages table |
| `lib/actions/contact.ts` | `public.contact_log` | blocking INSERT at step 6, before any message_threads INSERT | VERIFIED | Lines 85, 115-117; comment explicitly documents invariant #5 |
| `lib/actions/contact.ts` | `lib/messaging/notify.ts` | `sendAdminContactCopy` called at step 7 (after contact_log, before thread) | VERIFIED | Lines 8, 147-152 |
| `lib/actions/messages.ts` | `lib/messaging/notify.ts` | `sendNewMessageEmail` called after successful message insert | VERIFIED | Lines 7, 136 |
| `lib/messaging/queries.ts` | `profiles_public` | `resolvePublicNames` reads only `id, username, display_name` — never profiles_private | VERIFIED | Lines 150-151 |
| `components/messaging/contact-form-modal.tsx` | `lib/actions/contact.ts` | `submitContact` on form submit; `router.push(/messages/${threadId})` on success | VERIFIED | Lines 15, 85, 89 |
| `app/(public)/listings/[id]/page.tsx` | `profiles_private` | viewer's OWN row via cookie client for prefill (owner RLS) | VERIFIED | Lines 94-110 |
| `components/messaging/thread-view.tsx` | `public.messages` | `supabase.channel('thread:${threadId}').on('postgres_changes', {event:'INSERT', table:'messages', filter: 'thread_id=eq.${threadId}'})` | VERIFIED | Lines 82, 96-101 |
| `components/messaging/thread-view.tsx` | `lib/actions/messages.ts` | `sendMessage` on composer submit (optimistic append) | VERIFIED | Lines 11, 149 |
| `app/(app)/messages/[threadId]/page.tsx` | `lib/messaging/queries.ts` | `getThreadForViewer` + `getThreadMessages` + `markThreadRead` | VERIFIED | Lines 4-5, 37, 43, 56 |
| `components/messaging/report-menu.tsx` | `lib/actions/reports.ts` | `submitReport` called on dialog submit | VERIFIED | Lines 16, 98 |
| `lib/actions/reports.ts` | `lib/messaging/notify.ts` | `sendAdminReportCopy` after successful insert | VERIFIED | Lines 5, 108 |
| `app/(app)/messages/page.tsx` | `lib/messaging/queries.ts` | `getMyThreads` for thread list | VERIFIED | Lines 7, 43 |
| `components/layout/site-header.tsx` | `components/messaging/messages-badge.tsx` | `MessagesBadge` mounted with `userId` | VERIFIED | Lines 6, 39 of site-header.tsx |
| `components/account/message-email-form.tsx` | `profiles_private.message_email_opt_out` | owner-RLS update via server action | VERIFIED | `app/(app)/account/page.tsx` lines 11, 41, 53, 70 |


### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| MSG-01 | 09-05 | Each listing has a "Contact Seller About This Part" action | SATISFIED | `ContactSellerButton` mounted in `listing-detail.tsx`; four render states including non-owner active listing CTA |
| MSG-02 | 09-02, 09-05 | Buyer completes contact form before any thread opens | SATISFIED | `contact-form-modal.tsx` is the sole entry point; `submitContact` enforces contact_log-first at the server action layer |
| MSG-03 | 09-01, 09-02 | Contact form submission persisted + admin copy before chat opens | SATISFIED | Migration 0016 creates `contact_log`; `contact.ts` invariant-#5 ordering: contact_log INSERT → admin copy → thread INSERT |
| MSG-04 | 09-01, 09-04 | Every buyer→seller communication logged for abuse monitoring | SATISFIED | No UPDATE/DELETE policies exist on `messages` or `contact_log` (verified: 0 matching policies); integration test `messaging.test.ts` gates append-only live |
| MSG-05 | 09-02, 09-06, 09-07 | After contact form, private in-site chat thread opens | SATISFIED | `contact.ts` returns `threadId`; modal redirects to `/messages/${threadId}`; thread page + inbox both implemented |
| MSG-06 | 09-01, 09-02, 09-04, 09-06, 09-07 | Messages exchange without exposing seller PII | SATISFIED | `queries.ts` reads only `profiles_public`; `thread-view.tsx` receives only UUIDs/usernames/bodies; `messaging.contract.test.ts` enforces PII denylist |
| MSG-07 | 09-03 | User can report a listing, comment, or message for abuse | SATISFIED | `ReportMenu` mounted on comments, listing page, and per-message in thread-view; exclusive-arc `reports` table with unique-per-item indexes |

**All 7 requirements satisfied. No orphaned requirements detected.**


### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `components/messaging/contact-form-modal.tsx` | 175 | `placeholder="Ask about condition…"` | Info | UI input placeholder — expected, not a stub |
| `components/messaging/report-menu.tsx` | 179, 206 | `placeholder="Select a reason"` / `placeholder="Anything else..."` | Info | UI input placeholders — expected |
| `components/messaging/thread-view.tsx` | 264 | `placeholder="Write a message…"` | Info | UI input placeholder — expected |

No blocker or warning anti-patterns found. All `placeholder` attributes are HTML input hints, not stub implementations.


### Human Verification

The following item required human observation and was approved:

**Full trust spine UAT — APPROVED 2026-06-11**

- Contact form submitted on a live listing
- `contact_log` row verified in Staging database
- Admin notification email received
- Private thread opened at `/messages/[threadId]`
- Second browser (seller session) received message live via Supabase Realtime without page refresh
- Non-participant user confirmed unable to access thread URL
- Block, report, and sold-badge flows confirmed working

Human approval recorded in ROADMAP.md: "full trust spine — contact form → contact_log + admin email → realtime private chat → block/report — user-approved at live two-browser UAT"


### Summary

Phase 9 goal is fully achieved. The trust spine is complete and structurally enforced:

- The `contact_log` INSERT is blocking and precedes every other write — no thread can exist without a contact record (enforced both by application code ordering in `contact.ts` and by the `contact_log_id NOT NULL` FK on `message_threads`).
- Append-only logging is structural, not disciplinary — zero UPDATE/DELETE policies exist on `messages` or `contact_log`.
- Zero PII reaches chat surfaces: identity is resolved exclusively from `profiles_public`; the one sanctioned cross-user `profiles_private` read (email for notifications) lives inside the `server-only` notify module and the resolved email is never returned to any caller.
- All 7 MSG requirements are satisfied and cross-referenced to implementation evidence in the codebase.
- The full live flow was human-approved via two-browser UAT on 2026-06-11.

---

_Verified: 2026-06-11_
_Verifier: Claude (gsd-verifier)_
