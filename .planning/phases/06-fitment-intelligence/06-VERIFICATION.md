---
phase: 06-fitment-intelligence
verified: 2026-06-09T00:00:00Z
status: passed
score: 7/7 must-haves verified
gaps: []
human_verification:
  - test: "Live suggestion flow — create listing"
    expected: "Choosing Part Category 'Bumpers' shows 'Common for Bumpers' chip ('Large Car') within 250ms; a seller with a Peterbilt 359 garage truck also sees 'From your garage' group; nothing enters confirmed Fits list without a click."
    why_human: "suggestFitment requires an authenticated cookie session; real-time debounce + useTransition feel cannot be verified statically."
  - test: "Accept chip and publish — FINT-03 read-back"
    expected: "Accepting a suggestion chip and publishing shows the Part categories and Also tagged sections on the public listing detail page."
    why_human: "Requires a Supabase Staging write with an authenticated seller + public listing view."
  - test: "Edit mode pre-fill — no re-suggestion"
    expected: "Editing a listing with a confirmed category + search term: the category is pre-selected in the trigger dropdown, the slang tag renders as a removable badge, and neither re-appears as a fresh suggestion chip."
    why_human: "Round-trip persistence through listing_categories / listing_search_terms verified only with a live Staging session."
  - test: "Barnyard listing with category suggestions"
    expected: "Toggling Barnyard on still allows selecting a Part Category and seeing suggestion chips; publishing succeeds without any Make/Model fitment."
    why_human: "Barnyard + fitment interaction requires live form interaction."
---

# Phase 6: Fitment Intelligence Verification Report

**Phase Goal:** Rules-based suggestion of applicable trucks/configs/categories; seller-confirmed, never auto-applied; garage pre-fill.
**Verified:** 2026-06-09
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | FINT-01: `suggestFitment` reads `fitment_rules` (public-read) + garage via `listMyTrucks()` RLS contract; no service-role import; returns `{groups:[]}` never throws | VERIFIED | `lib/fitment/suggest.ts` — `"use server"`, imports `createClient` from `@/lib/supabase/server` and `listMyTrucks` from `@/lib/garage/queries`; no `supabase/admin` import; returns `{ groups }` in all paths |
| 2 | FINT-02: `fitment-suggestions.tsx` contains NO `useEffect`; `listing-form.tsx` useEffect writes ONLY `suggestions` state, never `fitment` | VERIFIED | `grep useEffect fitment-suggestions.tsx` → zero matches; `listing-form.tsx` line 197–205: single `React.useEffect` calls only `setSuggestions(res.groups)` |
| 3 | FINT-02: acceptance into confirmed state is click-only via `onAcceptFitment` / `onAcceptTag` / `onAddAll` handlers | VERIFIED | Handlers defined at lines 242–287 of `listing-form.tsx`; `FitmentSuggestions` component wires them to `onClick` only; no effect-driven path exists |
| 4 | FINT-03: `createListing` + `updateListing` persist `listing_categories` + `listing_search_terms`; `getListing` returns them; accepted suggestion writes the same `listing_fitment` rows as a manual add | VERIFIED | `lib/actions/listings.ts` lines 228–239 (create) + 330–361 (update replace-children); `lib/listings/queries.ts` embeds `listing_categories` + `listing_search_terms` with name resolution; integration test FINT-03 shape-equivalence asserts identical fitment normalization |
| 5 | Privacy gate: `fitment_rules`, `listing_categories`, `listing_search_terms` have RLS enabled in migration 0012; no PII on new surfaces | VERIFIED | `0012_fitment_rules.sql` — `enable row level security` appears 3 times (one per table); `lib/fitment/suggest.ts` and new queries touch only `part_categories`, `search_terms`, `models`, `configurations`, `special_filters` — no `profiles_private` or `profiles_public` access |
| 6 | Bug fix — edit page selects `search_terms ( term )` so tags survive round-trip | VERIFIED | `app/(app)/sell/[id]/edit/page.tsx` line 82: `listing_search_terms ( term_id, search_terms:term_id ( term ) )`; line 125–131: maps to `SuggestedTag[]` with `name: t.search_terms!.term` |
| 7 | Bug fix — `listing-form.tsx` Part Category `onValueChange` uses `setCategoryIds([id])` (replace semantics, not accumulate) | VERIFIED | `listing-form.tsx` line 585: `setCategoryIds([id])`; `onAcceptTag` for kind=category also calls `setCategoryIds([t.id])` (line 273) |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0012_fitment_rules.sql` | 3 Phase-6 tables with RLS in-migration | VERIFIED | 185 lines; 3x `enable row level security`; exclusive-arc CHECKs; coalesce unique index; no write policy on `fitment_rules`; owner-write-via-EXISTS on join tables |
| `supabase/migrations/0013_fitment_rules_seed.sql` | Idempotent seed rules — category-driven + garage expansion | VERIFIED | 71 lines; all FKs resolved by name; 4 inserts all guarded `on conflict do nothing`; seed-integrity do-block; Peterbilt 359 → '359 Guys' rule present |
| `lib/listings/schema.ts` | `categoryIds` + `searchTermIds` arrays on `listingSchema` | VERIFIED | Lines 68–69; both `z.array(z.coerce.number().int().positive()).default([])` |
| `lib/fitment/types.ts` | Shared `SuggestedFitment / SuggestedTag / SuggestionGroup / SuggestResult` types | VERIFIED | Exports all 4 types + `MIN_SUGGESTION_CONFIDENCE = 80`; `SuggestedFitment` field names match `FitmentSelection` exactly |
| `lib/fitment/suggest.ts` | `"use server"` FINT-01 suggestion engine | VERIFIED | 256 lines; `"use server"` directive; `suggestFitment` exported; reads `fitment_rules` + `listMyTrucks()`; no admin import; never throws; returns `{ groups }` |
| `lib/listings/cascade.ts` | `getPartCategories()` reader | VERIFIED | `PartCategoryOption` type + `getPartCategories()` function with `id / name / parentId` |
| `lib/actions/listings.ts` | `createListing` + `updateListing` persist new dimensions | VERIFIED | Create: lines 228–239; Update replace-children: lines 330–361 (delete then re-insert both tables) |
| `lib/listings/queries.ts` | `getListing` returns `categories[]` + `searchTerms[]` | VERIFIED | Embeds `listing_categories ( category_id, part_categories:category_id ( name ) )` and `listing_search_terms ( term_id, search_terms:term_id ( term ) )` |
| `components/listings/listing-detail.tsx` | Renders Part categories + Also tagged sections | VERIFIED | Lines 155–167 (categories) + 172–183 (searchTerms); conditional on non-empty; Badge outline chips |
| `components/listings/fitment-suggestions.tsx` | Grouped-chips suggestion zone, no `useEffect` | VERIFIED | 174 lines; `"use client"`; FINT-02 guarantee comment at top; zero `useEffect` calls; `onAcceptFitment` / `onAcceptTag` / `onAddAll` wired to `onClick` only |
| `components/listings/listing-form.tsx` | Part-Category trigger + suggestions wiring | VERIFIED | `suggestFitment` called in single `React.useEffect` (writes `suggestions` only); accept handlers click-only; `categoryIds` + `searchTermIds` in submit payload; `setCategoryIds([id])` replace semantics |
| `app/(app)/sell/page.tsx` | `getPartCategories()` called; `partCategories` passed to `ListingForm` | VERIFIED | Line 36: `getPartCategories()`; line 69: `partCategories={partCategories}` |
| `app/(app)/sell/[id]/edit/page.tsx` | Edit page pre-fills `categoryIds` + `searchTerms` with names | VERIFIED | Lines 118–131 map `listing_categories` → `categoryIds` and `listing_search_terms` → `SuggestedTag[]` with resolved names; both passed into `ListingFormDefaults` |
| `tests/integration/fitment-intelligence.test.ts` | RLS gate + FINT-01 data layer + FINT-03 equivalence | VERIFIED | 220+ lines; all three tables RLS-tested; FINT-01 seeded-rules assertions; FINT-03 shape-equivalence `describe` block (always runs, no Supabase env needed) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/fitment/suggest.ts` | `public.fitment_rules` | RLS-scoped public-read query on `trigger_category_id` / `trigger_model_id` | WIRED | `supabase.from("fitment_rules")` in both `garageExpansionTags` and `categorySuggestions` helpers |
| `lib/fitment/suggest.ts` | `lib/garage/queries.ts listMyTrucks()` | `listMyTrucks()` import (RLS-scoped garage contract) | WIRED | Line 20: `import { listMyTrucks, type GarageTruck } from "@/lib/garage/queries"` |
| `lib/actions/listings.ts` | `public.listing_categories / public.listing_search_terms` | Bulk child insert + replace-children on update | WIRED | `supabase.from("listing_categories")` and `supabase.from("listing_search_terms")` in both `createListing` and `updateListing` |
| `lib/listings/queries.ts` | `public.part_categories / public.search_terms` | Embedded select joining category + term names | WIRED | `listing_categories ( category_id, part_categories:category_id ( name ) )` + `listing_search_terms ( term_id, search_terms:term_id ( term ) )` |
| `components/listings/listing-form.tsx` | `lib/fitment/suggest.ts suggestFitment` | Debounced `useTransition` fetch on `categoryId` change | WIRED | Line 200: `const res = await suggestFitment({ partCategoryId: categoryId })` inside `React.useEffect` |
| `components/listings/fitment-suggestions.tsx` | `listing-form.tsx` accept handlers | `onAcceptFitment` / `onAcceptTag` called ONLY by click | WIRED | Props wired at lines 603–612; component renders `onClick={() => onAcceptFitment(f)}` / `onClick={() => onAcceptTag(t)}`; no effect path |
| `components/listings/listing-form.tsx` | `ListingInput.categoryIds / searchTermIds` | Submit payload includes both arrays | WIRED | Lines 339–340: `categoryIds` + `searchTermIds: searchTerms.map((t) => t.id)` in `payload` |
| `app/(app)/sell/[id]/edit/page.tsx` | `ListingFormDefaults.searchTerms` | `search_terms:term_id ( term )` embedded select → name-bearing `SuggestedTag[]` | WIRED | Line 82: select includes `search_terms:term_id ( term )`; lines 125–131 map to `SuggestedTag[]` |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FINT-01 | 06-01, 06-03, 06-04 | System suggests applicable trucks/configs/categories based on part details | SATISFIED | `suggestFitment` engine reads `fitment_rules` (public-read) + `listMyTrucks()` (RLS-scoped); returns grouped suggestions by category and garage; wired into `listing-form.tsx` via debounced `useEffect` |
| FINT-02 | 06-04 | Suggested fitments presented for seller confirmation, never auto-applied | SATISFIED | `fitment-suggestions.tsx` has zero `useEffect` calls; `listing-form.tsx` single `useEffect` writes only `suggestions` state; all acceptance paths are click-handler-only |
| FINT-03 | 06-01, 06-02 | Confirmed listing appears in every applicable fitment search result and truck category | SATISFIED (Phase 6 persistence layer; search surfacing is Phase 7) | `listing_categories` + `listing_search_terms` tables exist and are written by `createListing`/`updateListing`; `getListing` returns them; detail page renders them; shape-equivalence integration test proves accepted suggestion = manual tag at action-input level |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TODOs, FIXMEs, placeholder returns, empty implementations, or console-only stubs found in the Phase-6 files.

---

### Human Verification Required

#### 1. Live suggestion flow — create listing

**Test:** Log in as a seller with a Peterbilt 359 garage truck. Visit `/sell`. In the Fitment section, confirm "From your garage" group appears with the truck listed as a chip. Do NOT accept it — confirm the Fits list is empty (FINT-02). Then select Part Category = "Bumpers". Within ~250ms confirm "Common for Bumpers" appears with a "Large Car" chip and a skeleton flashes briefly.

**Expected:** Garage group visible without auto-applying; category group populates on selection; input remains responsive throughout.

**Why human:** `suggestFitment` requires an authenticated cookie session. The debounce + `useTransition` feel cannot be confirmed statically.

#### 2. Accept chip and publish — FINT-03 read-back

**Test:** Accept one suggestion chip and publish a listing with at least one fitment. Open the public listing page.

**Expected:** "Part categories" and "Also tagged" sections appear below the "Fits" fitment badges on the public detail page.

**Why human:** Requires a Supabase Staging write with an authenticated seller.

#### 3. Edit mode pre-fill — no re-suggestion

**Test:** Edit the listing published above.

**Expected:** The Part Category dropdown pre-selects the category; the slang tag renders as a removable badge; neither the category nor the tag reappears as a fresh suggestion chip.

**Why human:** Round-trip persistence + suggestion de-duplication requires a live session with actual `listing_categories` / `listing_search_terms` rows.

#### 4. Barnyard listing with category suggestions

**Test:** On a fresh create, toggle Barnyard on, then select Part Category = "Hoods & Fenders". Publish without any Make/Model fitment.

**Expected:** Category suggestions still appear; publish succeeds.

**Why human:** Barnyard + fitment interaction requires live form state.

---

### Gaps Summary

No automated gaps. All structural requirements are satisfied:

- Migration 0012 creates all three tables with RLS enabled in-migration (3x `enable row level security`), correct exclusive-arc CHECKs on `fitment_rules`, no anon write policy on the reference table, and owner-write-via-EXISTS on the two join tables.
- Migration 0013 seeds all FK ids by name with `on conflict do nothing` guards and the seed-integrity do-block.
- `suggestFitment` is a `"use server"` module, reads only via the cookie-bound RLS client and `listMyTrucks()`, never imports the admin client, and returns `{ groups }` without throwing.
- `fitment-suggestions.tsx` contains zero `useEffect` calls (the FINT-02 hard guarantee).
- The single `useEffect` in `listing-form.tsx` writes only `suggestions` state and never touches `fitment` or any confirmed state.
- Both bug fixes from commit 10bbf42 are confirmed on disk: `search_terms:term_id ( term )` in the edit page select and `setCategoryIds([id])` replace semantics in the form.
- TypeScript compiles clean (`npx tsc --noEmit` exits 0).

Four items require human verification with a live Staging session; they cannot be verified programmatically.

---

_Verified: 2026-06-09_
_Verifier: Claude (gsd-verifier)_
