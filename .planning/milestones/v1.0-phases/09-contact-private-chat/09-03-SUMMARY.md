---
phase: 09-contact-private-chat
plan: 03
subsystem: messaging
tags: [server-action, rls, rate-limit, dropdown-menu, dialog, rhf, zod, resend, reporting]
requires:
  - phase: 09-contact-private-chat
    provides: "09-01: reports table (exclusive arc + partial unique indexes + RLS), reportSchema/REPORT_REASONS, sendAdminReportCopy"
  - phase: 08-social-layer
    provides: comment-section.tsx (first mount surface), comments.ts action template, social-actions.test.ts mock-builder pattern
provides:
  - submitReport server action (getClaims → zod → 24h rate limit → exclusive-arc insert → best-effort admin email)
  - ReportMenu reusable kebab + report dialog for listing/comment/message targets (09-05/09-06 import it)
  - Report affordance live on every non-own comment (top-level + replies)
affects: [09-05, 09-06, 10-admin-ops]
tech-stack:
  added: []
  patterns:
    - "23505 unique-violation mapped to a FRIENDLY result (already_reported) — structural dedupe is an expected UX path, not an error"
    - "RLS/FK insert rejections collapse to not_found (no existence leak) — message-participant authz lives only in the DB policy"
    - "useForm<z.input, unknown, z.infer> three-generic form for transform-bearing schemas (comment-composer precedent)"
key-files:
  created:
    - lib/actions/reports.ts
    - components/messaging/report-menu.tsx
    - tests/unit/report-actions.test.ts
  modified:
    - components/comments/comment-section.tsx
decisions:
  - "Admin email payload pulls reportId + created_at from the insert's returning row (notify.ts signature requires them); reporter username resolves from profiles_public only — privacy invariant #1"
  - "ReportMenu shows for anon viewers too — the Report item routes to /login (SaveButton login-invite posture) instead of hiding the affordance"
  - "ReportMenu hidden on the viewer's OWN comments (you don't report yourself); kebab right-aligned via ml-auto in the comment header"
  - "No revalidatePath in submitReport — a report changes nothing on screen beyond the toast"
metrics:
  duration: ~9 min
  completed: 2026-06-11
  tasks: 3
  files: 4
---

# Phase 9 Plan 03: Abuse Reporting (MSG-07) Summary

**One-liner:** submitReport action with exclusive-arc target mapping, friendly 23505 dedupe and best-effort admin email, plus a reusable ReportMenu kebab/dialog first mounted on every non-own comment.

## What was built

1. **`lib/actions/reports.ts` — submitReport** (comments.ts posture). Guard order: getClaims → reportSchema → 24h head-count rate limit (`REPORT_DAILY_LIMIT = 10`) → self-attributed insert into the mapped exclusive-arc column (listing_id / comment_id / message_id). Postgres 23505 (partial unique index) returns `already_reported`; any other rejection (FK miss, RLS message-participant policy) collapses to `not_found` with no existence leak. On success, `sendAdminReportCopy` fires best-effort with the reporter's username from `profiles_public` and the returned `id`/`created_at`.
2. **`components/messaging/report-menu.tsx` — ReportMenu**. Ghost `MoreHorizontal` kebab → single "Report" DropdownMenu item (anon → `/login`, SaveButton invite posture) → Dialog with RHF + `zodResolver(reportSchema)`: reason Select from `REPORT_REASONS`, optional 1000-char detail Textarea, Cancel + "Submit report" (disabled while pending). Result-mapped sonner toasts; dialog closes on success and on already_reported. Dumb/reusable — zero target-specific logic, ready for 09-05 (listing) and 09-06 (message) imports.
3. **Comment mount**. Every top-level comment AND reply that isn't the viewer's own shows the kebab, right-aligned in the header (`ml-auto`); delete/reply affordances untouched.

## Verification

- `npx vitest run tests/unit/report-actions.test.ts` — 10/10 green (guard order, exclusive-arc mapping for all three targets, 23505 → already_reported, email only after successful insert, rate-limit branch inserts nothing).
- Full `npm run test` — 38 files, 262 passed / 1 skipped.
- `npm run build` exits 0; `grep ReportMenu components/comments/comment-section.tsx` and `grep submitReport components/messaging/report-menu.tsx` both hit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Three-generic useForm typing for transform-bearing reportSchema**
- **Found during:** Task 2 (typecheck failed: `zodResolver` input/output mismatch from the `detail` ""→undefined transform)
- **Fix:** `useForm<z.input<typeof reportSchema>, unknown, ReportInput>` — the established comment-composer/listing-form precedent
- **Files modified:** components/messaging/report-menu.tsx
- **Commit:** d37a909

**2. [Rule 3 - Blocking] sendAdminReportCopy signature wider than the plan's sketch**
- **Found during:** Task 1
- **Issue:** Plan sketched `sendAdminReportCopy({ reporterUsername, targetType, targetId, reason, detail })` but the 09-01 implementation also requires `reportId` and `createdAt`
- **Fix:** insert chain selects `id, created_at` and passes both through
- **Files modified:** lib/actions/reports.ts
- **Commit:** 6308f1e

Transient parallel-wave noise (a typecheck error inside 09-02's in-flight `lib/messaging/notify.ts` edit and one transient full-suite failure) resolved on re-run — out of scope, nothing fixed or deferred.

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 | 6308f1e | submitReport action + unit test |
| 2 | d37a909 | reusable ReportMenu kebab + dialog |
| 3 | 800dbb4 | mount on non-own comments |

## Self-Check: PASSED
