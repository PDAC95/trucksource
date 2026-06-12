---
phase: 10-admin-operations-analytics
plan: 02
subsystem: admin
tags: [admin, auth, audit, rls, ci, getClaims, service-role]
requires:
  - phase: 01-foundation-privacy
    provides: lib/supabase/server.ts createClient + lib/supabase/admin.ts createAdminClient
  - phase: 10-admin-operations-analytics (10-01)
    provides: admin_audit_log table (migration 0019) + grant-admin script (runtime dependency only)
provides:
  - requireAdmin() — the ONE admin gate (getClaims app_metadata.role, 404 for non-admins)
  - logAdminAction() + AdminAction union — the ONE audit writer (throws on insert failure)
  - app/admin gated force-dynamic layout with the locked sidebar (Wave-2 plans mount pages inside it)
  - CI step failing if SUPABASE_SERVICE_ROLE_KEY appears in .next/static
affects: [10-03, 10-04, 10-05, 10-06, 10-07, 10-08, 10-09, 10-10]
tech-stack:
  added: []
  patterns:
    - "app_metadata.role admin flag read via getClaims() — zero extra queries, user-tamper-proof"
    - "notFound() gate — console existence never advertised to non-admins"
    - "audit write throws — unaudited admin actions cannot silently succeed"
key-files:
  created:
    - lib/admin/auth.ts
    - lib/admin/audit.ts
    - app/admin/layout.tsx
    - app/admin/page.tsx
    - components/admin/admin-sidebar.tsx
  modified:
    - .github/workflows/ci.yml
key-decisions:
  - "Mobile fallback for the admin sidebar is a horizontally scrollable top bar (same component, responsive classes) — no Sheet state needed"
  - "Categories sidebar link points at /admin/fitment/part_categories (level 5 of the taxonomy) per research discretion call; active-state logic keeps Fitment Library from lighting up on that sub-route"
  - "Removed app/admin/.gitkeep now that the directory has real files"
metrics:
  duration: ~8 min
  tasks: 3
  files: 6
  completed: 2026-06-11
---

# Phase 10 Plan 02: Admin Console Shell Summary

**One-liner:** requireAdmin() gate on verified JWT app_metadata.role + throwing logAdminAction() audit writer + gated force-dynamic /admin shell with the locked 7-item sidebar, plus a CI grep gate proving the service-role key never reaches client chunks.

## What was built

- **lib/admin/auth.ts** — `requireAdmin(): Promise<{ adminId: string }>`. `server-only`; `createClient()` → `auth.getClaims()` (never getSession, invariant #6) → reads `claims.app_metadata.role`; missing sub or role !== 'admin' → `notFound()` (404, no login hint). Comment documents the anti-pattern guard: every admin Server Action / route handler must call it too — the layout is UX only.
- **lib/admin/audit.ts** — `logAdminAction(entry)` inserts into default-deny `admin_audit_log` via `createAdminClient()`; **throws** on insert failure. Exports the locked 19-value `AdminAction` union (listing_hide … bulk_publish) plus `AdminAuditEntry` with target_type union and text target_id.
- **app/admin/layout.tsx** — `force-dynamic`, awaits `requireAdmin()`, renders sticky 56-wide left sidebar (md+) + main slot.
- **components/admin/admin-sidebar.tsx** — client component, usePathname active-link highlighting, locked order: Dashboard, Users, Listings, Reports, Messages, Categories (/admin/fitment/part_categories), Fitment Library, then CSV Import + Back to site. Collapses to a horizontal scroll bar at mobile widths.
- **app/admin/page.tsx** — minimal force-dynamic "Analytics dashboard" placeholder (skeleton cards); 10-06 rewrites the body.
- **.github/workflows/ci.yml** — new step "service-role key never in client bundle" after the existing `npm run build`: `! grep -r "SUPABASE_SERVICE_ROLE_KEY" .next/static`.

## Verification

- `npm run typecheck` clean after Task 1.
- `npm run build` clean; route table shows `/admin` as ƒ (dynamic).
- `! grep -r "SUPABASE_SERVICE_ROLE_KEY" .next/static` passes on the fresh build.
- Both lib/admin modules `import "server-only"`.
- Runtime admin-sees-shell check depends on 10-01's grant-admin script + re-login; gate logic structurally verified (claims absent or role mismatch → notFound).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 7bf8d2d | requireAdmin() + logAdminAction() helpers |
| 2 | 9407fb6 | Gated admin layout + locked sidebar + placeholder dashboard |
| 3 | 0cab3e2 | CI service-role bundle-scan gate |

## Deviations from Plan

None - plan executed exactly as written. (Minor housekeeping: deleted the placeholder `app/admin/.gitkeep` in Task 2's commit.)

## Self-Check: PASSED

All 6 artifacts present on disk; commits 7bf8d2d, 9407fb6, 0cab3e2 verified in git log.
