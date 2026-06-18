-- seed.sql
-- Phase 3 — Fitment Taxonomy & Slang Library: the user-reviewed LAUNCH DATASET.
-- Supabase CLI auto-runs this file after migrations on `db reset` / `db start`.
--
-- WHAT THIS SEEDS (the 8-level fitment library + L5–L8 dimensions):
--   L1 makes (Peterbilt, Kenworth)
--   L2 models (iconic/popular per make — the ones buyers actually search)
--   L3 configurations (shared master set) + model_configurations applicability
--   L4 search_terms (curated trucker slang) + search_term_targets (arc resolution)
--   L5 part_categories (2-level heavy-truck tree)
--   L6 materials · L7 conditions · L8 special_filters
--
-- IDEMPOTENCY + NATURAL-KEY RULES (RESEARCH Pattern 5 + Pitfall 2, LOCKED):
--   - Parents before children: makes → models → configurations → model_configurations
--     → search_terms → search_term_targets; flat L5–L8 in any order.
--   - Every FK is resolved by NATURAL KEY inside the insert (`join public.makes m on
--     m.name = ...`). We NEVER write a literal generated id — ids differ between a fresh
--     local reset and Staging (the #1 seed-portability bug).
--   - Every insert is idempotent via `on conflict (<unique constraint from 0003>) do
--     nothing`, EXCEPT top-level part_categories (NULL parent_id is not "equal" in a
--     unique index) which use a guarded `where not exists`.
--   - NO typo/misspelling rows ('Areodyne','flatglass') — typo tolerance is pg_trgm in
--     Phase 7. A real ALTERNATE spelling truckers type is seeded as a normal term.
--   - NO sentinel "Barnyard" category — Barnyard is a boolean on listings (Phase 5).
--
-- This is the AI-generated, USER-REVIEWED launch dataset (CONTEXT): the make/model/
-- config/slang data is the product's quality ceiling, so it is reviewed before finalize.

-- ===========================================================================
-- L1) makes (FITL-01)
-- ===========================================================================
insert into public.makes (name) values
  ('Peterbilt'),
  ('Kenworth')
on conflict (name) do nothing;

-- ===========================================================================
-- L2) models (FITL-02) — iconic/popular per make, resolved to make by natural key.
-- ===========================================================================
insert into public.models (make_id, name)
select m.id, v.name
from (values
  ('Peterbilt', '379'),
  ('Peterbilt', '379EXHD'),
  ('Peterbilt', '389'),
  ('Peterbilt', '359'),
  ('Peterbilt', '388'),
  ('Peterbilt', '387'),
  ('Peterbilt', '386'),
  ('Peterbilt', '567'),
  ('Peterbilt', '579'),
  ('Kenworth', 'W900'),
  ('Kenworth', 'W900L'),
  ('Kenworth', 'W900B'),
  ('Kenworth', 'W990'),
  ('Kenworth', 'T800'),
  ('Kenworth', 'T600'),
  ('Kenworth', 'T660'),
  ('Kenworth', 'T680')
) v(make, name)
join public.makes m on m.name = v.make
on conflict (make_id, name) do nothing;

-- ===========================================================================
-- L3) configurations (FITL-03) — shared master set.
-- ===========================================================================
insert into public.configurations (name) values
  ('Day Cab'),
  ('Sleeper'),
  ('Flat-top'),
  ('Aerodyne'),
  ('Extended Hood'),
  ('Studio Sleeper'),
  ('Stand-up Sleeper'),
  ('Flat Glass'),
  ('Curved Glass')
on conflict (name) do nothing;

-- model_configurations — applicability (which shared config applies to which model).
-- Domain-grounded, not exhaustive: long-hood classics get Day Cab/Sleeper/Flat-top;
-- Aerodyne is the Kenworth W900 raised-roof sleeper; Studio Sleeper is a Peterbilt
-- 379/389 hallmark; Flat Glass is the classic square-window Kenworth W900/T800 cab.
insert into public.model_configurations (model_id, configuration_id)
select mo.id, cf.id
from (values
  -- Day Cab: ubiquitous across the long-hood line
  ('Peterbilt', '379',    'Day Cab'),
  ('Peterbilt', '379EXHD','Day Cab'),
  ('Peterbilt', '389',    'Day Cab'),
  ('Peterbilt', '359',    'Day Cab'),
  ('Peterbilt', '388',    'Day Cab'),
  ('Peterbilt', '567',    'Day Cab'),
  ('Peterbilt', '579',    'Day Cab'),
  ('Kenworth',  'W900',   'Day Cab'),
  ('Kenworth',  'W900L',  'Day Cab'),
  ('Kenworth',  'W900B',  'Day Cab'),
  ('Kenworth',  'W990',   'Day Cab'),
  ('Kenworth',  'T800',   'Day Cab'),
  ('Kenworth',  'T680',   'Day Cab'),
  -- Sleeper: the over-the-road norm for these classics
  ('Peterbilt', '379',    'Sleeper'),
  ('Peterbilt', '389',    'Sleeper'),
  ('Peterbilt', '579',    'Sleeper'),
  ('Kenworth',  'W900',   'Sleeper'),
  ('Kenworth',  'W900L',  'Sleeper'),
  ('Kenworth',  'W990',   'Sleeper'),
  ('Kenworth',  'T680',   'Sleeper'),
  -- Flat-top sleeper roof
  ('Peterbilt', '379',    'Flat-top'),
  ('Peterbilt', '389',    'Flat-top'),
  ('Kenworth',  'W900',   'Flat-top'),
  ('Kenworth',  'W900L',  'Flat-top'),
  -- Aerodyne: the iconic Kenworth raised-roof sleeper
  ('Kenworth',  'W900',   'Aerodyne'),
  ('Kenworth',  'W900L',  'Aerodyne'),
  ('Kenworth',  'W900B',  'Aerodyne'),
  -- Extended Hood: the long-nose option
  ('Peterbilt', '379EXHD','Extended Hood'),
  ('Peterbilt', '389',    'Extended Hood'),
  ('Kenworth',  'W900L',  'Extended Hood'),
  -- Studio Sleeper: Peterbilt hallmark
  ('Peterbilt', '379',    'Studio Sleeper'),
  ('Peterbilt', '389',    'Studio Sleeper'),
  -- Stand-up Sleeper
  ('Peterbilt', '579',    'Stand-up Sleeper'),
  ('Kenworth',  'T680',   'Stand-up Sleeper'),
  ('Kenworth',  'W990',   'Stand-up Sleeper'),
  -- Flat Glass: the classic square-window cab (pre-curved-windshield era)
  ('Kenworth',  'W900',   'Flat Glass'),
  ('Kenworth',  'W900L',  'Flat Glass'),
  ('Kenworth',  'W900B',  'Flat Glass'),
  ('Kenworth',  'T800',   'Flat Glass'),
  ('Kenworth',  'T600',   'Flat Glass'),
  -- Curved Glass: the aero-era cab
  ('Kenworth',  'T680',   'Curved Glass'),
  ('Kenworth',  'W990',   'Curved Glass'),
  ('Peterbilt', '579',    'Curved Glass'),
  ('Peterbilt', '567',    'Curved Glass')
) v(make, model, config)
join public.makes mk on mk.name = v.make
join public.models mo on mo.make_id = mk.id and mo.name = v.model
join public.configurations cf on cf.name = v.config
on conflict (model_id, configuration_id) do nothing;

-- ===========================================================================
-- L5) part_categories (FITL-05) — 3-level heavy-truck tree (Phase 16 taxonomy v2).
-- Mirrors migration 0025 Section B EXACTLY so a fresh `db reset` (migrations then
-- this seed) yields ONE taxonomy: the new tree only (Pitfall 1). The old 12-root
-- flat tree is GONE from this seed and is never reintroduced.
-- Top levels have parent_id NULL; because NULLs are not "equal" in a unique index,
-- `on conflict (parent_id, name)` will NOT dedupe them — so top-levels use a guarded
-- `where not exists`. Subcategories/items resolve their parent by name + on-conflict.
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
-- L6) materials (FITL-06)
-- ===========================================================================
insert into public.materials (name, sort_order) values
  ('Aluminum', 1),
  ('Steel', 2),
  ('Stainless Steel', 3),
  ('Fiberglass', 4),
  ('Chrome', 5),
  ('Plastic/ABS', 6),
  ('Rubber', 7),
  ('Composite', 8)
on conflict (name) do nothing;

-- ===========================================================================
-- L7) conditions (FITL-07)
-- ===========================================================================
insert into public.conditions (name, sort_order) values
  ('New', 1),
  ('NOS', 2),
  ('New Take-Off', 3),
  ('Like New', 4),
  ('Used', 5),
  ('Refurbished', 6),
  ('Damaged', 7),
  ('Core', 8)
on conflict (name) do nothing;

-- ===========================================================================
-- L8) special_filters (FITL-08)
-- ===========================================================================
insert into public.special_filters (name, sort_order) values
  ('Wide Hood', 1),
  ('Narrow Hood', 2),
  ('Flat Glass', 3),
  ('Curved Glass', 4),
  ('Heavy Haul', 5),
  ('Universal Fit', 6),
  ('Take-Off', 7),
  ('Glider-Compatible', 8)
on conflict (name) do nothing;

-- ===========================================================================
-- L4) search_terms (FITL-04) — the curated trucker-slang dictionary.
-- The precision differentiator: every term below MUST resolve (Task 2 arc targets) to a
-- seeded make / model / configuration. Quality over quantity. citext → case-insensitive.
-- ===========================================================================
insert into public.search_terms (term) values
  -- doc-cited (required)
  ('359 Guys'),
  ('Flat Glass Kenworth'),
  ('Aerodyne'),
  ('Large Car'),
  ('Glider'),
  -- model nicknames / shorthand owner-operators actually type
  ('W9'),
  ('Wide Nine'),
  ('Long Nine'),
  ('389 Guys'),
  ('379 Guys'),
  ('Extended Hood Pete'),
  ('EXHD'),
  ('T800 Daycab'),
  ('Dub T800'),
  ('W990'),
  ('Studio'),
  ('Studio Sleeper Pete'),
  -- configuration / body slang
  ('Flat Top'),
  ('Long Hood'),
  ('Wide Hood'),
  ('Square Light'),
  ('Square Headlight'),
  ('Flat Glass'),
  ('Curved Glass'),
  ('Day Cab'),
  ('Stand Up'),
  ('Condo'),
  -- make-level
  ('Pete'),
  ('Bilt'),
  ('KW'),
  ('Kenny'),
  ('Show Truck')
on conflict (term) do nothing;

-- ===========================================================================
-- search_term_targets (FITL-04) — the polymorphic exclusive arc. For each term, one row
-- per resolved entity, resolving BOTH term and target by natural key. A term may resolve
-- to several entities (each its own single-target row). on conflict do nothing → idempotent.
-- ===========================================================================

-- --- MODEL-level terms ---
-- '359 Guys' → Peterbilt 359
insert into public.search_term_targets (search_term_id, model_id)
select st.id, mo.id
from public.search_terms st
join public.makes mk on mk.name = 'Peterbilt'
join public.models mo on mo.make_id = mk.id and mo.name = '359'
where st.term = '359 Guys'
on conflict do nothing;

-- '379 Guys' → Peterbilt 379
insert into public.search_term_targets (search_term_id, model_id)
select st.id, mo.id
from public.search_terms st
join public.makes mk on mk.name = 'Peterbilt'
join public.models mo on mo.make_id = mk.id and mo.name = '379'
where st.term = '379 Guys'
on conflict do nothing;

-- '389 Guys' → Peterbilt 389
insert into public.search_term_targets (search_term_id, model_id)
select st.id, mo.id
from public.search_terms st
join public.makes mk on mk.name = 'Peterbilt'
join public.models mo on mo.make_id = mk.id and mo.name = '389'
where st.term = '389 Guys'
on conflict do nothing;

-- 'Extended Hood Pete' → Peterbilt 379EXHD AND Peterbilt 389
insert into public.search_term_targets (search_term_id, model_id)
select st.id, mo.id
from public.search_terms st
join public.makes mk on mk.name = 'Peterbilt'
join public.models mo on mo.make_id = mk.id and mo.name in ('379EXHD','389')
where st.term = 'Extended Hood Pete'
on conflict do nothing;

-- 'EXHD' → Peterbilt 379EXHD
insert into public.search_term_targets (search_term_id, model_id)
select st.id, mo.id
from public.search_terms st
join public.makes mk on mk.name = 'Peterbilt'
join public.models mo on mo.make_id = mk.id and mo.name = '379EXHD'
where st.term = 'EXHD'
on conflict do nothing;

-- 'Studio Sleeper Pete' → Peterbilt 379 AND 389 (the studio-sleeper classics)
insert into public.search_term_targets (search_term_id, model_id)
select st.id, mo.id
from public.search_terms st
join public.makes mk on mk.name = 'Peterbilt'
join public.models mo on mo.make_id = mk.id and mo.name in ('379','389')
where st.term = 'Studio Sleeper Pete'
on conflict do nothing;

-- 'W9' / 'Wide Nine' / 'Long Nine' → Kenworth W900 family
insert into public.search_term_targets (search_term_id, model_id)
select st.id, mo.id
from public.search_terms st
join public.makes mk on mk.name = 'Kenworth'
join public.models mo on mo.make_id = mk.id and mo.name in ('W900','W900L','W900B')
where st.term in ('W9','Wide Nine')
on conflict do nothing;

-- 'Long Nine' → Kenworth W900L specifically (the long-hood nine)
insert into public.search_term_targets (search_term_id, model_id)
select st.id, mo.id
from public.search_terms st
join public.makes mk on mk.name = 'Kenworth'
join public.models mo on mo.make_id = mk.id and mo.name = 'W900L'
where st.term = 'Long Nine'
on conflict do nothing;

-- 'W990' → Kenworth W990
insert into public.search_term_targets (search_term_id, model_id)
select st.id, mo.id
from public.search_terms st
join public.makes mk on mk.name = 'Kenworth'
join public.models mo on mo.make_id = mk.id and mo.name = 'W990'
where st.term = 'W990'
on conflict do nothing;

-- 'T800 Daycab' / 'Dub T800' → Kenworth T800
insert into public.search_term_targets (search_term_id, model_id)
select st.id, mo.id
from public.search_terms st
join public.makes mk on mk.name = 'Kenworth'
join public.models mo on mo.make_id = mk.id and mo.name = 'T800'
where st.term in ('T800 Daycab','Dub T800')
on conflict do nothing;

-- 'Flat Glass Kenworth' → make Kenworth AND config 'Flat Glass' (two arc rows)
insert into public.search_term_targets (search_term_id, make_id)
select st.id, mk.id
from public.search_terms st
join public.makes mk on mk.name = 'Kenworth'
where st.term = 'Flat Glass Kenworth'
on conflict do nothing;
insert into public.search_term_targets (search_term_id, config_id)
select st.id, cf.id
from public.search_terms st
join public.configurations cf on cf.name = 'Flat Glass'
where st.term = 'Flat Glass Kenworth'
on conflict do nothing;

-- --- CONFIG-level terms ---
-- 'Aerodyne' → config Aerodyne
insert into public.search_term_targets (search_term_id, config_id)
select st.id, cf.id
from public.search_terms st
join public.configurations cf on cf.name = 'Aerodyne'
where st.term = 'Aerodyne'
on conflict do nothing;

-- 'Flat Top' → config Flat-top
insert into public.search_term_targets (search_term_id, config_id)
select st.id, cf.id
from public.search_terms st
join public.configurations cf on cf.name = 'Flat-top'
where st.term = 'Flat Top'
on conflict do nothing;

-- 'Long Hood' / 'Wide Hood' → config Extended Hood
insert into public.search_term_targets (search_term_id, config_id)
select st.id, cf.id
from public.search_terms st
join public.configurations cf on cf.name = 'Extended Hood'
where st.term in ('Long Hood','Wide Hood')
on conflict do nothing;

-- 'Square Light' / 'Square Headlight' / 'Flat Glass' → config Flat Glass
-- (the square-window classic cab is the home of square sealed-beam headlights)
insert into public.search_term_targets (search_term_id, config_id)
select st.id, cf.id
from public.search_terms st
join public.configurations cf on cf.name = 'Flat Glass'
where st.term in ('Square Light','Square Headlight','Flat Glass')
on conflict do nothing;

-- 'Curved Glass' → config Curved Glass
insert into public.search_term_targets (search_term_id, config_id)
select st.id, cf.id
from public.search_terms st
join public.configurations cf on cf.name = 'Curved Glass'
where st.term = 'Curved Glass'
on conflict do nothing;

-- 'Day Cab' → config Day Cab
insert into public.search_term_targets (search_term_id, config_id)
select st.id, cf.id
from public.search_terms st
join public.configurations cf on cf.name = 'Day Cab'
where st.term = 'Day Cab'
on conflict do nothing;

-- 'Stand Up' → config Stand-up Sleeper
insert into public.search_term_targets (search_term_id, config_id)
select st.id, cf.id
from public.search_terms st
join public.configurations cf on cf.name = 'Stand-up Sleeper'
where st.term = 'Stand Up'
on conflict do nothing;

-- 'Studio' → config Studio Sleeper
insert into public.search_term_targets (search_term_id, config_id)
select st.id, cf.id
from public.search_terms st
join public.configurations cf on cf.name = 'Studio Sleeper'
where st.term = 'Studio'
on conflict do nothing;

-- 'Condo' → config Sleeper (a "condo" is the big walk-in sleeper)
insert into public.search_term_targets (search_term_id, config_id)
select st.id, cf.id
from public.search_terms st
join public.configurations cf on cf.name = 'Sleeper'
where st.term = 'Condo'
on conflict do nothing;

-- 'Large Car' → the long-hood show-truck ideal; spans the Extended Hood config
-- (a defensible canonical mapping: "large car" = the big extended-hood tractor).
insert into public.search_term_targets (search_term_id, config_id)
select st.id, cf.id
from public.search_terms st
join public.configurations cf on cf.name = 'Extended Hood'
where st.term = 'Large Car'
on conflict do nothing;

-- 'Show Truck' → config Extended Hood (the show-truck build is the long-hood tractor)
insert into public.search_term_targets (search_term_id, config_id)
select st.id, cf.id
from public.search_terms st
join public.configurations cf on cf.name = 'Extended Hood'
where st.term = 'Show Truck'
on conflict do nothing;

-- --- MAKE-level terms ---
-- 'Glider' → both makes Peterbilt + Kenworth (a glider kit is sold per chassis make).
-- Generic term → resolve to the makes it spans (two arc rows).
insert into public.search_term_targets (search_term_id, make_id)
select st.id, mk.id
from public.search_terms st
join public.makes mk on mk.name in ('Peterbilt','Kenworth')
where st.term = 'Glider'
on conflict do nothing;

-- 'Pete' / 'Bilt' → make Peterbilt
insert into public.search_term_targets (search_term_id, make_id)
select st.id, mk.id
from public.search_terms st
join public.makes mk on mk.name = 'Peterbilt'
where st.term in ('Pete','Bilt')
on conflict do nothing;

-- 'KW' / 'Kenny' → make Kenworth
insert into public.search_term_targets (search_term_id, make_id)
select st.id, mk.id
from public.search_terms st
join public.makes mk on mk.name = 'Kenworth'
where st.term in ('KW','Kenny')
on conflict do nothing;

-- ===========================================================================
-- SEED-INTEGRITY ASSERTION (REQUIRED GATE).
-- The exclusive-arc FKs already make a target pointing at a non-existent entity impossible
-- at insert time. This do-block catches the orthogonal case: a search_terms row that
-- received ZERO target rows (a dangling term). If any exist, the whole seed fails fast.
-- ===========================================================================
do $$
declare
  dangling_count int;
  dangling_list text;
begin
  select count(*), string_agg(st.term::text, ', ')
    into dangling_count, dangling_list
  from public.search_terms st
  where not exists (
    select 1 from public.search_term_targets t where t.search_term_id = st.id
  );

  if dangling_count > 0 then
    raise exception 'Seed integrity: % slang term(s) resolve to no entity: %',
      dangling_count, dangling_list;
  end if;
end
$$;
