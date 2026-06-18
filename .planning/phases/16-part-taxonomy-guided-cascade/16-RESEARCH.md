# Phase 16: Part Taxonomy & Guided Cascade - Research

**Researched:** 2026-06-18
**Domain:** Postgres adjacency-tree (recursive CTE) + Supabase RPC + Next.js dependent-cascade UI + reference-data seeding
**Confidence:** HIGH (this is a brownfield phase; every data-model claim below was verified against the actual migrations/code, not training data)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Year model (for the future year phase):** a from–to **range** per listing.
- **Taxonomy data now:** build the 3-level structure + seed the **20 root categories** + the **full "Fuel Tanks, Straps & Accessories" subtree**. The other 19 root subtrees are seeded later as the data arrives.
- **Sequence:** taxonomy first (this phase), year as a separate later phase.

### Claude's Discretion
- Whether the re-seed lands as a migration vs a seed-script edit (this research recommends: a **new migration**, see Pitfall 1 / Architecture).
- Whether listings are tagged at multiple levels or leaf-only (this research recommends: **leaf-only**, see Don't-Hand-Roll + Pitfall 4).
- Exact root names/order — CONTEXT says "Confirm exact names/order with the stakeholder at plan time" (the board image has duplicate rows → ~18 unique roots).
- How the existing v1.0 facet/e2e tests that assume old flat categories get updated.

### Deferred Ideas (OUT OF SCOPE)
- **YEAR is explicitly OUT of scope** for this phase. Its own later phase covers: a from–to year range on listings + the create-listing form + the search RPC + a Year cascade step **between Model and Category**. Design nothing for year now, but do not block it: the cascade rework should leave a natural seam where a Year step can later slot between Model and Category.
- The other 19 root subtrees beyond Fuel Tanks (added later as data arrives).
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs were pre-mapped (init showed "TBD"). Phase 16 is **new functional scope** that *extends* shipped v1.0 requirements rather than introducing new IDs. The relevant existing requirements (from `.planning/milestones/v1.0-REQUIREMENTS.md`) the planner should record in frontmatter:

| ID | Description (v1.0) | How Phase 16 extends it | Research support |
|----|--------------------|--------------------------|------------------|
| **FITL-05** | Fitment library models Part Categories as Level 5 | Replaces the 12-root/2-level placeholder tree with the stakeholder-approved 3-level taxonomy (root → subcategory → item) | seed.sql L146-210 confirms the current placeholder; 0003 schema already supports N levels |
| **SRCH-03** | Buyer can filter/search by … Part Category … | Category filter now matches the whole descendant **subtree**, not one exact id | Recursive-CTE pattern below; current `search_listings` (0024) matches exact `category_id` only |
| **FINT-03** | A confirmed listing appears in every applicable part category | Leaf-tagged listings now surface under their ancestor categories via the subtree match | `listing_categories` join (0012) + recursive CTE |
| **SRCH-01 / SRCH-02** | Browse feed / keyword search | Unchanged contract; the `/browse` facet rework and welcome cascade rework sit on top | params.ts + facet-sidebar.tsx + welcome-explorer.tsx |

**Recommendation:** set frontmatter `requirements: [FITL-05, SRCH-03, FINT-03]` (the three this phase materially changes). Confirm with the planner whether to also list SRCH-01/02 as "touched".
</phase_requirements>

## Summary

This phase is almost entirely **data + query + UI plumbing on an existing, working schema** — there is no new table and (most likely) no new column. The `part_categories` table (migration `0003_fitment_taxonomy.sql`) is already a self-referencing adjacency tree (`parent_id bigint references part_categories(id) on delete restrict`, `unique(parent_id, name)`, index on `parent_id`, RLS public-read), so 3 levels need **only seed data**. The `listing_categories(listing_id, category_id)` join (`0012_fitment_rules.sql`) already tags listings to categories with public-read + owner-write-via-EXISTS RLS. The only schema-adjacent risk is `is_active` (added to `part_categories` in `0019_admin_operations.sql`) — all category readers filter `is_active = true`, so re-seeded rows inherit `default true` automatically.

The single non-trivial engineering task is teaching the `search_listings` RPC to match a category's **whole descendant subtree** instead of one exact id. The current RPC (latest definition in `0024_search_slang_target_expansion.sql`) matches the category facet with `exists (select 1 from listing_categories lc where lc.listing_id = l.id and lc.category_id = p_category_id)`. The change is to replace that inner predicate with a **recursive CTE** that expands `p_category_id` to itself + all descendants, then matches `lc.category_id in (that set)`. The RPC **signature is frozen** (the TS reader `lib/search/queries.ts` and an integration gate call it positionally), so the change must be body-only — same params, same return columns, same `security definer set search_path = ''` posture.

The rest is mechanical and follows patterns already in the repo: a `getChildCategories(parentId)` reader mirroring `getModels`/`getConfigs` in `lib/garage/cascade.ts`; reworking `components/welcome/welcome-explorer.tsx` (client cascade) and `components/search/facet-sidebar.tsx` (the `FacetControls` body, which `browse-toolbar-mobile.tsx` reuses — so one edit covers desktop + mobile); and re-seeding/re-tagging via a new migration. **Correcting a CONTEXT.md error:** CONTEXT says the old categories were "app-seeded into staging (not via migration)". This is **false** — they live in `supabase/seed.sql` (L146-210). That changes the re-seed strategy materially (see Pitfall 1).

**Primary recommendation:** Ship a single new migration `0025_part_taxonomy_v2.sql` that (a) redefines `search_listings` with a recursive-CTE descendant match (body-only, signature frozen), and (b) seeds the ~18 roots + the Fuel Tanks subtree idempotently with `on conflict (parent_id, name) do nothing`. Re-tag/clear staging test listings in the same migration or a guarded follow-up. Then add `getChildCategories(parentId)`, rework the two cascade UIs, and update the v1.0 facet/e2e fixtures that name old categories. Tag listings **leaf-only**; let the recursive CTE surface them under ancestors.

## Standard Stack

This phase introduces **no new libraries**. It uses what's already pinned and in-repo.

### Core
| Tool | Version (in repo) | Purpose | Why standard here |
|------|-------------------|---------|-------------------|
| PostgreSQL (Supabase) | 17 (project runs on 17) | `WITH RECURSIVE` CTE for subtree expansion | Native, indexed on `parent_id`, no extension needed |
| Supabase JS / RPC | `@supabase/supabase-js@2.106.x` | `supabase.rpc("search_listings", …)` already wired | Existing reader contract — keep the frozen signature |
| Next.js Server Actions | Next 16 / React 19 | `"use server"` cascade readers (`getModels` pattern) | `getChildCategories` mirrors this exactly |
| shadcn/ui `Select` + `Sheet` | CLI-installed (owned) | Dependent-select facets on `/browse` | Already used in `facet-sidebar.tsx` |

### Supporting
| Tool | Purpose | When to use |
|------|---------|-------------|
| Supabase migrations (`supabase/migrations/`) | Schema + reference-data source of truth | The re-seed + RPC change land here (RLS policies live in migrations, per CLAUDE.md) |
| `supabase/seed.sql` | Existing reference-data seed (L146-210 is the OLD category tree) | Either retire the old block here OR supersede it in the new migration (see Pitfall 1) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Adjacency list + recursive CTE | `ltree` / materialized path / closure table | Rejected — schema is already adjacency-list, tree is tiny (≤3 levels, hundreds of rows), recursive CTE is fast and zero-migration-risk. Switching models is unjustified churn. |
| Recursive CTE inside the RPC | Resolve descendant ids in TS, pass an `int[]` to the RPC | Rejected — would change the **frozen RPC signature** (the whole point is to keep it backward-compatible). Keep expansion server-side in SQL. |

**Installation:** none — no `npm install`, no new extension.

## Architecture Patterns

### Verified data-model facts (checked against actual files)

| CONTEXT.md claim | Verdict | Evidence |
|------------------|---------|----------|
| `part_categories` is adjacency tree (`parent_id`, `unique(parent_id, name)`) | ✅ TRUE | `0003_fitment_taxonomy.sql` L144-156: `parent_id ... on delete restrict`, `unique(parent_id, name)`, `part_categories_parent_id_idx` |
| 3 levels need no schema change, only seed data | ✅ TRUE | adjacency list is depth-unbounded; nothing caps it at 2 |
| `listing_categories(listing_id, category_id)` join + RLS | ✅ TRUE | `0012_fitment_rules.sql` L101-140: public-read + owner-write-via-EXISTS; `on delete restrict` on `category_id` |
| `search_listings` matches **exact** `category_id` today | ✅ TRUE | `0024_*` L107-113: `lc.category_id = p_category_id` |
| Old categories were "app-seeded into staging (not via migration)" | ❌ **FALSE** | They're in `supabase/seed.sql` L146-210 (12 roots, 2 levels). This is a **load-bearing correction** — see Pitfall 1. |
| `unique(parent_id, name)` allows same name under different parents | ✅ TRUE | NULL parents don't collide (so roots use guarded `where not exists`); non-NULL parents make `(parent, name)` unique per-parent |

**Extra facts the planner needs that CONTEXT didn't state:**
- `part_categories.is_active boolean not null default true` was added in `0019_admin_operations.sql` (L179). **Every** category reader filters `eq("is_active", true)` (`lib/listings/cascade.ts` `getPartCategories`). New seed rows inherit `default true` — fine. But any "clear old categories" step should prefer **deactivate** (`is_active = false`) or **delete** carefully because of FK `on delete restrict` from `listing_categories`.
- An **admin taxonomy editor exists** (`lib/actions/admin/taxonomy.ts`) that can create `part_categories` rows at runtime with a parent. The seed is the baseline, not the only writer — don't assume the table is seed-only.
- Listings are tagged via `lib/actions/listings.ts` (create L275-282, edit L455-481): it inserts whatever `categoryIds` the form submits, at **any** level — there is **no leaf-only constraint today**. Leaf-only is a convention to enforce in the UI, not a DB guarantee (see Pitfall 4).
- The create/edit category picker is **not** the dependent cascade — it currently consumes the flat `getPartCategories()` list (`fitment-suggestions.tsx` / form). CONTEXT scopes the cascade rework to **welcome + /browse**, not the create-listing form. Confirm at plan time whether create-listing should also move to leaf-only dependent selects (recommended, but may be out of scope for this phase).

### Pattern 1: Recursive-CTE descendant match inside the frozen RPC
**What:** Expand the selected `p_category_id` to itself + all descendants, then match listings tagged with any node in that set.
**When to use:** The category facet arm of `search_listings`, replacing the exact-id `exists`.
**Backward-compat rule:** body-only change — keep the exact signature, return table, and `language sql stable security definer set search_path = ''`. Because `search_path = ''`, every object must be schema-qualified (`public.part_categories`, `public.listing_categories`).

```sql
-- Source: pattern verified against PostgreSQL WITH RECURSIVE docs + repo's 0024 RPC shape.
-- Replaces ONLY the part-category facet arm in search_listings; everything else byte-identical.
    -- part-category facet (subtree match: selected node + all descendants)
    and (
      p_category_id is null
      or exists (
        with recursive subtree as (
          select id from public.part_categories where id = p_category_id
          union all
          select c.id
          from public.part_categories c
          join subtree s on c.parent_id = s.id
        )
        select 1
        from public.listing_categories lc
        join subtree st on st.id = lc.category_id
        where lc.listing_id = l.id
      )
    )
```

Notes:
- The recursion walks **down** via `c.parent_id = s.id` (children of the current frontier). `part_categories_parent_id_idx` backs this — each step is an index lookup. With ≤3 levels and hundreds of rows the CTE is trivially cheap; no new index needed.
- `on delete restrict` on `part_categories.parent_id` guarantees no orphaned children, so the tree is always well-formed (no infinite cycle possible since ids are assigned parent-before-child and a category "cannot be its own parent" is enforced by the admin action `lib/actions/admin/taxonomy.ts` L157-162).
- Leaf-only tagging makes this even cheaper (only leaves appear in `listing_categories`), but the CTE is correct either way.

### Pattern 2: `getChildCategories(parentId)` cascade reader (mirror `getModels`)
**What:** A `"use server"` reader returning the direct children of a parent category, `is_active`-filtered, alphabetical.
**When to use:** Both the welcome explorer (Category root → subcategory → item) and `/browse` dependent selects.
**Mirror exactly:** `lib/garage/cascade.ts` `getModels` (guard, cookie-bound `createClient()`, `eq("is_active", true)`, `.order("name")`, `[]` on error).

```typescript
// Source: mirrors lib/garage/cascade.ts getModels (verified) — add to lib/listings/cascade.ts
// (where the part-category readers already live) or a new lib/categories/cascade.ts.
"use server";
import { createClient } from "@/lib/supabase/server";
export type CascadeOption = { id: number; name: string };

/** Direct child categories of a parent (root → subcategory → item), is_active only. */
export async function getChildCategories(parentId: number): Promise<CascadeOption[]> {
  if (!Number.isInteger(parentId) || parentId <= 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("part_categories")
    .select("id, name")
    .eq("parent_id", parentId)
    .eq("is_active", true)   // ADMO-05 picker-only filter, same as getModels
    .order("name");
  if (error || !data) return [];
  return data as CascadeOption[];
}
```
For the **roots** (welcome Category step + /browse top select), add a sibling `getRootCategories()` that filters `parent_id is null` (`.is("parent_id", null)`), since `getChildCategories` only returns children of a given parent.

### Pattern 3: Dependent-select UX (already established — copy it, don't reinvent)
The repo has **two** consistent dependent-cascade idioms; reuse the matching one per surface:

- **Welcome explorer (`welcome-explorer.tsx`)** — step-state machine: `pickX` sets the value, loads the next level via the async reader, advances `step`; `removeX` clears that level **plus every dependent below it** and rewinds `step`; a `back()` maps each step to its `removeX`. The rework adds Category-root and item steps and threads `getChildCategories`/`getRootCategories` into `pickCategory`/`pickSubcategory`. Keep the existing "reset-on-parent-change" discipline.
- **`/browse` facet sidebar (`facet-sidebar.tsx` `FacetControls`)** — URL-as-state + `useEffect` loaders: each facet reads its value from `useSearchParams()`, loads dependents in an `active`-guarded `useEffect`, and `router.replace`s on change while **deleting dependent keys** (`p.delete("model"); p.delete("config")`). The new Category → Subcategory → Item selects follow this exactly: changing Category deletes the subcategory/item params, changing Subcategory deletes the item param.

**Critical reuse fact:** `browse-toolbar-mobile.tsx` imports and renders the **same** `FacetControls` body (L22). Reworking `FacetControls` updates desktop sidebar **and** mobile sheet in one edit — do not fork them.

### Recommended file touch-list (concrete)
```
supabase/migrations/0025_part_taxonomy_v2.sql   # NEW: RPC subtree match + re-seed + re-tag/clear
supabase/seed.sql                               # EDIT: retire/replace old category block (L146-210)
lib/listings/cascade.ts                         # EDIT: add getChildCategories + getRootCategories
                                                #       (getPartCategories may stay for create-listing)
components/welcome/welcome-explorer.tsx         # EDIT: Make→Model→(search)→Category(root)→Advanced(sub→item+Condition)
components/welcome/welcome-actions-mobile.tsx   # CHECK: mobile parity of the new cascade
components/search/facet-sidebar.tsx             # EDIT: Category→Subcategory→Item dependent selects (covers mobile too)
app/(public)/browse/page.tsx                    # EDIT: pass root categories; chip-label resolution for sub/item
components/search/active-filter-chips.tsx       # CHECK: chip removal for the new category levels
lib/search/params.ts                            # CHECK: category param stays single `category` id (subtree match means one id is enough) — likely NO change
e2e/*.spec.ts + any vitest facet tests          # EDIT: fixtures that name old categories ('Hoods & Fenders', etc.)
```

### Anti-Patterns to Avoid
- **Changing the `search_listings` signature** (e.g. adding `p_category_ids int[]`). The reader and integration gate call it positionally; a signature change is a breaking regression. Expand the subtree **inside** the SQL body.
- **`LIKE '%name%'` anywhere** (CLAUDE.md invariant 7). Category matching is id-based via the join + CTE; never string-match category names.
- **Deleting old `part_categories` rows that have `listing_categories` referencing them** — FK is `on delete restrict`; the delete will fail. Re-tag or deactivate first (Pitfall 3).
- **Forking desktop/mobile facet bodies** — both render `FacetControls`. One edit, not two.
- **Adding a NOT-NULL or leaf-only DB constraint that retroactively breaks existing multi-level tags** — enforce leaf-only in the UI/seed; don't bolt a constraint onto a table the admin editor and old listings already populate at mixed levels.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Subtree expansion | A TS loop that fetches children level-by-level and unions ids client-side | `WITH RECURSIVE` in the RPC | One round-trip, indexed, atomic with the search; client-side expansion changes the frozen signature and adds N+1 reads |
| Dependent-select state | A fresh select-with-loading component | Copy `FacetControls` (`useEffect` + `router.replace` + delete-dependent-keys) and `welcome-explorer` step machine | Both already handle loading, reset-on-parent-change, and URL sync correctly |
| Cascade reader | A new bespoke query helper | Mirror `getModels`/`getConfigs` (`is_active` filter, `[]` on error, cookie-bound client) | Same RLS posture, same caching/error contract; planner-verifiable parity |
| Leaf-only tagging | A DB CHECK/trigger | UI convention (only allow selecting an item-level node to tag) + seed discipline | The table is written by the admin editor and historic listings at mixed levels; a hard constraint risks breaking them |
| Idempotent seed | Ad-hoc INSERTs | `on conflict (parent_id, name) do nothing` for children; guarded `where not exists` for NULL-parent roots | Exactly the existing seed.sql idiom (L151-210); re-runnable, migration-safe |

**Key insight:** Every hard part of this phase already has a verified in-repo precedent. The job is faithful reuse, not invention — the one genuinely new artifact is the recursive-CTE arm in the RPC.

## Common Pitfalls

### Pitfall 1: The "app-seeded, not migration" premise is wrong — re-seed strategy must account for seed.sql
**What goes wrong:** CONTEXT.md says old categories were app-seeded into staging, implying you can just insert a new tree and ignore the old one. In reality they're in `supabase/seed.sql` (L146-210) and were applied to Staging via that seed. If you add a new migration that seeds the new tree but leave seed.sql's old block, a future `db reset` / re-seed re-creates the **old 12-root tree alongside** the new one — duplicate/competing taxonomies.
**Why it happens:** Trusting CONTEXT's "verified" data-model facts without reading seed.sql.
**How to avoid:** Treat the re-seed as a **two-file change**: (a) new migration `0025_*` seeds the new tree idempotently and reconciles existing rows; (b) **edit `supabase/seed.sql` L146-210** to either remove the old category block or replace it with the new tree, so a fresh `db reset` produces exactly one taxonomy. Decide explicitly whether Staging gets a forward migration (re-tag + deactivate old) vs a clean reset.
**Warning signs:** After deploy, `/browse` Category select shows both "Hoods & Fenders" (old) and "Fuel Tanks, Straps & Accessories" (new).

### Pitfall 2: Frozen RPC signature broken by the subtree change
**What goes wrong:** Rewriting `search_listings` to take a category-array param or changing the return columns breaks `lib/search/queries.ts` (positional `rpc` call) and the integration gate, silently returning zero results or erroring.
**Why it happens:** Natural instinct to "pass the expanded ids in".
**How to avoid:** `create or replace function public.search_listings(...)` with the **identical** parameter list and return table from `0024`; change only the part-category facet arm body. Keep `security definer set search_path = ''` and schema-qualify everything.
**Warning signs:** TS type errors on the `rpc` call, or e2e search returning empty; `explain_search_plan` gate flapping.

### Pitfall 3: `on delete restrict` blocks deleting old category rows
**What goes wrong:** Any old category id referenced by a `listing_categories` row cannot be deleted (`listing_categories.category_id ... on delete restrict`, and `part_categories.parent_id ... on delete restrict` blocks deleting a parent with children). The migration aborts.
**Why it happens:** "Clear old categories" implemented as a blind `delete from part_categories`.
**How to avoid:** Re-tag staging test listings onto new leaf ids first (or clear `listing_categories` for test listings), then delete childless old rows bottom-up — **or** simpler: set old roots/children `is_active = false` (readers already hide them) and leave the rows. Memory note `buyer-test-account.md` identifies the seller account (`12gapatricio` / RenamedTrucker) whose listings carry tags; re-tag those.
**Warning signs:** Migration error `update or delete on table "part_categories" violates foreign key constraint`.

### Pitfall 4: Multi-level tags defeat the subtree match's intent
**What goes wrong:** If listings are tagged at both a leaf AND an ancestor (or only at an ancestor), the subtree match still works, but result counts and the FINT-03 "appears in every applicable category" guarantee get muddy, and de-dup in `listing_categories` (unique `(listing_id, category_id)`) won't catch cross-level redundancy.
**Why it happens:** The DB allows tagging at any level (no leaf constraint); the form currently submits whatever ids are chosen.
**How to avoid:** Adopt **leaf-only tagging** as the convention (CONTEXT's recommendation). In the welcome/browse cascade and — if in scope — the create-listing picker, only **item-level** nodes are taggable/selectable as the final filter; ancestors are navigation only. The recursive CTE then surfaces leaf-tagged listings under any ancestor automatically. Document this as the rule; no DB constraint.
**Warning signs:** A listing appears twice in a category count, or an ancestor filter returns a listing tagged only at the ancestor (not a leaf).

### Pitfall 5: `is_active` filter hides re-seeded rows or strands old ones
**What goes wrong:** Readers filter `is_active = true`. If you deactivate old rows to "clear" them but the new seed collides on `unique(parent_id, name)` with a deactivated old row, `on conflict do nothing` keeps the **deactivated** row — the new category silently never appears.
**Why it happens:** Name reuse between old and new trees under the same parent (unlikely across different roots, but possible — e.g. "Lighting" exists in both old and new root lists).
**How to avoid:** For any name that exists in both trees, either reactivate-and-reparent in the migration, or choose distinct root names. Audit the new root list against seed.sql L154-165 for collisions ("Lighting" is in both). Prefer an explicit `update ... set is_active = true` for intentionally-kept names rather than relying on conflict-do-nothing.
**Warning signs:** A seeded category is missing from the Category select despite being in the migration.

### Pitfall 6: Duplicate item names across subcategories are fine in DB but ambiguous in UI
**What goes wrong:** CONTEXT notes "Fuel Tank Light Brackets" appears under Mounting, Lighting, and Strap-Covers. `unique(parent_id, name)` allows this (different parents). But if any UI renders items flat (like the current `getPartCategories` flat list with 2-space indent in `facet-sidebar.tsx` L288), the user sees three identical "Fuel Tank Light Brackets" with no parent context.
**Why it happens:** Reusing the flat-render path for a 3-level tree.
**How to avoid:** The new cascade is **dependent selects** (item list is always scoped to a chosen subcategory), so duplicates never appear side-by-side — this is another reason to use the cascade, not a flat indented list. Ensure chip labels on `/browse` show enough context (e.g. "Fuel Tank Lighting › Fuel Tank Light Brackets") so a shared URL is unambiguous.
**Warning signs:** Three identical option labels in one select; an active-filter chip that doesn't identify which item was chosen.

### Pitfall 7: Welcome cascade "search now" seam vs. Year deferral
**What goes wrong:** The target flow is Make → Model → **(search now, no more data)** → Category(root) → Advanced. If the rework hard-couples Category directly after Model, the deferred Year phase (which slots Year **between** Model and Category) will require re-threading the state machine.
**Why it happens:** Optimizing only for today's flow.
**How to avoid:** Keep each step's advance/reset isolated (as the current `welcome-explorer` already does) so a Year step can later be inserted between `model` and `category` steps without rewriting siblings. Don't design Year now — just don't weld Model→Category shut.
**Warning signs:** A single handler that does model-and-category together.

## Code Examples

### Idempotent seed for the new tree (matches existing seed.sql idiom)
```sql
-- Source: existing supabase/seed.sql L151-210 idiom (verified). Roots: guarded where-not-exists
-- (NULL parent_id doesn't dedupe in a unique index). Children: on conflict (parent_id, name).
-- ROOTS (~18 unique — confirm exact names/order with stakeholder)
insert into public.part_categories (parent_id, name)
select null, v.name
from (values
  ('Grill & Accessories'),
  ('Fuel Tanks, Straps & Accessories'),
  ('Exhaust & Accessories')
  -- … remaining roots
) v(name)
where not exists (
  select 1 from public.part_categories pc
  where pc.parent_id is null and pc.name = v.name
);

-- SUBCATEGORIES under a root (resolve parent by name)
insert into public.part_categories (parent_id, name)
select p.id, v.child
from (values
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tanks'),
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tank Straps'),
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tank Strap Covers')
  -- … remaining subcategories
) v(parent, child)
join public.part_categories p on p.parent_id is null and p.name = v.parent
on conflict (parent_id, name) do nothing;

-- ITEMS under a subcategory (resolve parent by (root, subcategory))
insert into public.part_categories (parent_id, name)
select sub.id, v.item
from (values
  ('Fuel Tanks', 'Driver Side Fuel Tanks'),
  ('Fuel Tanks', 'Passenger Side Fuel Tank'),
  ('Fuel Tank Straps', 'Stainless Fuel Tank Straps')
  -- … remaining items
) v(subname, item)
join public.part_categories sub
  on sub.name = v.subname
  and sub.parent_id = (select id from public.part_categories
                       where parent_id is null and name = 'Fuel Tanks, Straps & Accessories')
on conflict (parent_id, name) do nothing;
```
Note the item insert must disambiguate the subcategory by its parent root, because subcategory names could later repeat across roots.

### `getRootCategories()` companion reader
```typescript
// Source: mirrors getPartCategories in lib/listings/cascade.ts (verified)
"use server";
export async function getRootCategories(): Promise<CascadeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("part_categories")
    .select("id, name")
    .is("parent_id", null)
    .eq("is_active", true)
    .order("name");
  if (error || !data) return [];
  return data as CascadeOption[];
}
```

## State of the Art

| Old Approach (in repo) | New Approach (this phase) | Impact |
|------------------------|---------------------------|--------|
| 12 roots, 2-level category tree (seed.sql) | ~18 roots, 3-level (root → subcategory → item) | Replace seed block + re-seed migration |
| `search_listings` exact `category_id` match | Recursive-CTE descendant (subtree) match | Ancestor selection finds all leaf-tagged descendants |
| Flat `getPartCategories()` indented list in facets | Dependent Category → Subcategory → Item selects | New `getChildCategories`/`getRootCategories` readers; cascade UI rework |
| Welcome: Make→Model→Part(flat)→Config→Advanced | Make→Model→(search)→Category(root)→Advanced(sub→item+Condition) | `welcome-explorer` step-machine rework |

**Deprecated/outdated:** the seed.sql category block (L146-210) and any test fixture asserting old category names ('Hoods & Fenders', 'Lighting', 'Mirrors', 'Exhaust & Stacks', 'Bumpers', 'Grilles', 'Interior', 'Drivetrain', 'Suspension', 'Electrical', 'Glass', 'Body & Cab') become stale. Grep these before/after.

## Open Questions

1. **Exact root list (18 vs 20) and names/order**
   - What we know: CONTEXT lists 18 numbered roots but says "~18 unique" (board image repeats "Air Cleaners…" and "Light Brackets & Accessories"); the phase goal text says "20 root categories".
   - What's unclear: the canonical count and whether "Light Brackets & Accessories" (root #17) is distinct from "Air Cleaners, Screens, Light Brackets & Accessories" (#4).
   - Recommendation: planner confirms the final list with the stakeholder before writing the seed (CONTEXT explicitly says to). The migration must seed exactly the confirmed set.

2. **Does the create-listing category picker move to leaf-only dependent selects this phase?**
   - What we know: CONTEXT scopes the cascade rework to welcome + /browse. The create-listing form uses the flat `getPartCategories()` and tags at any level.
   - What's unclear: whether leaf-only tagging is enforced at create time (the source of tags) or only assumed.
   - Recommendation: to actually achieve leaf-only data, the create/edit picker should also restrict to item-level nodes. Flag to planner as a scope decision — if deferred, document that historic/admin tags may be non-leaf and the CTE handles it anyway.

3. **Staging migration path: forward-migrate vs clean reset**
   - What we know: old categories are in seed.sql; Staging already has tagged test listings (`12gapatricio`).
   - What's unclear: whether Staging can be `db reset` (loses test data) or must be forward-migrated (re-tag + deactivate old).
   - Recommendation: forward-migrate (deactivate old roots, re-tag test listings to new leaves) to preserve Staging test accounts; keep seed.sql correct for fresh environments.

4. **Does `lib/search/params.ts` need any change?**
   - What we know: the `category` URL param is a single id; subtree matching means one ancestor id is sufficient to filter.
   - What's unclear: whether the UI wants to also persist the chosen subcategory/item ids in the URL for chip display, or just the deepest chosen id.
   - Recommendation: keep a **single `category` id** = the deepest node the user picked (item if chosen, else subcategory, else root). The CTE expands it. Chip labels resolve the name + ancestors for display. Likely **no param-contract change** — confirm during planning.

## Sources

### Primary (HIGH confidence — read directly this session)
- `supabase/migrations/0003_fitment_taxonomy.sql` — `part_categories` adjacency tree, `unique(parent_id, name)`, `parent_id` index, RLS public-read
- `supabase/migrations/0012_fitment_rules.sql` — `listing_categories` join, public-read + owner-write-via-EXISTS RLS, `on delete restrict`
- `supabase/migrations/0019_admin_operations.sql` — `is_active` added to `part_categories` (L179)
- `supabase/migrations/0023_search_security_definer.sql` + `0024_search_slang_target_expansion.sql` — current `search_listings` signature + exact-`category_id` facet arm; `security definer set search_path = ''` posture
- `supabase/seed.sql` (L146-210) — the ACTUAL old category seed (corrects CONTEXT's "app-seeded" claim)
- `lib/garage/cascade.ts` — `getModels`/`getConfigs` reader pattern to mirror
- `lib/listings/cascade.ts` — `getPartCategories` (`is_active` filter, error contract)
- `lib/search/queries.ts` — `searchListings` positional `rpc` call (frozen signature)
- `lib/search/params.ts` — URL ↔ SearchQuery contract (`category` single id)
- `components/welcome/welcome-explorer.tsx` — client cascade step-machine
- `components/search/facet-sidebar.tsx` — `FacetControls` dependent-select + URL-state pattern (reused by mobile)
- `components/search/browse-toolbar-mobile.tsx` — confirms it renders the same `FacetControls` (L22)
- `lib/actions/listings.ts` (L215-282, 455-481) — category tagging at any level, `is_active` validation
- `lib/actions/admin/taxonomy.ts` — runtime category creation + "can't be own parent" guard
- `components/listings/fitment-multi-select.tsx` — the loading-state cascade idiom in the listing form
- `.planning/milestones/v1.0-REQUIREMENTS.md` — FITL-05, SRCH-03, FINT-03 definitions

### Secondary (MEDIUM confidence)
- PostgreSQL `WITH RECURSIVE` adjacency-tree traversal — standard, stable since PG 8.4; pattern is textbook and matches the indexed `parent_id` already present.

### Tertiary (LOW confidence)
- None — this phase was researched entirely against the live codebase; no unverified web claims were relied upon.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; everything verified in-repo and pinned in CLAUDE.md
- Architecture: HIGH — every data-model claim checked against the actual migration/source, including a load-bearing correction to CONTEXT (seed.sql, not app-seed)
- Pitfalls: HIGH — derived from real FK constraints (`on delete restrict`), real `is_active` filters, and the real frozen-signature reader

**Research date:** 2026-06-18
**Valid until:** 2026-07-18 (stable — schema and patterns are settled; re-verify only if the search RPC or seed.sql change before planning)
