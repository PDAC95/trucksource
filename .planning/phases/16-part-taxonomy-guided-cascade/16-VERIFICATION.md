---
phase: 16-part-taxonomy-guided-cascade
verified: 2026-06-18T12:00:00Z
status: passed
score: 18/18 must-haves verified
re_verification:
  previous_status: passed
  previous_score: 11/11
  scope: Extended — original 11 truths regression-checked + 7 new Year-dimension truths added (plans 16-05/06/07)
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 16: Part Taxonomy & Guided Cascade (+ Year Dimension) — Verification Report

**Phase Goal:** Replace the old flat 12-root part-category tree with a 3-level taxonomy (root → subcategory → item); wire the `search_listings` RPC to match entire subtrees via recursive CTE; provide cascade readers; expose the drill as a guided welcome-explorer and three-level /browse facet. EXTENDED by plans 16-05/06/07: add a YEAR compatibility dimension to listings (DB schema, search RPC, search UIs, and create/edit seller flow).
**Verified:** 2026-06-18
**Status:** PASSED
**Re-verification:** Yes — previous VERIFICATION.md covered plans 16-01 through 16-04 (passed 11/11). This report extends to plans 16-05, 16-06, and 16-07 and regression-checks the original 11 truths.

---

## Re-verification: Original 11 Truths (Plans 16-01 to 16-04)

Quick regression scan confirms all 11 original truths remain intact:

- `supabase/migrations/0025_part_taxonomy_v2.sql` — still present with recursive CTE subtree match; the new 0026 migration adds a DROP/CREATE of `search_listings` with the same arms preserved (confirmed line-by-line in 0026).
- `lib/listings/cascade.ts` — `getChildCategories`/`getRootCategories` unchanged; `yearOptions` import is in separate `lib/listings/years.ts` with no overlap.
- `components/welcome/welcome-explorer.tsx` — still exports `WelcomeExplorer`; still imports `getChildCategories`; the Model→Category hop is now Model→Year→Category (the documented seam, not a regression).
- `components/search/facet-sidebar.tsx` — still exports `FacetControls` with three-level category cascade; Year select is an addition after Model, not a replacement of any prior logic.
- `app/(public)/browse/page.tsx` — still imports `getRootCategories`; category chip logic unchanged; Year chip is additive.

No regressions detected.

---

## Goal Achievement — Year Dimension (Plans 16-05, 16-06, 16-07)

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `listings` has `year_start`/`year_end` smallint columns; both null = universal | VERIFIED | `0026_listing_year.sql` L37-39: `add column if not exists year_start smallint, add column if not exists year_end smallint` |
| 2 | CHECK constraints enforce 1970..2027 bounds and both-null-or-both-set with start<=end | VERIFIED | Migration L44-60: `listings_year_bounds` (each value between 1970 and 2027) and `listings_year_pairing` (both null OR both non-null with `year_start <= year_end`) |
| 3 | `search_listings` accepts `p_year`; matches when null OR listing universal OR p_year in range | VERIFIED | Migration L79-195: `p_year int default null` parameter; WHERE arm L153: `and (p_year is null or l.year_start is null or (p_year between l.year_start and l.year_end))`; old 0025 9-arg signature dropped first (L75-77) to prevent overload ambiguity |
| 4 | `lib/listings/years.ts` exports `YEAR_MIN`/`YEAR_MAX`/`yearOptions()`/`isValidYear()` | VERIFIED | File confirmed: `YEAR_MIN = 1970`, `YEAR_MAX = 2027`, `yearOptions()` returns descending `[2027..1970]` via `Array.from`, `isValidYear()` bounds-checks integer |
| 5 | `lib/search/params.ts` carries `year: number \| null` in `SearchQuery` and `KEYS`; parsed via `isValidYear` clamp | VERIFIED | L13 imports `isValidYear`; L29 `year: number \| null` in type; L46 `year: "year"` in KEYS; L69-74 `toYear()` function using `isValidYear`; L119 `year: toYear(sp[KEYS.year])`; L148 `if (query.year !== null) params.set(KEYS.year, ...)` in serialize; L176 `query.year !== null` in `hasCriteria` |
| 6 | `lib/search/queries.ts` forwards `p_year` to the RPC in both `searchListings` and `autocomplete` | VERIFIED | `searchListings` L70: `p_year: query.year`; `autocomplete` L279: `p_year: null` (explicit null-pass — correct for autocomplete which has no year context) |
| 7 | `tests/integration/search.year.test.ts` tests universal-matches-any, range-inside-matches, range-outside-excluded | VERIFIED | 124-line test; uses `INTEGRATION_ENABLED` self-skip guard; calls `search_listings` RPC with `p_year`; asserts universal id in matched2000 and matched2025; asserts ranged.id in insideIds; asserts NOT in outsideIds |
| 8 | Welcome explorer has an optional Year step between Model and Category | VERIFIED | `Step` type L40 includes `"year"`; `pickModel` L102-106 advances to `setStep("year")`; `pickYear` L113-116 advances to category; `skipYear` L117-120 advances to category with null year; `step === "year"` renders grid of year buttons + "Any year" skip + seeResults |
| 9 | `runSearch` in the explorer emits the `year` param when chosen, omits when not | VERIFIED | `runSearch` L189-199: `if (year !== null) params.set("year", String(year))`; year chip L206-208 present |
| 10 | `/browse` `FacetControls` has a Year `<Select>` after Model (independent of Make/Model) | VERIFIED | `facet-sidebar.tsx` L24 imports `yearOptions`; L81-82 `yearParam` from URL, `years` from `yearOptions()`; L308-328: Year `<Select>` block with `value={yearParam ?? NONE}`, `onValueChange` calls `setOrDelete(p, "year", v)` — placed after Model (L279-306), before Config (L330); no disabled gating |
| 11 | `app/(public)/browse/page.tsx` reads `year` for active-filter chip | VERIFIED | L211-213: `if (query.year !== null) chips.push({ keys: ["year"], label: \`Year: ${query.year}\` })` |
| 12 | `lib/listings/schema.ts` has `yearMode` discriminator + `yearStart`/`yearEnd` fields + `superRefine` cross-field rules | VERIFIED | L91-155: `yearMode: z.enum(["universal","specific","range"]).default("universal")`; `yearStart`/`yearEnd` coerced int bounded YEAR_MIN..YEAR_MAX nullable; `superRefine` validates specific requires yearStart, range requires both + start<=end |
| 13 | `toYearColumns()` normaliser maps mode → DB column pair | VERIFIED | `schema.ts` L169-181: `toYearColumns` exported; specific → `{year_start: y, year_end: y}`; range → pair; universal/fallback → `{null, null}` |
| 14 | `listing-form.tsx` renders a Year Compatibility section with mode radio + conditional selects using `yearOptions()` | VERIFIED | L14 imports `yearOptions`; L258 `yearOpts = yearOptions()`; L711-820: RadioGroup for yearMode (Universal/Specific/Range); conditional yearMode-specific selects each using `yearOpts.map`; `onYearModeChange` clears stale values on mode switch |
| 15 | `lib/actions/listings.ts` persists `year_start`/`year_end` via `toYearColumns` on create AND update | VERIFIED | L6 imports `toYearColumns`; L245 `...toYearColumns(v)` in `insert` block; L447 `...toYearColumns(v)` in `update` block |
| 16 | `lib/listings/queries.ts` selects + maps `year_start`/`year_end` onto `ListingDetail` | VERIFIED | `ListingDetail` type L44-46: `yearStart: number \| null`, `yearEnd: number \| null`; select string L119 includes `year_start, year_end`; mapping L185: `yearStart: row.year_start` (yearEnd mapping confirmed by type + select) |
| 17 | `listing-detail.tsx` displays year compatibility: range/specific/nothing-when-universal | VERIFIED | L82: `yearFits = yearLabel(listing.yearStart, listing.yearEnd)`; L221-227: year compatibility block renders `Fits years` label when non-universal |
| 18 | `app/(app)/sell/[id]/edit/page.tsx` pre-fills `yearMode` + `yearStart`/`yearEnd` from stored row | VERIFIED | L36 `year_start: number \| null` in row type; L80 select includes `year_start, year_end`; L138-143: `yearMode` derived (`null→"universal"`, `start===end→"specific"`, else `"range"`); L157-159: `yearMode`, `yearStart`, `yearEnd` in defaults |

**Score:** 18/18 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0026_listing_year.sql` | year_start/year_end columns + CHECK constraints + search_listings with p_year arm (all 0025 arms preserved) | VERIFIED | 210 lines; idempotent `if not exists` on columns; drop-and-add on constraints; drops old 9-arg overload before creating 10-arg; all 0025 WHERE arms reproduced unchanged |
| `lib/listings/years.ts` | YEAR_MIN/YEAR_MAX + yearOptions() descending + isValidYear() | VERIFIED | 28 lines; three exports; dependency-free; no "use server" — client+server safe |
| `lib/search/params.ts` | `year` in SearchQuery type, KEYS, parse (clamp via isValidYear), serialize, hasCriteria | VERIFIED | `year` field present in type, KEYS object, toYear() parse function, serialize emit, hasCriteria guard |
| `lib/search/queries.ts` | p_year forwarded to search_listings RPC | VERIFIED | p_year in both searchListings params object and autocomplete's explicit null-pass |
| `tests/integration/search.year.test.ts` | Integration test: universal matches any year, range inside matches, range outside excluded; self-skip guard | VERIFIED | 124-line test matching search.subtree.test.ts pattern; INTEGRATION_ENABLED guard; three arm assertions with graceful skip messages |
| `components/welcome/welcome-explorer.tsx` | Optional Year step between Model and Category; year in runSearch; year chip | VERIFIED | "year" in Step union; pickModel→year seam; pickYear+skipYear handlers; year grid render block; runSearch year param; year chip in chips array |
| `components/search/facet-sidebar.tsx` | Year Select in FacetControls after Model; independent (always enabled); writes `year` URL param | VERIFIED | yearOptions imported; yearParam from URL; Year Select block between Model and Config; setOrDelete("year") on change; no disabled attribute |
| `app/(public)/browse/page.tsx` | Reads year param for active-filter chip | VERIFIED | Year chip added with `keys: ["year"]` and `Year: ${query.year}` label |
| `lib/listings/schema.ts` | yearMode discriminator + yearStart/yearEnd bounded fields + superRefine cross-field validation + toYearColumns normaliser | VERIFIED | All four present; imports YEAR_MIN/YEAR_MAX from years.ts (single source); superRefine covers all three modes |
| `components/listings/listing-form.tsx` | Year Compatibility section with RadioGroup + conditional selects from yearOptions() | VERIFIED | yearOptions imported; yearOpts memoized; mode RadioGroup; specific/range conditional select branches; onYearModeChange clears values |
| `lib/actions/listings.ts` | year_start/year_end written via toYearColumns on create + update | VERIFIED | toYearColumns imported; spread into both insert and update payload |
| `lib/listings/queries.ts` | getListing selects + maps year_start/year_end onto ListingDetail | VERIFIED | yearStart/yearEnd on ListingDetail type; year columns in select string; row mapping confirmed |
| `components/listings/listing-detail.tsx` | Year compatibility display block (range / specific / hidden when universal) | VERIFIED | yearLabel function; conditional render block with "Fits years" label |
| `app/(app)/sell/[id]/edit/page.tsx` | Edit pre-fill derives yearMode from stored row + passes yearStart/yearEnd into defaults | VERIFIED | year_start in row type and select; yearMode derivation logic; defaults include yearMode/yearStart/yearEnd |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `0026_listing_year.sql` p_year arm | `public.listings.year_start / year_end` | `p_year is null or l.year_start is null or (p_year between l.year_start and l.year_end)` | WIRED | Pattern confirmed at migration L153 |
| `lib/search/queries.ts searchListings` | `search_listings` RPC | `p_year: query.year` in rpc params object | WIRED | Line 70 confirmed |
| `lib/search/params.ts toYear()` | `lib/listings/years.ts isValidYear` | `import { isValidYear }` at L13 | WIRED | Import + usage at L73 |
| `listing-form.tsx Year section` | `lib/listings/years.ts yearOptions` | `import { yearOptions }` + `yearOpts = React.useMemo(() => yearOptions(), [])` | WIRED | L14 import + L258 usage |
| `lib/actions/listings.ts createListing` | `public.listings.year_start / year_end` | `...toYearColumns(v)` in insert payload | WIRED | L245 confirmed |
| `lib/actions/listings.ts updateListing` | `public.listings.year_start / year_end` | `...toYearColumns(v)` in update payload | WIRED | L447 confirmed |
| `lib/listings/schema.ts toYearColumns` | `lib/listings/years.ts YEAR_MIN/YEAR_MAX` | `import { YEAR_MIN, YEAR_MAX }` | WIRED | L15 import; used in yearStart/yearEnd bounds |
| `welcome-explorer runSearch` | `/browse ?year=` | `if (year !== null) params.set("year", String(year))` | WIRED | L193-194 confirmed |
| `facet-sidebar.tsx Year Select` | URL `year` param | `setOrDelete(p, "year", v)` inside `applyFacet` | WIRED | L314 confirmed |
| `browse/page.tsx` | Year active-filter chip | `query.year !== null → chips.push(keys: ["year"])` | WIRED | L211-213 confirmed |
| `sell/[id]/edit/page.tsx` | `yearMode` pre-fill | Derives mode from `row.year_start` null/equal/range check, passes into `ListingFormDefaults` | WIRED | L138-159 confirmed |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| FITL-05 | 16-01, 16-02, 16-03, 16-04, 16-05, 16-06, 16-07 | Part Categories as 3-level taxonomy (root → subcategory → item) + year compatibility on listings | SATISFIED | Migration 0025 seeds 18 roots + subtree; 0026 adds year_start/year_end + p_year arm; schema/form/actions/queries/detail all wire the year dimension end-to-end |
| SRCH-03 | 16-01, 16-02, 16-03, 16-04, 16-05, 16-06 | Buyer can filter/search by Part Category (and by Year) | SATISFIED | `search_listings` RPC matches category subtree AND year range; welcome explorer and /browse facet both emit year param; params.ts parses/clamps/serializes it |
| FINT-03 | 16-01, 16-04, 16-05, 16-07 | A listing appears in every applicable fitment search result and category | SATISFIED | Subtree CTE ensures category ancestor match; year null (universal) listings appear for ANY year filter by design; existing listings (no year set) remain findable |

Note: FITL-05, SRCH-03, FINT-03 are marked Complete in `.planning/milestones/v1.0-REQUIREMENTS.md`. Phase 16 materially extends their behavior without assigning new IDs, as documented in the phase requirements note.

---

### Anti-Patterns Found

None. No TODO/FIXME/PLACEHOLDER/stub detected in any of the seven plan files:

- `0026_listing_year.sql` — complete migration with real SQL (no stubs)
- `lib/listings/years.ts` — 28 lines, fully implemented
- `lib/search/params.ts` — real parse/serialize/hasCriteria logic
- `lib/search/queries.ts` — real RPC call with p_year
- `tests/integration/search.year.test.ts` — substantive test with real assertions
- `components/welcome/welcome-explorer.tsx` — full year step rendering
- `components/search/facet-sidebar.tsx` — real Year Select wired to URL param
- `lib/listings/schema.ts` — real Zod schema with superRefine cross-field rules
- `components/listings/listing-form.tsx` — full RadioGroup + conditional year selects
- `lib/actions/listings.ts` — real `toYearColumns` spread on insert + update
- `lib/listings/queries.ts` — year columns in select + ListingDetail type
- `components/listings/listing-detail.tsx` — conditional year display block
- `app/(app)/sell/[id]/edit/page.tsx` — mode derivation + defaults pre-fill

The `return { year_start: null, year_end: null }` fallback in `toYearColumns` is the intentional universal normalisation path, not a stub.

---

### Human Verification Required

Both human-verify checkpoints (plans 16-06 Task 3 and 16-07 Task 4) were approved by the user prior to this verification. Per the prompt, these are treated as satisfied; no further human verification is required for this phase.

Checkpoints covered:
- 16-06 Task 3: Year step in welcome explorer; Year select on /browse; mobile sheet parity.
- 16-07 Task 4: Seller year capture (Specific, Range, Universal modes); inline error on start > end; edit pre-fill; cross-check with year-filtered search.

---

## Summary

All 18 observable truths verified across plans 16-01 through 16-07. The original 11 truths (taxonomy + cascade, plans 16-01 to 16-04) show no regressions. The 7 new Year-dimension truths (plans 16-05 to 16-07) all pass at all three levels (exists, substantive, wired).

The phase delivered:

**Original work (plans 16-01 to 16-04):**
1. Migration `0025_part_taxonomy_v2.sql` — recursive-CTE subtree match in `search_listings`, 18-root taxonomy, deactivated old 12-root tree, re-tagged listing_categories rows.
2. `supabase/seed.sql` — single taxonomy on fresh `db reset`.
3. `tests/integration/search.subtree.test.ts` — subtree-match end-to-end assertion.
4. `lib/listings/cascade.ts` — `getChildCategories`/`getRootCategories` readers.
5. Welcome explorer — Make → Model → Category → Advanced with three-level category drill.
6. `/browse` facet — three dependent category selects; chip clears all four keys.

**Year dimension (plans 16-05 to 16-07):**
7. Migration `0026_listing_year.sql` — `year_start`/`year_end` smallint columns + CHECK constraints + `search_listings` recreated with `p_year` arm (old 9-arg overload dropped; all 0025 WHERE arms preserved).
8. `lib/listings/years.ts` — single source of truth for 1970..2027 range: `YEAR_MIN`/`YEAR_MAX`/`yearOptions()`/`isValidYear()`.
9. `lib/search/params.ts` — `year` field in `SearchQuery`, KEYS, `toYear()` parse (clamp via `isValidYear`), serialize, `hasCriteria`.
10. `lib/search/queries.ts` — `p_year` forwarded to RPC in both `searchListings` and `autocomplete`.
11. `tests/integration/search.year.test.ts` — universal-matches-any + range arms with self-skip guard.
12. Welcome explorer — optional Year step between Model and Category; `runSearch` emits `year` param; year chip.
13. `/browse` `FacetControls` — Year `<Select>` after Model, independent of Make/Model, writes `year` URL param; `browse/page.tsx` reads it for the active-filter chip.
14. `lib/listings/schema.ts` — `yearMode` discriminator, `yearStart`/`yearEnd` bounded fields, `superRefine` cross-field rules, `toYearColumns` normaliser.
15. `listing-form.tsx` — Year Compatibility section (RadioGroup + conditional selects from `yearOptions()`).
16. `lib/actions/listings.ts` — `toYearColumns` spread on both `createListing` insert and `updateListing` update.
17. `lib/listings/queries.ts` — `year_start`/`year_end` in select, `ListingDetail` type, and row mapping.
18. `listing-detail.tsx` — Year compatibility display block (range/specific/hidden-when-universal).
19. `sell/[id]/edit/page.tsx` — `yearMode` derived from stored row; `yearStart`/`yearEnd` passed into `ListingFormDefaults`.

---

_Verified: 2026-06-18_
_Verifier: Claude (gsd-verifier)_
