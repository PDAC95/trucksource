---
phase: 01-foundation-privacy-model
plan: 04
subsystem: public-profile
tags: [nextjs, app-router, server-component, supabase, rls, privacy, rpc, vitest, integration-test]

# Dependency graph
requires:
  - phase: 01-foundation-privacy-model
    plan: 01
    provides: Route groups (public)/(auth)/(app), lib/supabase/server.ts cookie-bound RLS client, @/ path alias, shadcn ui primitives
  - phase: 01-foundation-privacy-model
    plan: 02
    provides: profiles_public table (id, username, state_province, country, member_since) with anon SELECT policy; active_listing_count(uuid) RPC returning 0 in P1; PII denylist + allowed-columns single source of truth (tests/integration/_supabase.ts)
provides:
  - "Public seller profile route /u/[username] — anon-readable Server Component rendering exactly the four public facts (username, 'State/Province, Country', Member Since, active-listings count) + Phase-1 empty-listings state"
  - "Active-listings count wired via the active_listing_count RPC (derived, not stored) — correct now (0) and stays correct once listings land in Phase 5"
  - "not-found state for unknown usernames (notFound() → not-found.tsx), not a crash"
  - "Route-level PII contract test (public-profile.contract.test.ts) asserting the page's exact select returns zero PII + the RPC is anon-callable"
affects: [02-verified-seller-otp, 05-listings-photos-exif, 07-search-feed-public-profile]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Public surfaces read profiles_public ONLY via enumerated columns (never select('*'), never join profiles_private) — privacy is structural"
    - "Derived counts via security-definer RPC (active_listing_count) instead of stored columns — wired in P1, body rewritten in P5"
    - "Anon-safe public route left cacheable (NOT force-dynamic) because it carries zero PII"
    - "Route-level PII contract test mirrors the page's exact query and imports the shared PII denylist from tests/integration/_supabase.ts"

key-files:
  created:
    - app/(public)/u/[username]/page.tsx
    - app/(public)/u/[username]/not-found.tsx
    - components/profile/public-profile-header.tsx
    - components/profile/empty-listings.tsx
    - tests/integration/public-profile.contract.test.ts
  modified: []

key-decisions:
  - "Used the active_listing_count RPC (Plan 02 / RESEARCH Open Question 1, option b) rather than a literal 0, so the count is genuinely derived (PRIV-03) and Phase 5 is a one-function-body change with zero page edits"
  - "Left /u/[username] cacheable (no force-dynamic) — it is anon-safe with zero PII, matching RESEARCH Pitfall 4 guidance for public surfaces"
  - "Route-level contract test enumerates the SAME columns the page selects, so any future widening of the page query that pulled PII would fail the gate"

patterns-established:
  - "Public-profile page selects exactly [id, username, state_province, country, member_since] — id used only to feed the RPC, never rendered"
  - "Member Since formatted as 'Member since {Month YYYY}' via toLocaleDateString('en-US', { month: 'long', year: 'numeric' })"

requirements-completed: [PRIV-01, PRIV-02, PRIV-03, PRIV-04]

# Metrics
duration: ~10min
completed: 2026-06-03
---

# Phase 1 Plan 04: Public Seller Profile Summary

**Built the public seller profile at `/u/[username]` — an anon-readable Next.js Server Component that reads `profiles_public` ONLY (zero PII) by enumerated columns, derives the active-listings count via the `active_listing_count` RPC (not a stored column), renders the four allowed public facts in a marketplace-seller header plus a Phase-1 empty-listings state, and falls back to a not-found page for unknown usernames — with a route-level PII contract test asserting the page's exact query leaks no PII and the RPC is anon-callable.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-06-03
- **Tasks:** 2 (both auto, autonomous plan — no checkpoints)
- **Files modified:** 5 (5 created, 0 modified)

## Accomplishments

- `app/(public)/u/[username]/page.tsx` — Server Component: awaits `params`, builds the cookie-bound RLS client, runs `select('id, username, state_province, country, member_since').from('profiles_public').eq('username', username).maybeSingle()`, calls `notFound()` on no row, then `supabase.rpc('active_listing_count', { profile_id })` for the derived count (defaulting to 0). Renders `<PublicProfileHeader/>` + `<EmptyListings/>`. Not marked `force-dynamic` (anon-safe).
- `components/profile/public-profile-header.tsx` — compact marketplace-seller header: username (h1), location line as `{state_province}, {country}`, "Member since {Month YYYY}", and "{count} active listing(s)" with singular/plural handling. Uses lucide icons + a `<dl>` for semantics; renders an avatar initial.
- `components/profile/empty-listings.tsx` — dashed-border empty state ("This user hasn't posted yet") sized to sit where the Phase-5 grid will go.
- `app/(public)/u/[username]/not-found.tsx` — "Profile not found" with a Go-home button (shadcn Button + Link).
- `tests/integration/public-profile.contract.test.ts` — route-level PII gate: asserts the page's exact column select is anon-valid and returns only allowed keys / zero PII keys (skips the row-key check with a logged note when no public rows are seeded), and asserts `active_listing_count` is anon-callable returning the number `0` in P1.

## Task Commits

1. **Task 1: Public profile page + header + empty + not-found** — `666dee6` (feat) — route, header, empty-listings, not-found; `npm run build` succeeds.
2. **Task 2: Route-level PII contract test** — `d21af57` (test) — `public-profile.contract.test.ts`, 2 passed against Staging.

## Files Created/Modified

- `app/(public)/u/[username]/page.tsx` — public profile Server Component (created).
- `app/(public)/u/[username]/not-found.tsx` — unknown-username not-found state (created).
- `components/profile/public-profile-header.tsx` — compact header with the four public facts (created).
- `components/profile/empty-listings.tsx` — Phase-1 empty-listings state (created).
- `tests/integration/public-profile.contract.test.ts` — route-level PII contract test (created).

## Decisions Made

- **RPC over literal 0 for the count:** chose the `active_listing_count` RPC path (RESEARCH Open Question 1, option b) so the count is genuinely derived (PRIV-03). Phase 5 becomes a single function-body rewrite with zero edits to this page.
- **Page left cacheable:** `/u/[username]` carries no PII, so it is not marked `force-dynamic` — consistent with RESEARCH Pitfall 4 (only personalized `(app)` routes must be dynamic). In the build it still shows as `ƒ (Dynamic)` because the Supabase server client reads cookies; that is expected and harmless (no PII to mis-serve).
- **Contract test mirrors the page query exactly:** the test enumerates the same five columns the page selects, so any future change that widened the page query to pull PII would fail this gate, not just the table-level Plan 02 gate.

## Deviations from Plan

None — plan executed exactly as written. Both tasks shipped with the planned files and verification commands; `npm run build` and the contract test both pass.

## Authentication Gates

None encountered. The route and its tests use only the anon key (the public surface is anon-readable by RLS policy); no login or service-role access was required.

## Parallel-Execution Note

Plan 01-03 (auth flows) was running concurrently. Per the objective, only this plan's four `files_modified` (+ the planned test) were staged/committed; the untracked `app/(auth)/`, `app/api/`, `components/auth/` belonging to 01-03 were left untouched and unstaged. No `app/(app)/**`, `components/layout/**`, or `app/api/**` files were modified.

## Issues Encountered

- The lint-staged pre-commit hook reformatted the new test file (removed an `eslint-disable` line it deemed unnecessary and normalized spacing). Change was cosmetic and intentional; tests still pass.

## Verification

- `npm run typecheck` (`tsc --noEmit`) → clean.
- `npm run build` → succeeds; `/u/[username]` registered as a route (server-rendered on demand).
- `npx vitest run tests/integration/public-profile.contract.test.ts` → 2 passed (page's exact select leaks zero PII; `active_listing_count` anon-callable, returns 0).

## Next Phase Readiness

- The public profile surface is live and PII-clean; the cross-cutting PII gate now covers both the table level (Plan 02) and the route level (this plan).
- **Reminder for Phase 5:** rewriting the `active_listing_count(uuid)` body to count active listings will make this page's count live with no page change; the `<EmptyListings/>` component is the placeholder for the real listings grid.
- Phase 7 (public profile / search) can extend this route (e.g. the listings grid, social signals) without touching the privacy contract, which the route-level test now guards.

## Self-Check: PASSED

All five created files exist on disk; both task commits (`666dee6`, `d21af57`) are present in git history.

---
*Phase: 01-foundation-privacy-model*
*Completed: 2026-06-03*
