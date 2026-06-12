---
phase: 10-admin-operations-analytics
plan: 10
subsystem: admin
tags: [uat, verification, rls, security-definer, pg_trgm, search, realtime, exif]

# Dependency graph
requires:
  - phase: 10-admin-operations-analytics (plans 10-01..10-09)
    provides: the complete admin console (users/listings/reports/messages/fitment library/CSV import) + analytics dashboard on the 0019 substrate
provides:
  - Stakeholder-approved final UAT — all 24 walkthrough steps green on Staging; Phase 10 and v1 CLOSED
  - Migration 0023_search_security_definer.sql — search RPCs definer-ized so the FTS/trigram GIN gates pass under the 0019 listings RLS qual
  - Migration 0024_search_slang_target_expansion.sql — search_listings third keyword arm: admin-created slang resolves via search_term_targets (make/model/config arc) to listing_fitment
  - Desktop split-pane composer mirrors freeze/restriction RLS arms (UI honesty fix)
affects: [post-v1 redesign phase, launch checklist, any future search/slang work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Definer-ized search RPCs must repeat the RLS visibility predicate in-body (Pitfall 2, same posture as active_listing_count)"
    - "Slang expansion arms always filter st.is_active — admin deactivation must bite in search immediately"

key-files:
  created:
    - supabase/migrations/0023_search_security_definer.sql
    - supabase/migrations/0024_search_slang_target_expansion.sql
  modified:
    - supabase/migrations/0022_analytics_helpers.sql (renamed from duplicate 0020_ prefix)
    - app/(app)/messages/page.tsx

key-decisions:
  - "search_listings/explain helpers definer-ized (visibility predicate repeated in-body) — non-leakproof @@ cannot use the GIN index under the 0019 RLS qual; closes the deferred FTS gate failure"
  - "Admin slang reaches search through a third keyword arm resolving search_terms by similarity then matching listing_fitment via search_term_targets — listings need no re-tagging when slang is added"
  - "Both slang arms now require st.is_active = deactivating a term removes it from search instantly"
  - "UX observations (sell entry point, stale-tab freeze notice, vitest-* term pollution) deferred to the planned post-v1 redesign phase, not Phase 10 gaps"

patterns-established:
  - "UI send-disabled logic must mirror every RLS INSERT arm (freeze + restriction), in every composer instance — RLS blocking alone leaves dishonest UI"

requirements-completed: [ADMO-01, ADMO-02, ADMO-03, ADMO-04, ADMO-05, ADMO-06, ADMA-01, ADMA-02, ADMA-03, ADMA-04]

# Metrics
duration: gate sweep + live stakeholder UAT (2026-06-11 → 2026-06-12)
completed: 2026-06-12
---

# Phase 10 Plan 10: Final UAT Summary

**Stakeholder-approved 24-step walkthrough of the full admin console + analytics on Staging closes Phase 10 and v1 — two UAT gaps fixed forward (split-pane freeze mirror, slang→taxonomy search expansion via migration 0024).**

## Performance

- **Duration:** automated gate sweep (2026-06-11) + live stakeholder UAT (2026-06-12)
- **Tasks:** 2/2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 5 (2 new migrations, 1 rename, 1 UI fix, deferred-items.md)

## Accomplishments

- **All 24 UAT steps passed; stakeholder typed "approved".** ROADMAP Phase 10 success criteria 1-3 observed true live on Staging.
- **Automated gate sweep green** (Task 1, commit `a0cbc05`): typecheck + lint + build clean; `SUPABASE_SERVICE_ROLE_KEY` absent from `.next/static`; full test suite green; every `app/admin` route dynamic; every exported `lib/actions/admin/*` function calls `requireAdmin` AND `logAdminAction`. Closed the two deferred items: definer-ized search RPCs (migration 0023 — the 0019-induced FTS GIN gate failure) and deduped the duplicate `0020_` migration prefix (analytics helpers → `0022_`).
- **Cross-cutting gates re-verified at UAT:** imported CSV photos confirmed webp with zero EXIF/GPS; Phase 9 realtime regression green (instant delivery both directions after unfreeze); thread content access audited (2 `thread_content_access` rows) and refused for non-reported threads.

## UAT Walkthrough Record (all PASSED)

- **A. Access:** `/admin` 404 for anon and non-admin; full console for admin (pdmckinster@gmail.com, JWT refreshed after re-login).
- **B. Users/enforcement:** PII detail; warn (email delivered + `warn_user` audit row); suspend 24h (blocked page with date+reason, read-only chat with banner); reactivate; rename username propagated everywhere.
- **C. Listings:** hide/restore (anon search + direct URL 404, `listing_hide`/`listing_restore` audit rows); individual photo removal verified deleted from Storage (`photo_remove` audit row with path).
- **D. Reports:** structural per-user dedupe (reports.ts 23505 path); grouping verified with a second reporter (one entry, counter 2, two reasons); group resolve with note (`report_resolve` audit row); message report → audited thread content view; non-reported thread content access rejected.
- **E. Messages:** metadata-only threads tab; freeze blocks both sides (structural via RLS); contact logs with filters.
- **F. Fitment Library:** new slang term found listings via search after the 0024 fix; deactivate/reactivate condition cycle; FK-guarded delete shows "In use — deactivate instead". Materials absent from listing form/search facets is the LOCKED v1 deferral (facet-sidebar.tsx comment), not a gap.
- **G. Analytics:** KPIs/rankings/growth chart with real data; presets 7/30/90/all switch labels and windows correctly (identical numbers expected — all Staging data <9 days old).
- **H. CSV import:** mixed-file run produced per-row failure report (bad seller "seller not found", bad photo URL fetch 404/400); corrected re-upload imported 2 drafts; bulk-publish via `/admin/listings?status=draft`; published listings live in anon search; Contact Seller → chat reached the real seller; imported photos verified webp, zero EXIF/GPS.
- **I. Realtime regression:** messages delivered instantly both directions after unfreeze.

## Task Commits

1. **Task 1: Automated gate sweep** - `a0cbc05` (fix: definer-ize search RPCs via 0023, dedupe migration prefix 0020→0022)
2. **Task 2: Stakeholder UAT** - approved live; two fix-forward commits during the walkthrough: `5c77ef2`, `895e7a5` (see Deviations)

## Files Created/Modified

- `supabase/migrations/0023_search_security_definer.sql` - definer-izes search_listings + EXPLAIN helpers with the RLS visibility predicate repeated in-body (applied to Staging via `db query --linked -f`)
- `supabase/migrations/0024_search_slang_target_expansion.sql` - third keyword arm: p_q resolved against active search_terms by similarity, matched to listing_fitment through search_term_targets (applied to Staging)
- `supabase/migrations/0022_analytics_helpers.sql` - renamed from duplicate `0020_` prefix
- `app/(app)/messages/page.tsx` - desktop split-pane sendDisabled now honors frozen_at + viewer restriction

## Decisions Made

- Search RPCs are SECURITY DEFINER with the visibility predicate in-body — the only way the non-leakproof `@@` operator uses the GIN index under the 0019 RLS qual.
- Admin-created slang expands in search through the taxonomy arc (search_term_targets → listing_fitment), so new terms find existing listings without re-tagging; both slang arms gate on `st.is_active`.
- UX observations deferred to the already-requested post-v1 redesign phase: sell entry point not visible in header; stale tabs don't show freeze notice until refresh; vitest-* terms pollute Top search terms on Staging.

## Deviations from Plan

Two real gaps surfaced during the live UAT and were fixed forward immediately (Rule 1 — bugs):

### Auto-fixed Issues

**1. [Rule 1 - Bug] Split-pane composer ignored freeze/restriction**
- **Found during:** Task 2 (UAT step E.14, freeze a thread)
- **Issue:** the desktop split-pane composer on `/messages` ignored `frozen_at` and viewer restriction in `sendDisabled` — RLS still blocked the send (no security hole), but the UI offered a composer that could only fail
- **Fix:** split-pane `sendDisabled` now mirrors both RLS INSERT arms, matching the dedicated thread page
- **Files modified:** `app/(app)/messages/page.tsx`
- **Verification:** frozen thread shows read-only composer on both the split pane and the thread page; unfreeze restores
- **Committed in:** `5c77ef2`

**2. [Rule 1 - Bug] Admin-created slang terms never matched listings in search**
- **Found during:** Task 2 (UAT step F.16, add a slang term mapped to a model)
- **Issue:** the existing slang arm only matched `listing_search_terms` (terms a seller attached at listing time) — a NEW admin term mapped to a model via `search_term_targets` could never find existing listings
- **Fix:** migration `0024_search_slang_target_expansion.sql` (applied to Staging via `db query --linked -f`): `search_listings` gained a third keyword arm resolving `p_q` against active `search_terms` by similarity and matching `listing_fitment` through `search_term_targets` (make/model/config arc); both slang arms now require `st.is_active`
- **Verification:** live anon RPC found listing 133 via the new term; search suites 27/27 green
- **Committed in:** `895e7a5`

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs)
**Impact on plan:** Both fixes required for UAT steps to pass; no scope creep. The 0024 fix is a genuine search-correctness improvement the fitment-library feature depended on.

## Issues Encountered

- Enforcement emails on Staging only deliver to the Resend account address (domain not verified) — verified via audit log rows as the plan prescribed. Pre-launch domain verification already tracked in Pending Todos.
- `uat-import-sample.csv` (UAT artifact at repo root) deleted post-walkthrough, never committed.

## User Setup Required

None - no new external service configuration. (Pre-launch items unchanged: Resend domain, pg_cron toggle, signed-URL photo uploads.)

## Next Phase Readiness

- **Phase 10 CLOSED — v1 milestone COMPLETE (all 11 phases, 57/57 plans).**
- Next: the stakeholder-requested post-v1 UI/UX redesign phase (carries the three deferred UX observations), plus the pre-launch checklist (Resend domain, pg_cron, Vercel body-cap photo pipeline, Production Supabase project).

## Self-Check: PASSED

- supabase/migrations/0023_search_security_definer.sql — FOUND
- supabase/migrations/0024_search_slang_target_expansion.sql — FOUND
- Commits a0cbc05, 5c77ef2, 895e7a5 — FOUND

---
*Phase: 10-admin-operations-analytics*
*Completed: 2026-06-12*
