---
phase: 16-part-taxonomy-guided-cascade
plan: 07
subsystem: listings-form
tags: [nextjs, react, zod, react-hook-form, listings, year-compatibility, trust-boundary]

# Dependency graph
requires:
  - phase: 16-part-taxonomy-guided-cascade (16-05)
    provides: listings.year_start/year_end columns (migration 0026) + lib/listings/years.ts (YEAR_MIN/MAX, yearOptions()) + p_year search forwarding
  - phase: 16-part-taxonomy-guided-cascade (16-06)
    provides: the buyer-side Year search surfaces that this plan makes a seller declare for
provides:
  - yearMode discriminator (universal/specific/range) + yearStart/yearEnd + cross-field superRefine in the shared listingSchema
  - toYearColumns() normaliser (mode + values -> { year_start, year_end } DB pair)
  - Year Compatibility section in the create/edit listing form (mode toggle + conditional select(s))
  - year_start/year_end persisted on createListing + updateListing
  - getListing selects + maps year_start/year_end onto ListingDetail (yearStart/yearEnd)
  - "Fits years: ..." display block on the public listing detail
  - edit-page pre-fill that derives yearMode + years from the stored row
affects:
  - 16-05 search.year.test.ts range arm (now seedable with ranged listings)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Year MODE (universal/specific/range) is a UI/validation discriminator; DB stays the two-column year_start/year_end pair — toYearColumns() is the single mode->columns mapper, called server-side after re-validation"
    - "SAME Zod schema (superRefine cross-field rules) validates client (inline UX) + Server Action (trust boundary) — CLAUDE.md single-source invariant"
    - "Switching mode clears stale year values (form.setValue null) so a half-filled previous mode can't leak through the resolver"

key-files:
  created: []
  modified:
    - lib/listings/schema.ts
    - components/listings/listing-form.tsx
    - lib/actions/listings.ts
    - lib/listings/queries.ts
    - components/listings/listing-detail.tsx
    - app/(app)/sell/[id]/edit/page.tsx

key-decisions:
  - "Year stored as the two-column pair (year_start/year_end), NOT a mode column — mode is reconstructed from the pair on edit pre-fill (both null=universal; start===end=specific; else range)"
  - "Specific stores year_start = year_end (the form keeps yearEnd synced to yearStart); the schema guards a mismatched end as a client bug"
  - "Cross-field rules live in a superRefine so each failure attaches to the precise field (yearStart/yearEnd) and surfaces inline; the action re-runs the same schema as the trust boundary"
  - "toYearColumns() is the ONLY place form-shape -> DB-shape happens; universal (or any incomplete mode) collapses to { null, null }"
  - "Year is non-PII public listing data — columns live on the public listings table, no RLS change"

patterns-established:
  - "Mode-discriminator + normaliser pattern for a multi-shape input mapped onto a fixed DB column pair, validated identically on client and server"

requirements-completed: [FITL-05, FINT-03]

# Metrics
duration: ~9min
completed: 2026-06-18
---

# Phase 16 Plan 07: Create/Edit Listing Year Inputs Summary

**Let sellers declare which truck years a listing fits — a Year Compatibility section with three modes (Universal / Specific year / Year range) validated by the SAME Zod schema on client and server, normalised to the year_start/year_end column pair via toYearColumns(), persisted on create + update, displayed as "Fits years: ..." on the listing detail, and pre-filled (mode + years) in the edit form.**

## Performance

- **Duration:** ~9 min (implementation across the parallel wave)
- **Completed:** 2026-06-18 (verified + approved at the human-verify checkpoint)
- **Tasks:** 4 (3 implementation + 1 human-verify checkpoint)
- **Files modified:** 6

## Accomplishments
- **Schema (`lib/listings/schema.ts`):** added `yearMode: z.enum(["universal","specific","range"]).default("universal")` plus nullable/optional coerced `yearStart`/`yearEnd` bounded to `YEAR_MIN..YEAR_MAX` (the single source from `lib/listings/years.ts`, the same bounds the `listings_year_bounds` CHECK enforces). A `superRefine` carries the cross-field rules — `specific` requires a year and keeps end equal to start; `range` requires both and enforces `start <= end` (error on `yearEnd`); `universal` ignores stray values. Exported `toYearColumns()` mapping mode+values to `{ year_start, year_end }` (specific: y/y; range: pair; universal/incomplete: null/null). Extended `ListingFormDefaults` with `yearMode?`/`yearStart?`/`yearEnd?`.
- **Form (`components/listings/listing-form.tsx`):** a "Year compatibility" section after Fitment, before Photos. A RadioGroup mode toggle (Universal / Specific year / Year range, ENGLISH); Specific shows one select (and syncs `yearEnd` to the chosen `yearStart`), Range shows Start+End selects, Universal shows none. Options come from `yearOptions()`. `onYearModeChange` clears the stale year values on toggle. Errors surface inline via `FormMessage` (the refine attaches them to the precise field).
- **Persistence (`lib/actions/listings.ts`):** after the shared-schema re-validation (trust boundary), both `createListing` and `updateListing` set `year_start`/`year_end` on the listings insert/update map via `toYearColumns()` — no child-table change.
- **Read + display (`lib/listings/queries.ts`, `components/listings/listing-detail.tsx`):** `getListing` selects `year_start, year_end`, types them on the row, and maps them onto `ListingDetail` as `yearStart`/`yearEnd`; the detail renders a Year block — `Fits years: {start}–{end}` for a true range, `{start}` when `start === end`, and nothing when both are null (universal).
- **Edit pre-fill (`app/(app)/sell/[id]/edit/page.tsx`):** added `year_start, year_end` to the editable row select/type and derived `yearMode` for the form defaults (`universal` when both null; `specific` when `start === end`; `range` otherwise), passing the stored pair into `ListingFormDefaults`.

## Task Commits

1. **Task 1: Schema year fields + cross-field validation** - `b44e77e` (feat)
2. **Task 2: Year Compatibility section in form** - `2dbcebd` (feat)
3. **Task 3: Persist + display + edit pre-fill** - `b57b44b` (feat)
4. **Task 4: Human-verify checkpoint** - approved (no commit)

## Files Created/Modified
- `lib/listings/schema.ts` - `yearMode` enum + `yearStart`/`yearEnd` bounded coerced fields + `superRefine` cross-field rules; `toYearColumns()` normaliser; `ListingFormDefaults` year fields
- `components/listings/listing-form.tsx` - Year Compatibility section (mode RadioGroup + conditional select(s) from `yearOptions()`); `onYearModeChange` clears stale values; RHF default values for the year fields
- `lib/actions/listings.ts` - `year_start`/`year_end` written on create + update from `toYearColumns(validated)`
- `lib/listings/queries.ts` - `year_start, year_end` in the `getListing` select + row type, mapped onto `ListingDetail` as `yearStart`/`yearEnd`
- `components/listings/listing-detail.tsx` - Year display block (`Fits years: …` / single year / nothing for universal)
- `app/(app)/sell/[id]/edit/page.tsx` - `year_start, year_end` in the editable row select; derives `yearMode` + passes the year pair into the form defaults

## Decisions Made
- DB stays the two-column `year_start`/`year_end` pair; `yearMode` is a UI/validation construct reconstructed from the pair on edit. This keeps the buyer-side `p_year between year_start and year_end` match (16-05) untouched.
- `toYearColumns()` is the single form-shape -> DB-shape mapper, called only after the schema validates, so the cross-field rules already guarantee required/ordered values.
- The same `listingSchema` is the trust boundary: the Server Action re-validates, so a forged out-of-bounds or start>end payload is rejected server-side regardless of the client.

## Deviations from Plan
### Auto-recovered Issue

**1. [Rule 3 - Blocking] Parallel-wave commit race on `lib/listings/schema.ts`**
- **Found during:** Task 1 (this plan ran in the same wave as 16-06, which touches different files)
- **Issue:** The husky/lint-staged stash/restore in concurrent GSD waves can cross-attribute staged changes (known memory: precommit-hook-parallel-attribution). The Task 1 schema commit initially landed as a dangling commit (`5b42a1e`) rather than on the branch tip.
- **Fix:** Recovered `lib/listings/schema.ts` from the dangling commit `5b42a1e` and re-committed it clean as `b44e77e` (schema.ts ONLY — verified `git show --stat b44e77e` shows the single file, no 16-06 files mis-attributed).
- **Files affected:** `lib/listings/schema.ts`
- **Commit:** `b44e77e`

## Issues Encountered
None beyond the recovered commit race above.

## User Setup Required
None - no external service configuration required. Year columns shipped in 16-05 (migration 0026, already on Staging).

## Next Phase Readiness
- The full Year dimension is complete end-to-end: data + search RPC (16-05), buyer search surfaces (16-06), and seller capture + display + edit (16-07). Sellers can now seed ranged listings, which activates the previously-self-skipping range arm of 16-05's `search.year.test.ts`.
- Phase 16 is functionally complete (7/7). Remaining v1.1 work: Phase 11 rebrand plan 11-04, still blocked on stakeholder logo assets.

---
*Phase: 16-part-taxonomy-guided-cascade*
*Completed: 2026-06-18*

## Self-Check: PASSED

All 6 modified files verified on disk; all 3 task commits (b44e77e, 2dbcebd, b57b44b) verified in git log. The schema commit b44e77e confirmed to contain only lib/listings/schema.ts (no 16-06 files mis-attributed despite the recovered commit race).
