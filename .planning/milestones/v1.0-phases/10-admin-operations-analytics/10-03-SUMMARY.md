---
phase: 10-admin-operations-analytics
plan: 03
subsystem: admin
tags: [admo-01, enforcement, suspension, ban, audit, email, privacy, lazy-expiry]
requires:
  - "10-01: user_restrictions (self-read RLS, zero write policies) + listings.hidden_at/hidden_reason + messages INSERT not-restricted arm (migration 0019)"
  - "10-02: requireAdmin() gate + logAdminAction() audit writer + admin layout/sidebar"
  - "Phase 1: profiles_public / profiles_private split + 0001 username rename trigger"
provides:
  - "/admin/users — searchable user list (username OR email search, zero PII columns) with restriction badges"
  - "/admin/users/[id] — PII detail view (getAdminUserDetailWithPII) + enforcement action buttons"
  - "warnUser / suspendUser / banUser / reactivateUser / renameUsername server actions (audited + emailed)"
  - "getOwnRestriction() with cron-free lazy-expiry sweep (lib/account/restrictions.ts)"
  - "App-wide suspension gate in app/(app)/layout.tsx + /suspended page + read-only chat composer"
affects:
  - "10-08 reports queue (enforcement actions are the resolution levers)"
  - "Phase-10 UAT (suspend/reactivate flow is the trust-spine verification path)"
tech-stack:
  added: []
  patterns:
    - "PII boundary by function name: getAdminUserDetailWithPII is the ONLY profiles_private join — misuse on a public surface is self-evidently wrong"
    - "gate-in-the-action: every enforcement action calls requireAdmin() itself; the admin layout is UX only"
    - "lazy expiry: restricted = banned OR suspended_until > now(); expired rows swept inline by the next own-restriction read (no cron)"
    - "hidden_reason as restore selector: 'suspension'/'ban'/'moderation' partition who may un-hide a listing"
key-files:
  created:
    - lib/admin/queries.ts
    - app/admin/users/page.tsx
    - app/admin/users/[id]/page.tsx
    - lib/actions/admin/enforcement.ts
    - lib/admin/email.ts
    - components/admin/enforcement-dialogs.tsx
    - lib/account/restrictions.ts
    - app/(app)/suspended/page.tsx
    - components/account/suspended-screen.tsx
  modified:
    - app/(app)/layout.tsx
    - app/(app)/messages/[threadId]/page.tsx
    - lib/messaging/queries.ts
    - lib/supabase/middleware.ts
    - tests/integration/messaging.contract.test.ts
decisions:
  - "Email search resolves ids via profiles_private FIRST, then fetches public rows — email never appears in the list payload"
  - "logAdminAction throws on failure → an unaudited enforcement action cannot silently succeed; email is best-effort (try/catch swallow, audit row is the record)"
  - "Self-suspend/self-ban blocked in the action (adminId === userId guard)"
  - "Admin rename clears username_changed_at before updating so the user's 30-day self-rename cooldown can never block moderation; the trigger re-stamps it after"
  - "Suspension gate renders SuspendedScreen in the (app) layout (not a redirect) so deep links can't bypass; suspended (not banned) users keep READ access to /messages per locked decision"
  - "Lazy sweep restores ONLY hidden_reason='suspension' rows; 'moderation' and 'ban' rows are untouchable from the sweep"
  - "Frozen-thread state (message_threads.frozen_at) rendered read-only now; the freeze action itself shipped in 10-07"
metrics:
  duration: "~25 min execution + post-crash verification close-out"
  completed: "2026-06-11"
---

# Phase 10 Plan 03: User Management & Enforcement (ADMO-01) Summary

**One-liner:** Full admin enforcement ladder (warn/suspend/ban/reactivate/rename — audited + emailed) with PII-boundaried user list/detail views, plus the user-side suspension UX: app-wide blocked screen, read-only chats, listing hide/restore, and cron-free lazy expiry.

## What Was Built

### Task 1 — Admin users list + PII detail (`lib/admin/queries.ts`, `app/admin/users/*`) — commit `60b02f1`
- `getAdminUsers({ q, page })`: service-role read of profiles_public + restriction-state merge; `q` matches username `ilike` OR email (ids resolved via profiles_private, email never returned). **Zero PII columns in the list query** (Pitfall 7).
- `getAdminUserDetailWithPII(id)`: the only helper that joins profiles_private — first/last name, email, phone + verification status + restriction row + listing/report counts. Named so reuse on a public surface is self-evidently wrong.
- `/admin/users` (force-dynamic): GET search form, table with restriction badges (Active / Suspended until X / Banned), row links to detail. `/admin/users/[id]`: PII card, restriction card, recent listings, enforcement dialogs.

### Task 2 — Enforcement actions + email (`lib/actions/admin/enforcement.ts`, `lib/admin/email.ts`, `components/admin/enforcement-dialogs.tsx`) — files on disk; commit cross-attributed (see Deviations)
- Every action: `requireAdmin()` IN the action → zod validate → service-role writes → `logAdminAction` (throws) → `sendEnforcementEmail` (best-effort) → `revalidatePath`.
- `suspendUser` (24h/7d/30d presets): upserts user_restrictions + hides visible listings with `hidden_reason='suspension'`. `banUser`: state banned, hides with `'ban'` (overwriting `'suspension'` rows). `reactivateUser`: deletes the row and restores ONLY the reason matching the prior state — `'moderation'` rows never touched. `warnUser`: audit + email only. `renameUsername`: canonical USERNAME_REGEX + reserved-name check, clears the 30-day trigger guard first, 23505 → "already taken".
- `lib/admin/email.ts` clones the messaging notify posture: raw fetch to api.resend.com, escapeHtml on all interpolations, swallow-on-failure, Staging delivery restriction documented in a comment.
- `enforcement-dialogs.tsx`: suspend dialog with three duration radios + required reason; ban/warn/reactivate/rename dialogs; sonner toasts; all copy English.

### Task 3 — Suspension UX (`lib/account/restrictions.ts`, `app/(app)/layout.tsx`, `app/(app)/suspended/page.tsx`, messaging) — commit `2872527`
- `getOwnRestriction()`: self-RLS read via the cookie-bound client; restricted iff banned OR `suspended_until > now()`. Expired suspension → inline service-role sweep (delete row + restore `'suspension'`-hidden listings) then returns null — no cron dependency (Pitfall 3; pg_cron is unscheduled on Staging).
- `(app)` layout gate: restricted users get `SuspendedScreen` rendered in place of children (deep links can't bypass); suspended-not-banned users keep read access to `/messages` with minimal chrome. `/suspended` is the canonical page. Logout available from the blocked screen.
- Read-only chat: the thread composer is replaced with "You can't send messages while your account is suspended." when restricted, and "This conversation has been closed by moderation." for either participant when `message_threads.frozen_at` is set (rendering off the 0019 column; freeze action ships in 10-07 — which it did). Structural send-block is the 0019 messages INSERT policy.

## Verification

- `npm run typecheck` — clean.
- `npm run build` — clean; `/admin/users`, `/admin/users/[id]`, `/suspended` all present, app routes dynamic.
- All plan artifacts confirmed on disk with required exports (`suspendUser`, `banUser`, `reactivateUser`, `warnUser`, `renameUsername`; `getOwnRestriction`; `getAdminUsers` + `getAdminUserDetailWithPII`).
- Key links confirmed: enforcement.ts → user_restrictions + `hidden_reason='suspension'` updates; (app)/layout.tsx → self-RLS user_restrictions read; every action → `logAdminAction`.

## Deviations from Plan

### Execution interruption (process, not code)
The original executor completed all 3 tasks and both feature commits, then died on an API error BEFORE writing this SUMMARY and updating state. This close-out agent re-verified every artifact on disk, re-ran typecheck + build, and wrote the docs. No code changes were needed.

### Commit cross-attribution (known pre-commit hook issue)
Task 2's files (`lib/actions/admin/enforcement.ts`, `lib/admin/email.ts`, `components/admin/enforcement-dialogs.tsx`, plus the detail-page dialog wiring) were swept into 10-07's docs commit `63e4bad` by the husky/lint-staged stash/restore race during parallel wave execution (documented in project memory and deferred-items). Content verified on disk — correct and complete. Verify this plan by file-on-disk, not commit message.

Otherwise: plan executed as written.

## Commits

| Commit | Scope |
| ------ | ----- |
| `60b02f1` | feat(10-03): admin users list + PII detail view (Task 1) |
| `63e4bad` | (cross-attributed under docs(10-07)) enforcement actions + email + dialogs (Task 2) |
| `2872527` | feat(10-03): suspension UX — blocked page, lazy expiry, read-only chat (Task 3) |

## Self-Check: PASSED

- All key files exist on disk (queries.ts, enforcement.ts, email.ts, enforcement-dialogs.tsx, restrictions.ts, suspended page, users pages).
- Commits `60b02f1`, `2872527`, `63e4bad` exist in history.
- typecheck + build green.
