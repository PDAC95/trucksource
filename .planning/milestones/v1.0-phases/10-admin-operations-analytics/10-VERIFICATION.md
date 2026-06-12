---
phase: 10-admin-operations-analytics
verified: 2026-06-12T00:00:00Z
status: passed
score: 3/3 must-haves verified
re_verification: false
---

# Phase 10: Admin Operations & Analytics Verification Report

**Phase Goal:** Operators can run and measure the marketplace — managing users, listings, reports (with enforcement), messages, categories, and the fitment library through a service-role-isolated console, and seeing analytics including most-searched makes/models. This also provides the bulk-onboarding tooling that mitigates two-sided cold start.
**Verified:** 2026-06-12
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin can view and manage users and listings, manage part categories, and manage the full fitment library (makes, models, configs, terms, categories, materials, conditions, filters) | VERIFIED | `app/admin/users/`, `app/admin/listings/`, `app/admin/fitment/[level]/page.tsx` (190 lines), taxonomy CRUD in `lib/actions/admin/taxonomy.ts`; all 8 levels carry `is_active` via migration 0019 lines 175-182 |
| 2 | Admin can view and act on abuse reports through a queue with enforcement actions, and can monitor messages/contact logs | VERIFIED | `app/admin/reports/page.tsx` (201 lines) + `app/admin/reports/[targetKey]/page.tsx` (326 lines); `lib/actions/admin/reports.ts` with `closeReportGroup`; `app/admin/messages/page.tsx` with thread freeze and contact log tab; `lib/admin/messaging-queries.ts` includes `thread_content_access` audit before any content is returned |
| 3 | Analytics shows registered/active users, active and most-viewed listings, most-searched makes and models, messages sent, and monthly growth | VERIFIED | `lib/admin/analytics.ts` (257 lines): `getUserStats` (ADMA-01), `getListingStats`/`admin_top_viewed_listings` (ADMA-02), `getSearchRankings` with `admin_top_search_makes`/`admin_top_search_models` (ADMA-03), `getMessageStats`/`getGrowthSeries` (ADMA-04); all wired into `app/admin/page.tsx` with `getDashboardData` |

**Score:** 3/3 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0019_admin_operations.sql` | Enforcement/audit schema, listing moderation, thread freeze, taxonomy is_active, analytics indexes, admin_user_activity_stats RPC | VERIFIED | 213 lines; all 9 sections present; `user_restrictions`, `admin_audit_log`, `hidden_at`/`hidden_reason`, `frozen_at`/`frozen_by`, `is_active` on all 8 taxonomy tables, security definer RPC |
| `supabase/migrations/0022_analytics_helpers.sql` | Admin analytics RPCs (top_viewed, top_search_makes/models/terms, monthly_growth) | VERIFIED | 183 lines; all 5 RPCs present; REVOKE execute from anon/authenticated on each |
| `supabase/migrations/0023_search_security_definer.sql` | Definer-izes search_listings + EXPLAIN helpers with visibility predicate in-body | VERIFIED | 138 lines; `security definer set search_path = ''` confirmed; closes the FTS GIN gate failure from 0019 RLS qual |
| `supabase/migrations/0024_search_slang_target_expansion.sql` | Third keyword arm: admin slang resolves via search_term_targets to listing_fitment | VERIFIED | 130 lines; third arm present joining `search_terms` → `search_term_targets` → `listing_fitment`; both slang arms gate on `st.is_active` |
| `scripts/grant-admin.mjs` | Manual admin flag script writing app_metadata.role = 'admin' | VERIFIED | 82 lines; `--revoke` flag present; `grant:admin` npm script in package.json line 18 |
| `lib/admin/auth.ts` | `requireAdmin()` — the ONE admin gate using getClaims | VERIFIED | 26 lines; `import "server-only"`; uses `getClaims()` (not getSession); returns `{ adminId }` or calls `notFound()` |
| `lib/admin/audit.ts` | `logAdminAction()` — the ONE audit writer with full AdminAction union | VERIFIED | 71 lines; `import "server-only"`; full 19-action union; throws on insert failure |
| `app/admin/layout.tsx` | Force-dynamic gated console shell | VERIFIED | `export const dynamic = "force-dynamic"`; calls `requireAdmin()`; renders AdminSidebar + main |
| `app/admin/page.tsx` | Analytics dashboard with real data | VERIFIED | Calls `requireAdmin()`, `getDashboardData(range)`, renders `KpiCards`, `TrendChart`, `RankingList` — not a placeholder |
| `lib/actions/admin/enforcement.ts` | warnUser/suspendUser/banUser/reactivateUser/renameUsername | VERIFIED | All 5 functions present; each calls `requireAdmin()` then `logAdminAction()` |
| `lib/actions/admin/listings.ts` | hideListing/restoreListing/removePhoto/bulkPublish | VERIFIED | All 4 actions present; requireAdmin + logAdminAction pattern on every function |
| `lib/actions/admin/reports.ts` | resolveReportGroup/dismissReportGroup | VERIFIED | Group-close semantics present; requireAdmin + logAdminAction; 23505 dedup path |
| `lib/actions/admin/threads.ts` | freezeThread/unfreezeThread | VERIFIED | Both actions present; requireAdmin + logAdminAction; `frozen_at is null` idempotence guard |
| `lib/actions/admin/taxonomy.ts` | createTaxonomyValue/updateTaxonomyValue/setTaxonomyActive/deleteTaxonomyValue | VERIFIED | All 4 operations; requireAdmin + logAdminAction; FK-23503 error surfaced as "in use — deactivate instead" |
| `lib/admin/analytics.ts` | All ADMA-01..04 read functions | VERIFIED | 257 lines; getUserStats/getListingStats/getSearchRankings/getMessageStats/getGrowthSeries/getDashboardData all substantive |
| `lib/admin/import.ts` | CSV bulk import core with EXIF gate | VERIFIED | `import "server-only"`; `stripAndReencode()` wired on every photo URL; per-row independent error isolation |
| `app/api/admin/import/route.ts` | CSV import route handler | VERIFIED | 85 lines; `requireAdmin()` called first; Papa Parse + row processor |
| `app/(app)/suspended/page.tsx` | Suspended user blocked page | VERIFIED | Calls `getOwnRestriction()`; redirects home if not restricted |
| `lib/account/restrictions.ts` | getOwnRestriction() with lazy-expiry | VERIFIED | Exists and is used in both `app/(app)/layout.tsx` and `suspended/page.tsx` |
| `.github/workflows/ci.yml` | Service-role key bundle scan step | VERIFIED | Line 27: `"! grep -r \"SUPABASE_SERVICE_ROLE_KEY\" .next/static"` present as a named CI step |
| `tests/integration/admin-moderation.test.ts` | Hidden/draft structural exclusion regression | VERIFIED | 149 lines; tests hidden_at moderation and draft status excluded from anon reads, owner-visible |
| `tests/unit/csv-import.test.ts` | CSV import EXIF gate re-verification | VERIFIED | 222 lines; explicit EXIF gate on the import photo path, GPS-laden JPEG must exit with zero GPS |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/admin/auth.ts` | `supabase.auth.getClaims()` | verified JWT app_metadata.role check | WIRED | `getClaims()` call on line 20; `app_metadata.role` check line 22; never `getSession()` |
| `lib/admin/audit.ts` | `admin_audit_log` | `createAdminClient().from('admin_audit_log').insert` | WIRED | Line 57: `.from("admin_audit_log").insert(...)` |
| `lib/actions/admin/enforcement.ts` | `user_restrictions` + `listings.hidden_at` | service-role upsert + listing hide/restore | WIRED | Pattern `hidden_reason.*suspension` confirmed; every enforcement function calls `requireAdmin` + `logAdminAction` |
| `app/(app)/layout.tsx` | `user_restrictions` | `getOwnRestriction()` self-RLS read | WIRED | Line 36: `const restriction = await getOwnRestriction()` |
| `listings SELECT policy` | `hidden_at` / `status` | 0019 replaced public-read policy | WIRED | Migration 0019 line 114: `(hidden_at is null and status <> 'draft')` as the new public-read arm |
| `messages INSERT policy` | `user_restrictions` + `message_threads.frozen_at` | 0019 extended policy with check arms | WIRED | Migration 0019 lines 131-160: frozen_at is null + restriction check arms |
| `app/(app)/messages/page.tsx` split-pane | `frozen_at` + restriction | `sendDisabled` mirrors RLS arms | WIRED | Lines 130-144: `frozen_at` check first, then restriction, then block — UAT gap fixed in commit 5c77ef2 |
| `search_listings` RPC | `hidden_at is null and status = 'active'` | SECURITY DEFINER with in-body predicate | WIRED | Migration 0023 lines 53/131: `security definer set search_path = ''` with visibility predicate baked in |
| Admin-created slang | `listing_fitment` via `search_term_targets` | Third keyword arm in `search_listings` | WIRED | Migration 0024 lines 61-80: third arm joins `search_terms` → `search_term_targets` → `listing_fitment` |
| `lib/supabase/admin.ts` | `SUPABASE_SERVICE_ROLE_KEY` | server-only module, never NEXT_PUBLIC | WIRED | File comment line 5 confirms no NEXT_PUBLIC prefix; CI scan gates client bundles |
| Thread content access | `admin_audit_log` | `logAdminAction(thread_content_access)` before returning content | WIRED | `lib/admin/messaging-queries.ts` line 167: action `"thread_content_access"` logged before content returned |

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|---------|
| ADMO-01 | Admin can view and manage users | SATISFIED | `app/admin/users/` + `lib/actions/admin/enforcement.ts` (warn/suspend/ban/reactivate/rename); `lib/admin/queries.ts` getAdminUsers/getAdminUserDetailWithPII |
| ADMO-02 | Admin can view and manage listings | SATISFIED | `app/admin/listings/` + `lib/actions/admin/listings.ts` (hide/restore/photo-remove/bulk-publish); `lib/admin/listings-queries.ts` |
| ADMO-03 | Admin can view and act on reports (abuse queue with enforcement actions) | SATISFIED | `app/admin/reports/` + `lib/actions/admin/reports.ts`; grouped per-target queue; resolve/dismiss with note; enforcement wired separately per locked design |
| ADMO-04 | Admin can monitor messages/contact logs | SATISFIED | `app/admin/messages/page.tsx` (thread metadata list + freeze + contact log); `lib/actions/admin/threads.ts` (freeze/unfreeze); `lib/admin/messaging-queries.ts` (thread content access audited) |
| ADMO-05 | Admin can manage part categories | SATISFIED | `app/admin/fitment/[level]/page.tsx` covers part_categories level; `lib/actions/admin/taxonomy.ts` create/update/setActive/delete; FK-guard for in-use values |
| ADMO-06 | Admin can manage the fitment library (makes, models, configs, terms, categories, materials, conditions, filters) | SATISFIED | All 8 taxonomy tables have `is_active` (migration 0019 lines 175-182); `lib/admin/taxonomy-config.ts` maps all 8 levels; admin slang editor in `components/admin/slang-editor.tsx`; 0024 ensures new slang finds listings via search_term_targets |
| ADMA-01 | Admin analytics shows registered users and active users | SATISFIED | `getUserStats()` → `admin_user_activity_stats()` RPC (0019 §9); renders in KpiCards on dashboard |
| ADMA-02 | Admin analytics shows active listings and most-viewed listings | SATISFIED | `getListingStats()` → `admin_top_viewed_listings()` RPC (0022 §1); top-10 most-viewed with range filter |
| ADMA-03 | Admin analytics shows most-searched makes and most-searched models | SATISFIED | `getSearchRankings()` → `admin_top_search_makes()` + `admin_top_search_models()` RPCs (0022 §2-3); rendered in RankingList components |
| ADMA-04 | Admin analytics shows messages sent and monthly growth | SATISFIED | `getMessageStats()` counts messages table in range; `getGrowthSeries()` → `admin_monthly_growth()` RPC (0022 §5); rendered as TrendChart + growth % KPI |

All 10 Phase 10 requirements satisfied. Zero orphaned requirements.

---

### Cross-Cutting Gates

| Gate | Status | Evidence |
|------|--------|---------|
| Privacy/RLS — service-role key server-only | VERIFIED | `lib/supabase/admin.ts` uses `SUPABASE_SERVICE_ROLE_KEY` (no NEXT_PUBLIC prefix); CI scan step in `.github/workflows/ci.yml` line 27 gates client bundles |
| Privacy/RLS — admin tables default-deny | VERIFIED | `admin_audit_log` has zero RLS policies (service-role-only both directions); `user_restrictions` has one self-select policy only; migration 0019 |
| Privacy/RLS — all admin routes force-dynamic | VERIFIED | Every page under `app/admin/` has `export const dynamic = "force-dynamic"` — 14 route segments confirmed |
| EXIF gate re-verified on CSV import path | VERIFIED | `lib/admin/import.ts` calls `stripAndReencode()` on every fetched photo URL before Storage write; `tests/unit/csv-import.test.ts` (222 lines) gates this path with a GPS-laden JPEG |
| Phase 9 realtime regression | VERIFIED | UAT step I.24 confirmed instant delivery both directions after freeze/unfreeze; split-pane composer `sendDisabled` now mirrors all RLS INSERT arms (commit 5c77ef2) |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/actions/admin/listings.ts` | 72 | `// TODO(10-08): notify the seller via the enforcement email helper` | Info | Comment left from plan 10-03 soft dependency note; listing hide is fully audited and functional without seller email notification; no security or correctness gap. The moderation action completes with full audit log. Seller email notification for listing moderation hide is not a named requirement in ADMO-02. |

No blocking or warning anti-patterns. The single TODO is an informational comment for a non-required feature enhancement.

---

### Human Verification

**Not required.** The stakeholder completed a 24-step live UAT walkthrough on Staging on 2026-06-12 and approved the full console. Two bugs found during UAT were fixed forward immediately (commits 5c77ef2 and 895e7a5, migration 0024 applied to Staging). All ROADMAP Phase 10 success criteria 1-3 were observed true live.

The following items were confirmed during UAT and do not require re-verification:
- A. /admin returns 404 for anon and non-admin users
- B. Full enforcement ladder (warn/suspend/ban/reactivate/rename) verified live with audit log rows + blocked page
- C. Listing hide/restore + photo removal verified in Storage
- D. Report queue grouping, resolve-with-note, and audited thread content access
- E. Thread freeze blocks both sides structurally; split-pane composer mirrors freeze/restriction
- F. Fitment library CRUD; new slang found listings after 0024 fix; deactivate/delete FK-guard
- G. Analytics KPIs/rankings/growth with real data; preset switching correct
- H. CSV import: per-row failure report, corrected re-upload, bulk-publish, imported photos zero EXIF/GPS
- I. Phase 9 realtime regression: instant delivery both directions

---

### Gaps Summary

None. All 3 observable truths verified, all 10 requirements satisfied, all key links wired, all cross-cutting gates green, no blocking anti-patterns. Phase 10 is the final phase of v1 — the milestone is complete.

---

_Verified: 2026-06-12_
_Verifier: Claude (gsd-verifier)_
