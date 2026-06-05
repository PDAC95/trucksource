---
phase: 05-listings-photos-exif-safe-storage
plan: 02
subsystem: database
tags: [zod, listings, validation, supabase, postgres, security-definer]

# Dependency graph
requires:
  - phase: 03-fitment-taxonomy-slang-library
    provides: conditions reference table (anon-public read) + makes/models/configurations cascade
  - phase: 04-my-garage
    provides: lib/garage/schema.ts + lib/garage/cascade.ts (zod source-of-truth + cascade reader patterns reused verbatim)
  - phase: 01-foundation-privacy-model
    provides: active_listing_count(uuid) stub returning 0 + the /u/[username] page that calls it
provides:
  - "listingSchema (zod) — the single client+server contract for a listing, imported by Wave-2 actions and Wave-3 form"
  - "ListingInput (z.infer) + ListingFormValues (z.input) types"
  - "getConditions() reader feeding the required Condition select"
  - "active_listing_count body rewritten to count active listings (PRIV-03 Phase-1 promise — migration file; Staging apply deferred to after 05-01)"
affects: [05-03, 05-04, 05-05, 06-fitment-intelligence, 07-search-feed-public-profile]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Interface-first: downstream plans import listingSchema, never re-derive validation rules"
    - "zod .refine for cross-field product rule (barnyard-or-fitment) with path-scoped error"
    - "Cascade reader reuse: getModels/getConfigs imported from garage cascade, only getConditions added"

key-files:
  created:
    - lib/listings/schema.ts
    - lib/listings/cascade.ts
    - supabase/migrations/0008_active_listing_count.sql
    - tests/unit/listing-schema.test.ts
  modified: []

key-decisions:
  - "listingSchema mirrors truckSchema conventions exactly (coercion for Radix-string ids, '' as absent-optional, z.input/z.infer split)"
  - "active_listing_count keeps frozen name/signature + SECURITY DEFINER + empty search_path; only the body changed (count where seller_id and status='active')"
  - "Make→Model→Config cascade is reused from @/lib/garage/cascade (not duplicated); lib/listings/cascade.ts adds only getConditions"

patterns-established:
  - "Barnyard-or-fitment refine: a listing must carry >=1 fitment unless isBarnyard is true, error attached to path: ['fitment']"
  - "askingPrice client rule: z.coerce.number().positive().multipleOf(0.01) — the cents/USD rule matching the DB integer-cents column (Pitfall 6)"

requirements-completed: [LIST-01, LIST-04, LIST-05]

# Metrics
duration: ~12min
completed: 2026-06-05
---

# Phase 5 Plan 02: Listing Contracts & Condition Reader Summary

**listingSchema (zod) as the single client+server listing contract — required title/price, USD cents price, barnyard-or-fitment refine, 8-photo cap — plus the getConditions reader and the long-promised active_listing_count body rewrite.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-05T09:02:00Z
- **Completed:** 2026-06-05T09:08:00Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments
- `listingSchema` shipped as the interface-first contract Wave-2 actions and Wave-3 form import — required `title`/`askingPrice`, optional `partNumber`/`damageNotes` (`""` = absent), USD cents price rule, the `isBarnyard || fitment.length >= 1` refine, and the 8-photo cap. 14 unit tests green.
- `getConditions()` reader added (id+name, ordered by `sort_order`, then name) to drive the required Condition select; Make→Model→Config cascade reused from the garage module, not duplicated.
- `active_listing_count(profile_id)` body rewritten to count active listings (PRIV-03 Phase-1 promise) — name/signature and SECURITY DEFINER + empty `search_path` posture unchanged, anon-safe integer.

## Task Commits

1. **Task 1: listingSchema (zod) + its unit test** - `bc8bcb6` (feat)
2. **Task 2: getConditions reader + active_listing_count rewrite** - `b426e99` (feat)

## Files Created/Modified
- `lib/listings/schema.ts` - listingSchema + ListingInput/ListingFormValues; single client+server contract
- `tests/unit/listing-schema.test.ts` - 14 tests: required/optional fields, price coercion, barnyard relaxation, shipping enum, photo cap
- `lib/listings/cascade.ts` - getConditions() reader (reuses garage cascade conventions; cascade not duplicated)
- `supabase/migrations/0008_active_listing_count.sql` - rewrites active_listing_count body to count active listings

## Decisions Made
- Mirrored `truckSchema` conventions for `listingSchema` (string-id coercion, `""` optional escape hatch, `z.input`/`z.infer` split) so the form layer behaves identically to the garage form.
- Kept `active_listing_count` name/signature/security posture frozen; only the body changed — the `/u/[username]` page's existing `rpc('active_listing_count', { profile_id })` call needs no edit.

## Deviations from Plan

### Blocking issue (could not fully resolve within this plan's wave)

**1. [Rule 3 - Blocking] migration 0008 could not apply to Staging until 05-01's `listings` table landed — RESOLVED before plan close**
- **Found during:** Task 2
- **Issue:** The plan declares 05-02 "independent of 05-01," but the `language sql` body of `active_listing_count` references `public.listings`, which Postgres resolves at function-creation time. `public.listings` is created by plan 05-01, which runs in the SAME wave. At first apply attempt `supabase db query --linked -f` returned `42P01: relation "public.listings" does not exist`.
- **Resolution:** Committed the content-verified migration file, then RETRIED the Staging apply once 05-01 had landed its `0006_listings.sql`. Migration 0008 applied cleanly; verified `select public.active_listing_count('…000'::uuid)` returns `0` for a seller with no active listings (correct anon-safe integer, no error). No code change to the migration was needed — only the apply order was constrained.
- **Files modified:** none beyond the planned migration file
- **Committed in:** `b426e99` (Task 2)

---

**Total deviations:** 1 blocking (wave-ordering; resolved by retrying the apply after 05-01 landed, no code fix)
**Impact on plan:** No scope change. All schema/reader code is complete + tested; migration 0008 is applied + verified on Staging.

## Issues Encountered
- A pre-existing tsc error in `tests/unit/exif-strip.test.ts` (owned by parallel plan 05-01, sharp `ifd0` typing) was observed during the global typecheck. Out of scope for 05-02 (no file overlap; 05-02's own modules compile clean). Logged to `deferred-items.md` for 05-01's owner.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `listingSchema` is the stable contract for 05-03/05-04 (create/edit actions) and 05-05 (form UI) — they must import it, never re-derive rules.
- `getConditions()` is ready to feed the form's required Condition select.
- `active_listing_count` is applied + verified on Staging (RPC returns 0 for a fresh seller) — no orchestrator follow-up needed.

---
*Phase: 05-listings-photos-exif-safe-storage*
*Completed: 2026-06-05*

## Self-Check: PASSED

- Files: lib/listings/schema.ts, lib/listings/cascade.ts, supabase/migrations/0008_active_listing_count.sql, tests/unit/listing-schema.test.ts — all FOUND
- Commits: bc8bcb6, b426e99 — all FOUND
