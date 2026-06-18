---
phase: 16-part-taxonomy-guided-cascade
verified: 2026-06-18T00:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 16: Part Taxonomy & Guided Cascade — Verification Report

**Phase Goal:** Replace the old flat 12-root part-category tree with a 3-level taxonomy (root -> subcategory -> item); wire the `search_listings` RPC to match entire subtrees via recursive CTE; provide cascade readers; and expose the drill as a guided welcome-explorer and three-level /browse facet.
**Verified:** 2026-06-18
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Selecting a root or subcategory returns listings tagged at any descendant leaf (subtree match) | VERIFIED | `0025_part_taxonomy_v2.sql` contains `with recursive subtree as (select id from public.part_categories where id = p_category_id union all select c.id from public.part_categories c join subtree s on c.parent_id = s.id)` with `join subtree st on st.id = lc.category_id` in the RPC body |
| 2 | Category tree has confirmed roots + full Fuel Tanks subtree; old 12-root flat tree deactivated | VERIFIED | Migration Section B seeds 18 roots + 14 subcategories under "Fuel Tanks, Straps & Accessories"; Section C deactivates old roots ('Hoods & Fenders', 'Lighting', 'Mirrors', 'Exhaust & Stacks', 'Bumpers', 'Grilles', 'Interior', 'Drivetrain', 'Suspension', 'Electrical', 'Glass', 'Body & Cab') and their children |
| 3 | Fresh `supabase db reset` yields exactly one taxonomy | VERIFIED | `seed.sql` L145-325 contains only the new tree; the old roots are gone; header comment explicitly states "The old 12-root flat tree is GONE from this seed and is never reintroduced" |
| 4 | `search_listings` RPC signature + return columns byte-identical to 0024 | VERIFIED | 0025 parameter list and `returns table` declaration match 0024 exactly (9 params, 7 return columns, same types, `language sql stable security definer set search_path = ''`) |
| 5 | Subtree integration test asserts ancestor result is superset of leaf result | VERIFIED | `tests/integration/search.subtree.test.ts` resolves root id, subcategory id, and leaf id from `part_categories`; asserts leaf results are a subset of root results; self-skips if staging lacks data (consistent with contract test pattern) |
| 6 | `getChildCategories` and `getRootCategories` readers exist with correct posture | VERIFIED | `lib/listings/cascade.ts` exports both; `getChildCategories` has int guard + `eq("parent_id")` + `eq("is_active", true)` + `order("name")` + `[] on error`; `getRootCategories` has `is("parent_id", null)` + `eq("is_active", true)` + `order("name")` + `[] on error`; `getPartCategories` is untouched |
| 7 | Welcome explorer drills Make -> Model -> Category(root) -> Advanced(sub -> item + Condition); runSearch emits single deepest category param | VERIFIED | `welcome-explorer.tsx` imports `getChildCategories`; `deepestCategory = item ?? subcategory ?? rootCategory`; `params.set("category", String(deepestCategory.id))`; no `getConfigs` or `partCategories` flat prop |
| 8 | `app/(public)/page.tsx` feeds root categories to the explorer | VERIFIED | Imports `getRootCategories`; calls `getRootCategories()` in `Promise.all`; passes `rootCategories={rootCategories}` to `<WelcomeExplorer>` |
| 9 | /browse Category facet is three dependent selects; changing parent deletes dependent URL keys | VERIFIED | `facet-sidebar.tsx` reads `rootId`, `subcategoryId`, `itemId` from search params; on root change: `p.delete("subcategory"); p.delete("item")`; on subcategory change: `p.delete("item")`; deepest computed as `params.get("item") ?? params.get("subcategory") ?? params.get("root")` |
| 10 | `app/(public)/browse/page.tsx` feeds root categories to facets + resolves context-bearing chip | VERIFIED | Imports `getRootCategories`; passes `rootCategories={rootCategories}` to both `<FacetSidebar>` and `<BrowseToolbarMobile>`; `resolveCategoryLabel` walks parent chain; chip removal `keys: ["category", "root", "subcategory", "item"]` |
| 11 | Human-verify checkpoints (Plans 03 + 04) were approved by the user | VERIFIED | `16-03-SUMMARY.md` L154: "Human-verify checkpoint (Task 3) approved by the user"; `16-04-SUMMARY.md` L108: "Human-verify checkpoint (Task 3) approved by the user" |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0025_part_taxonomy_v2.sql` | Recursive-CTE subtree match + idempotent re-seed + forward-migrate | VERIFIED | Contains `with recursive subtree`, 18 roots, 14 Fuel Tanks subcategories, items, deactivation of old 12 roots, re-tag of listing_categories, `security definer set search_path = ''` |
| `supabase/seed.sql` | New category seed block replacing old L146-210 flat tree | VERIFIED | New block at L145; 18 new roots + Fuel Tanks subtree; comment confirms old tree removed; no old root names present |
| `tests/integration/search.subtree.test.ts` | Subtree-match assertion: ancestor selection returns leaf-tagged listing | VERIFIED | 120+ line test; resolves root/subcategory/leaf ids from staging; asserts leaf result set is subset of root result set |
| `lib/listings/cascade.ts` | `getChildCategories(parentId)` and `getRootCategories()` server readers | VERIFIED | Both exported; correct filter posture; `CategoryOption` type exported; `getPartCategories` untouched |
| `components/welcome/welcome-explorer.tsx` | Reworked step machine: Make -> Model -> Category(root) -> Advanced(sub -> item + Condition) | VERIFIED | Imports `getChildCategories`; three-level state (rootCategory/subcategory/item); deepest category id in `params.set("category")`; approved by user |
| `app/(public)/page.tsx` | Passes root categories (getRootCategories) to the explorer | VERIFIED | Imports `getRootCategories`; passes `rootCategories={rootCategories}` to explorer |
| `components/search/facet-sidebar.tsx` | Category -> Subcategory -> Item dependent selects in FacetControls | VERIFIED | Imports `getChildCategories`; three URL keys (root/subcategory/item); dependent-key deletion on parent change; `rootCategories` prop on both `FacetControls` and `FacetSidebar` |
| `app/(public)/browse/page.tsx` | Root categories to facets + deepest category id + context chip | VERIFIED | Imports `getRootCategories`; `resolveCategoryLabel` walks parent chain; chip keys include all four category URL keys |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `0025_part_taxonomy_v2.sql` | `public.part_categories` | `with recursive subtree ... join subtree st on st.id = lc.category_id` | WIRED | Pattern confirmed in migration |
| `getChildCategories` | `public.part_categories` | `.eq("parent_id", parentId)` | WIRED | Pattern confirmed in `lib/listings/cascade.ts` L79 |
| `getRootCategories` | `public.part_categories` | `.is("parent_id", null)` | WIRED | Pattern confirmed in `lib/listings/cascade.ts` L93 |
| `welcome-explorer.tsx` | `getChildCategories` | `await getChildCategories(c.id)` on pickRootCategory + pickSubcategory | WIRED | Lines 108 + 114 |
| `welcome-explorer runSearch` | `/browse ?category=` | `params.set("category", String(deepestCategory.id))` | WIRED | Line 169 |
| `facet-sidebar.tsx` | `getChildCategories` | `useEffect` keyed on `rootId`/`subcategoryId` | WIRED | Lines 131-146 |
| `FacetControls category selects` | URL `category` param | `p.delete("subcategory"); p.delete("item")` on root change; deepest computed inline | WIRED | Lines 340-376 |
| `browse/page.tsx` | `resolveCategoryLabel` | Walks `parent_id` chain via Supabase query | WIRED | Lines 241-260 |
| `browse/page.tsx` chip | All four category URL keys | `keys: ["category", "root", "subcategory", "item"]` | WIRED | Line 216 |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| FITL-05 | 16-01, 16-02, 16-03, 16-04 | Part Categories as 3-level taxonomy (root -> subcategory -> item) | SATISFIED | Migration 0025 seeds 18 roots + Fuel Tanks subtree; cascade readers expose one level at a time; explorer and /browse facet both drill 3 levels |
| SRCH-03 | 16-01, 16-02, 16-03, 16-04 | Buyer can filter/search by Part Category | SATISFIED | `search_listings` RPC subtree-expands a single `category` id; welcome explorer and /browse facet both pass the deepest chosen id as the single `category` param |
| FINT-03 | 16-01, 16-04 | A listing appears in every applicable fitment search result and category | SATISFIED | Subtree CTE ensures a listing tagged at a leaf appears when any ancestor is selected; old listing_categories rows re-tagged to new leaf in Section D of 0025 |

Note: FITL-05, SRCH-03, FINT-03 are marked Complete in `.planning/milestones/v1.0-REQUIREMENTS.md`. Phase 16 materially extends their behavior (flat -> 3-level; exact-match -> subtree-match) without assigning new IDs, as documented in the phase requirements note.

---

### Anti-Patterns Found

None. No TODO/FIXME/PLACEHOLDER/unimplemented stubs detected in any phase-16 file. The `return []` calls in `lib/listings/cascade.ts` are the intentional error-degradation path required by the plan.

---

### Human Verification Required

Both human-verify checkpoints were completed and approved by the user prior to this automated verification:

- Plan 16-03 checkpoint: user confirmed Make -> Model -> See results works with no category; Category -> Subcategory -> Item drill narrows results; single category chip shows deepest level (16-03-SUMMARY.md).
- Plan 16-04 checkpoint: user confirmed /browse three-level category facet on desktop and mobile (16-04-SUMMARY.md).

No further human verification is required.

---

## Summary

All 11 observable truths verified. Every artifact is substantive (not a stub) and wired. The phase delivered:

1. Migration `0025_part_taxonomy_v2.sql` — recursive-CTE subtree match in `search_listings` (signature frozen), 18-root taxonomy seeded idempotently, old 12-root flat tree deactivated, old listing_categories rows re-tagged onto a valid new leaf.
2. `supabase/seed.sql` updated — fresh `db reset` yields exactly one taxonomy (no old roots).
3. `tests/integration/search.subtree.test.ts` — end-to-end subtree-match assertion against staging.
4. `lib/listings/cascade.ts` — `getChildCategories` and `getRootCategories` with correct active-only, order-by-name, `[]`-on-error posture; `getPartCategories` untouched.
5. Welcome explorer — reworked to Make -> Model -> Category(root) -> Advanced(sub -> item + Condition); single deepest `category` param in URL.
6. `/browse` facet — three dependent selects; parent change deletes dependent URL keys; context-bearing chip clears all four category keys; desktop sidebar and mobile sheet share the same `FacetControls` body.

---

_Verified: 2026-06-18_
_Verifier: Claude (gsd-verifier)_
