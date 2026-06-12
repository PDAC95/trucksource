---
phase: 10-admin-operations-analytics
plan: 06
subsystem: admin-analytics
tags: [analytics, dashboard, recharts, shadcn-chart, service-role, sql-helpers]
requires:
  - "10-01: admin_user_activity_stats() RPC + created_at indexes on both event tables"
  - "10-02: gated admin layout + dashboard placeholder at app/admin/page.tsx"
provides:
  - "ADMA-01..04: live analytics dashboard at /admin with 7/30/90/all presets"
  - "migration 0020: 5 service-role-only SQL aggregate helpers"
  - "lib/admin/analytics.ts: getDashboardData(range) read module"
affects: [10-09, 10-10]
tech-stack:
  added: ["recharts ^3.8.0 (pinned by npx shadcn add chart)"]
  patterns:
    - "PostgREST-inexpressible aggregates (jsonb facet group-by, UNION demand, month series) live as invoker SQL functions with execute revoked from anon/authenticated"
    - "client chart components receive only pre-aggregated label/value arrays"
key-files:
  created:
    - supabase/migrations/0020_analytics_helpers.sql
    - lib/admin/analytics.ts
    - components/ui/chart.tsx
    - components/admin/kpi-cards.tsx
    - components/admin/trend-chart.tsx
    - components/admin/ranking-list.tsx
  modified:
    - app/admin/page.tsx
    - package.json
decisions:
  - "Helper SQL functions are security INVOKER (not definer): sole caller is the service-role client which bypasses RLS; execute revoked from public/anon/authenticated keeps them admin-only"
  - "Model demand = facets->>'modelId' UNION ALL facets->>'fitsModelId' (Fits-my-truck searches count as model demand); rendered as 'Make Model' to disambiguate"
  - "Growth % KPI = new users current (partial) month vs previous full month; null (em-dash) when previous month is 0"
  - "Rankings rendered as proportional-bar ordered lists, not bar charts (chart added nothing); trend uses shadcn ChartContainer AreaChart"
  - "Top search terms ranked on normalized_term (slang-expanded canonical) per Research open question 2"
metrics:
  duration: ~25 min
  completed: 2026-06-11
---

# Phase 10 Plan 06: Analytics Dashboard Summary

**One-liner:** Live service-role analytics dashboard (ADMA-01..04) — KPI cards, 12-month Recharts growth trend, and most-viewed/most-searched rankings, all re-scoped by 7/30/90/all link-button presets, fed by five new revoked-execute SQL aggregate helpers (migration 0020, applied to Staging).

## What was built

- **Migration 0020 (`0020_analytics_helpers.sql`, applied to Staging via `npx supabase db query --linked -f`):** `admin_top_viewed_listings`, `admin_top_search_makes`, `admin_top_search_models`, `admin_top_search_terms` (all `p_since timestamptz`, null = all time) and `admin_monthly_growth()` (12 zero-filled month buckets of new users/listings). All invoker, `set search_path = ''`, execute revoked from public/anon/authenticated — grant check confirmed only `postgres` + `service_role` retain execute (same posture as `admin_user_activity_stats`).
- **`lib/admin/analytics.ts` (server-only):** `getUserStats` (0019 RPC), `getListingStats` (active count via PostgREST + top-viewed RPC, hidden listings included with badge), `getSearchRankings` (makes/models/terms RPCs), `getMessageStats` (ranged PostgREST count), `getGrowthSeries` (series + growth %), all parallelized by `getDashboardData(range)`. Range presets typed as `'7d'|'30d'|'90d'|'all'` with `parseRange` defaulting to 30d.
- **Components:** shadcn `chart.tsx` (recharts ^3.8.0 as pinned by the CLI), server `KpiCards` (5 cards incl. growth arrow), client `TrendChart` (AreaChart, users+listings, theme tokens `--chart-1/2`), server `RankingList` (proportional-bar ordered list, optional href/badge, "No data yet for this range." empty state).
- **`app/admin/page.tsx`:** placeholder replaced. `force-dynamic`, `requireAdmin()` re-asserted, `?range` validated, four link-button presets with active state, `<Suspense key={range}>` with skeleton fallback, KPI row on top + 2-col grid (growth trend, most-viewed listings → links to `/admin/listings/[id]`, most-searched makes, most-searched models, top search terms).

## Verification

- All five helper functions spot-checked live on Staging (top-viewed returned real view counts; makes/models/terms returned Kenworth/Peterbilt rankings; growth series returned 12 buckets).
- KPI SQL spot-check: registered=2, active_30d=2, active_listings=0, messages_30d=5 — module uses the identical queries/RPCs.
- `npm run typecheck` clean; `npm run build` clean — `/admin` is ƒ (dynamic).
- `grep -r SUPABASE_SERVICE_ROLE_KEY .next/static` → no match (key never in client bundle).
- No raw event rows cross the RSC boundary: client components' props are `{month,users,listings}[]` and `{label,value}[]` only.

## Task Commits

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Analytics query module + migration 0020 | 086b885 |
| 2 | shadcn chart + KPI/trend/ranking components | 553dec5 (cross-attributed, see below) + af8871c |
| 3 | Dashboard page assembly with range presets | 9577b8e |

## Deviations from Plan

### Auto-fixed / environmental

**1. [Rule 3 - Blocking] Task 2 commit cross-attributed by parallel lint-staged race**
- **Found during:** Task 2 commit
- **Issue:** Known husky/lint-staged stash-restore race (see project memory): a concurrent 10-07 commit (553dec5) swept this plan's staged files (kpi-cards, trend-chart, ranking-list, chart.tsx, package.json, package-lock.json) into its commit, then my commit failed with `cannot lock ref 'HEAD'`.
- **Fix:** Verified content correct on disk and in history (file-on-disk verification per memory note); committed the residual prettier-formatted chart.tsx as af8871c with an attribution note. History not rewritten (parallel agents active).
- **Commit:** af8871c

**2. Out-of-scope build/typecheck failures from parallel plans (not fixed — scope boundary)**
- Mid-execution typecheck/build hits came from 10-08's in-flight `taxonomy-crud.tsx` / `fitment/[level]` files; the owning agent resolved them before this plan's final verification, which ran clean tree-wide.

Otherwise the plan executed as written.

## Self-Check: PASSED

- supabase/migrations/0020_analytics_helpers.sql — FOUND
- lib/admin/analytics.ts — FOUND
- components/ui/chart.tsx — FOUND
- components/admin/kpi-cards.tsx — FOUND
- components/admin/trend-chart.tsx — FOUND
- components/admin/ranking-list.tsx — FOUND
- app/admin/page.tsx (dashboard, not placeholder) — FOUND
- Commits 086b885, 553dec5, af8871c, 9577b8e — FOUND
