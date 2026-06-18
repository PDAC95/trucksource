-- 0025_part_taxonomy_v2.sql
-- Phase 16 — Part Taxonomy & Guided Cascade (Plan 01).
--
-- TWO COUPLED CHANGES, ONE ATOMIC + IDEMPOTENT MIGRATION. They share the
-- part_categories / listing_categories tables and must land together:
--
--   1. SUBTREE SEARCH (SRCH-03 / FINT-03): rewrite ONLY the part-category facet
--      arm of search_listings so a selected p_category_id expands to itself +
--      all descendants via a recursive CTE, matching listings tagged at ANY node
--      in that subtree. The signature, return columns, and definer posture
--      (`security definer set search_path = ''`) are byte-identical to 0024 —
--      readers (lib/search/queries.ts) and the search.contract integration gate
--      call this RPC positionally; a signature change is a breaking regression.
--
--   2. TAXONOMY RE-SEED (FITL-05): seed the confirmed 18 root categories
--      (16-CONTEXT.md "The 20 root categories" — 18 unique) + the FULL
--      "Fuel Tanks, Straps & Accessories" subtree (root -> subcategory -> item),
--      idempotently; deactivate the old 12-root flat tree (FK is
--      `on delete restrict` — deactivate, NEVER blind-delete; Pitfall 3);
--      re-tag listings on deactivated leaves onto a valid new leaf and drop the
--      stale join rows.
--
-- DECISION (Task 0 checkpoint resolved by user):
--   * Root set = the 18 unique roots from 16-CONTEXT.md, as-listed.
--   * "Lighting" collides by name with an OLD root (seed.sql L155). It is KEPT
--     as a new root: Section C deactivates the old flat tree (including the old
--     "Lighting" row), then an explicit reactivate in Section B restores that
--     exact row to is_active = true / parent_id = null so the category appears
--     and is not silently swallowed by the new seed's `on conflict do nothing`
--     against the deactivated row (Pitfall 5 fix).

-- ===========================================================================
-- SECTION A — Redefine search_listings (BODY-ONLY; signature FROZEN from 0024).
-- The parameter list and RETURNS table reproduce 0024 verbatim. The body is
-- copied byte-for-byte from 0024 EXCEPT the part-category facet arm, which is
-- replaced with a recursive-CTE subtree match. Every object is schema-qualified
-- because search_path = ''.
-- ===========================================================================
create or replace function public.search_listings(
  p_q text default null,
  p_model_id bigint default null,
  p_config_id bigint default null,
  p_category_id bigint default null,
  p_condition_id bigint default null,
  p_fits_model_id bigint default null,
  p_fits_config_id bigint default null,
  p_limit int default 24,
  p_offset int default 0
)
returns table (
  id bigint,
  title text,
  asking_price numeric,
  condition_id bigint,
  date_listed timestamptz,
  rank real,
  total_count bigint
)
language sql stable security definer set search_path = '' as $$
  select
    l.id,
    l.title,
    l.asking_price,
    l.condition_id,
    l.date_listed,
    case
      when p_q is null then 0
      else ts_rank(l.search_vector, websearch_to_tsquery('english', p_q))
    end as rank,
    count(*) over() as total_count
  from public.listings l
  where l.status = 'active'
    and l.hidden_at is null
    and (l.expires_at is null or l.expires_at > now())
    -- keyword arm: FTS tsvector OR per-listing slang tags OR slang taxonomy
    -- targets (exact + typo via similarity; active terms only)
    and (
      p_q is null
      or l.search_vector @@ websearch_to_tsquery('english', p_q)
      or exists (
        select 1
        from public.listing_search_terms lst
        join public.search_terms st on st.id = lst.term_id
        where lst.listing_id = l.id
          and st.is_active
          and public.similarity(st.term::text, p_q) >= 0.3
      )
      or exists (
        select 1
        from public.search_terms st
        join public.search_term_targets stt on stt.search_term_id = st.id
        where st.is_active
          and public.similarity(st.term::text, p_q) >= 0.3
          and (
            (stt.model_id is not null and exists (
              select 1 from public.listing_fitment lf
              where lf.listing_id = l.id and lf.model_id = stt.model_id))
            or (stt.make_id is not null and exists (
              select 1 from public.listing_fitment lf
              join public.models m on m.id = lf.model_id
              where lf.listing_id = l.id and m.make_id = stt.make_id))
            or (stt.config_id is not null and exists (
              select 1 from public.listing_fitment lf
              where lf.listing_id = l.id and lf.config_id = stt.config_id))
          )
      )
    )
    -- condition facet
    and (p_condition_id is null or l.condition_id = p_condition_id)
    -- model / config facet (config null = match any config of that model)
    and (
      p_model_id is null
      or exists (
        select 1
        from public.listing_fitment lf
        where lf.listing_id = l.id
          and lf.model_id = p_model_id
          and (p_config_id is null or lf.config_id is null or lf.config_id = p_config_id)
      )
    )
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
    -- fits-my-truck facet
    and (
      p_fits_model_id is null
      or exists (
        select 1
        from public.listing_fitment lf
        where lf.listing_id = l.id
          and lf.model_id = p_fits_model_id
          and (p_fits_config_id is null or lf.config_id is null or lf.config_id = p_fits_config_id)
      )
    )
  order by rank desc, l.date_listed desc
  limit p_limit offset p_offset;
$$;

-- ===========================================================================
-- SECTION B — Seed the new tree idempotently.
-- ROOTS use a guarded `where not exists` (NULL parent_id is NOT "equal" in the
-- unique index, so `on conflict (parent_id, name)` would never dedupe them).
-- SUBCATEGORIES / ITEMS resolve their parent by natural key and use
-- `on conflict (parent_id, name) do nothing`.
-- ===========================================================================

-- ROOTS (18 unique roots from 16-CONTEXT.md, as-listed).
insert into public.part_categories (parent_id, name)
select null, v.name
from (values
  ('Grill & Accessories'),
  ('Battery, Tool, DPF Covers & Boxes'),
  ('Fuel Tanks, Straps & Accessories'),
  ('Air Cleaners, Screens, Light Brackets & Accessories'),
  ('Mud Flaps, Hangers, Weights & Accessories'),
  ('Exhaust & Accessories'),
  ('Body Parts, Cab & Sleeper'),
  ('Bumpers and Accessories'),
  ('Tires & Rims'),
  ('Power Train & Running Gear'),
  ('Mirrors, Brackets & Accessories'),
  ('Front Windshield Sunvisor'),
  ('Interior & Seating'),
  ('Cab & Sleeper Light Panels'),
  ('Rear Fenders'),
  ('Lighting'),
  ('Light Brackets & Accessories'),
  ('Tail Light Panels')
) v(name)
where not exists (
  select 1 from public.part_categories pc
  where pc.parent_id is null and pc.name = v.name
);

-- SUBCATEGORIES under "Fuel Tanks, Straps & Accessories" (14 subcategories).
insert into public.part_categories (parent_id, name)
select p.id, v.child
from (values
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tanks'),
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tank Straps'),
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tank Strap Covers'),
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tank Mounting Components'),
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tank Steps'),
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tank End Caps'),
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tank Fairings & Covers'),
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tank Lighting'),
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tank Light Brackets & Accessories'),
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tank Filler Components'),
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tank Protection'),
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tank Accessories'),
  ('Fuel Tanks, Straps & Accessories', 'Fuel System Components'),
  ('Fuel Tanks, Straps & Accessories', 'Fuel Tank Repair Components')
) v(parent, child)
join public.part_categories p on p.parent_id is null and p.name = v.parent
on conflict (parent_id, name) do nothing;

-- ITEMS under each Fuel Tanks subcategory. Duplicate item names under DIFFERENT
-- subcategories are intentional (unique is per-parent) and kept as-is.
insert into public.part_categories (parent_id, name)
select sub.id, v.item
from (values
  -- Fuel Tanks
  ('Fuel Tanks', 'Fuel Tank Assemblies'),
  ('Fuel Tanks', 'Driver Side Fuel Tanks'),
  ('Fuel Tanks', 'Passenger Side Fuel Tank'),
  ('Fuel Tanks', 'Aluminum Fuel Tanks'),
  ('Fuel Tanks', 'Stainless Steel Fuel Tanks'),
  ('Fuel Tanks', 'Replacement Fuel Tanks'),
  ('Fuel Tanks', 'Custom Fuel Tanks'),
  -- Fuel Tank Straps
  ('Fuel Tank Straps', 'Fuel Tank Straps'),
  ('Fuel Tank Straps', 'Stainless Fuel Tank Straps'),
  ('Fuel Tank Straps', 'Aluminum Fuel Tank Straps'),
  ('Fuel Tank Straps', 'OEM Replacement Straps'),
  ('Fuel Tank Straps', 'Aftermarket Straps'),
  -- Fuel Tank Strap Covers
  ('Fuel Tank Strap Covers', 'Stainless Strap Covers'),
  ('Fuel Tank Strap Covers', 'Chrome Strap Covers'),
  ('Fuel Tank Strap Covers', 'Smooth Strap Covers'),
  ('Fuel Tank Strap Covers', 'Bead Rolled Strap Covers'),
  ('Fuel Tank Strap Covers', 'Lighted Strap Covers'),
  ('Fuel Tank Strap Covers', 'Custom Strap Covers'),
  ('Fuel Tank Strap Covers', 'Fuel Tank Strap Light Brackets'),
  -- Fuel Tank Mounting Components
  ('Fuel Tank Mounting Components', 'Tank Mount Brackets'),
  ('Fuel Tank Mounting Components', 'Tank Saddles'),
  ('Fuel Tank Mounting Components', 'Tank Mount Kits'),
  ('Fuel Tank Mounting Components', 'Tank Supports'),
  ('Fuel Tank Mounting Components', 'Tank Isolators'),
  ('Fuel Tank Mounting Components', 'Mounting Hardware'),
  ('Fuel Tank Mounting Components', 'Crossmembers'),
  ('Fuel Tank Mounting Components', 'Tank Cradles'),
  ('Fuel Tank Mounting Components', 'Fuel Tank Light Brackets'),
  -- Fuel Tank Steps
  ('Fuel Tank Steps', 'Fuel Tank Steps'),
  ('Fuel Tank Steps', 'Tank Mounted Steps'),
  ('Fuel Tank Steps', 'Stainless Tank Steps'),
  ('Fuel Tank Steps', 'Aluminum Tank Steps'),
  ('Fuel Tank Steps', 'Lighted Tank Steps'),
  ('Fuel Tank Steps', 'Grip Steps'),
  ('Fuel Tank Steps', 'Replacement Step Treads'),
  -- Fuel Tank End Caps
  ('Fuel Tank End Caps', 'Stainless End Caps'),
  ('Fuel Tank End Caps', 'Aluminum End Caps'),
  ('Fuel Tank End Caps', 'Custom End Caps'),
  ('Fuel Tank End Caps', 'Decorative End Caps'),
  -- Fuel Tank Fairings & Covers
  ('Fuel Tank Fairings & Covers', 'Fuel Tank Fairings'),
  ('Fuel Tank Fairings & Covers', 'Tank Wraps'),
  ('Fuel Tank Fairings & Covers', 'Tank Skins'),
  ('Fuel Tank Fairings & Covers', 'Tank Covers'),
  ('Fuel Tank Fairings & Covers', 'Stainless Tank Wraps'),
  -- Fuel Tank Lighting
  ('Fuel Tank Lighting', 'Fuel Tank Light Brackets'),
  ('Fuel Tank Lighting', 'Tank Mounted Light Bars'),
  ('Fuel Tank Lighting', 'Under Tank Lighting'),
  ('Fuel Tank Lighting', 'Accent Lighting'),
  ('Fuel Tank Lighting', 'LED Strip Lighting'),
  ('Fuel Tank Lighting', 'Courtesy Lights'),
  ('Fuel Tank Lighting', 'Ground Lighting'),
  ('Fuel Tank Lighting', 'Rock Lights'),
  ('Fuel Tank Lighting', 'Marker Lights'),
  -- Fuel Tank Light Brackets & Accessories
  ('Fuel Tank Light Brackets & Accessories', 'Tank Light Brackets'),
  ('Fuel Tank Light Brackets & Accessories', 'Single Light Brackets'),
  ('Fuel Tank Light Brackets & Accessories', 'Dual Light Brackets'),
  ('Fuel Tank Light Brackets & Accessories', 'Multi-Light Brackets'),
  ('Fuel Tank Light Brackets & Accessories', 'Watermelon Light Brackets'),
  ('Fuel Tank Light Brackets & Accessories', '2" Light Brackets'),
  ('Fuel Tank Light Brackets & Accessories', '4" Light Brackets'),
  ('Fuel Tank Light Brackets & Accessories', 'LED Mounting Brackets'),
  ('Fuel Tank Light Brackets & Accessories', 'Light Bezels'),
  ('Fuel Tank Light Brackets & Accessories', 'Light Grommets'),
  ('Fuel Tank Light Brackets & Accessories', 'Wiring Kits'),
  -- Fuel Tank Filler Components
  ('Fuel Tank Filler Components', 'Fuel Filler Necks'),
  ('Fuel Tank Filler Components', 'Fuel Filler Extensions'),
  ('Fuel Tank Filler Components', 'Fuel Caps'),
  ('Fuel Tank Filler Components', 'Chrome Fuel Caps'),
  ('Fuel Tank Filler Components', 'Locking Fuel Caps'),
  ('Fuel Tank Filler Components', 'Fuel Doors'),
  ('Fuel Tank Filler Components', 'Fuel Fill Guards'),
  ('Fuel Tank Filler Components', 'Fuel Fill Trim Rings'),
  -- Fuel Tank Protection
  ('Fuel Tank Protection', 'Tank Guards'),
  ('Fuel Tank Protection', 'Stone Guards'),
  ('Fuel Tank Protection', 'Mud Guards'),
  ('Fuel Tank Protection', 'Tank Shields'),
  ('Fuel Tank Protection', 'Protective Covers'),
  ('Fuel Tank Protection', 'Impact Guards'),
  -- Fuel Tank Accessories
  ('Fuel Tank Accessories', 'Tank Tool Trays'),
  ('Fuel Tank Accessories', 'Storage Mounts'),
  ('Fuel Tank Accessories', 'Air Line Holders'),
  ('Fuel Tank Accessories', 'Hose Holders'),
  ('Fuel Tank Accessories', 'Strap Accessories'),
  ('Fuel Tank Accessories', 'Mounting Accessories'),
  ('Fuel Tank Accessories', 'Hardware Kits'),
  -- Fuel System Components
  ('Fuel System Components', 'Fuel Sending Units'),
  ('Fuel System Components', 'Fuel Pickups'),
  ('Fuel System Components', 'Fuel Lines'),
  ('Fuel System Components', 'Fuel Fittings'),
  ('Fuel System Components', 'Fuel Tank Sensors'),
  ('Fuel System Components', 'Fuel Level Components'),
  -- Fuel Tank Repair Components
  ('Fuel Tank Repair Components', 'Repair Panels'),
  ('Fuel Tank Repair Components', 'Weld-In Bungs'),
  ('Fuel Tank Repair Components', 'Replacement Mounts'),
  ('Fuel Tank Repair Components', 'Replacement Hardware'),
  ('Fuel Tank Repair Components', 'Tank Repair Kits')
) v(subname, item)
join public.part_categories sub
  on sub.name = v.subname
  and sub.parent_id = (
    select id from public.part_categories
    where parent_id is null and name = 'Fuel Tanks, Straps & Accessories'
  )
on conflict (parent_id, name) do nothing;

-- ===========================================================================
-- SECTION C — Forward-migrate old rows: DEACTIVATE the old 12-root flat tree
-- (roots + their children). The FK is `on delete restrict` (Pitfall 3) — never
-- blind-delete a category row; deactivate so it leaves every picker but the FK
-- and any join rows stay valid until Section D cleans the join rows.
-- ===========================================================================
update public.part_categories set is_active = false
where parent_id is null and name in
  ('Hoods & Fenders','Lighting','Mirrors','Exhaust & Stacks','Bumpers','Grilles',
   'Interior','Drivetrain','Suspension','Electrical','Glass','Body & Cab');

update public.part_categories set is_active = false
where parent_id in (
  select id from public.part_categories where parent_id is null and name in
    ('Hoods & Fenders','Lighting','Mirrors','Exhaust & Stacks','Bumpers','Grilles',
     'Interior','Drivetrain','Suspension','Electrical','Glass','Body & Cab'));

-- ---------------------------------------------------------------------------
-- Pitfall 5 fix: "Lighting" is KEPT as a NEW root. The deactivation above just
-- turned the existing "Lighting" root off, and Section B's `on conflict do
-- nothing` could not re-insert it (the name already exists). Explicitly
-- reactivate that exact row so the new "Lighting" root is visible. Its OLD
-- children stay deactivated (they remain off from Section C's child sweep).
-- This update runs AFTER Section C so it wins.
-- ---------------------------------------------------------------------------
update public.part_categories
set is_active = true, parent_id = null
where parent_id is null and name = 'Lighting';

-- ===========================================================================
-- SECTION D — Re-tag listings tagged on a now-deactivated category onto a valid
-- NEW leaf ('Driver Side Fuel Tanks' under the Fuel Tanks root), then drop the
-- stale join rows. The restrict FK blocks deleting the parent CATEGORY row, NOT
-- the listing_categories JOIN row — so cleaning the join is safe and leaves no
-- orphan tag pointing at a deactivated category.
-- ===========================================================================
with new_leaf as (
  select id from public.part_categories
  where name = 'Driver Side Fuel Tanks'
    and parent_id = (
      select id from public.part_categories sub
      where sub.name = 'Fuel Tanks'
        and sub.parent_id = (
          select id from public.part_categories
          where parent_id is null and name = 'Fuel Tanks, Straps & Accessories'
        )
    )
  limit 1
),
old_cats as (select id from public.part_categories where is_active = false),
affected as (
  select distinct lc.listing_id
  from public.listing_categories lc
  join old_cats oc on oc.id = lc.category_id
)
insert into public.listing_categories (listing_id, category_id)
select a.listing_id, nl.id
from affected a cross join new_leaf nl
on conflict (listing_id, category_id) do nothing;

delete from public.listing_categories
where category_id in (select id from public.part_categories where is_active = false);

-- ===========================================================================
-- NOTES (documented constraints):
--   * search_listings signature + return columns are FROZEN (byte-identical to
--     0024). Only the part-category facet arm body changed (recursive subtree).
--   * Leaf-only tagging is a UI CONVENTION, not a DB constraint — listings can
--     technically be tagged at any level; the recursive CTE matches ancestors
--     regardless, so leaf tagging + ancestor selection is the intended flow.
--   * The YEAR seam is UNTOUCHED here — Year is a separate later phase
--     (from-to range on listings + its own cascade step).
-- ===========================================================================
