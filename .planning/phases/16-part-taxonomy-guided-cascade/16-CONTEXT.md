# Phase 16 — Part Taxonomy & Guided Cascade · Context

Captured after a stakeholder taxonomy review (2026-06-18). This is **new functional
scope**, not part of the v1.1 rebrand. **YEAR is out of scope** for this phase
(its own later phase: from–to year range on listings + create-listing form +
search RPC + a Year cascade step between Model and Category).

## Decisions (from the user)

- **Year model (for the future year phase):** a from–to **range** per listing.
- **Taxonomy data now:** build the 3-level structure + seed the **20 root
  categories** + the **full "Fuel Tanks, Straps & Accessories" subtree**. The
  other 19 root subtrees are seeded later as the data arrives.
- **Sequence:** taxonomy first (this phase), year as a separate later phase.

## Data model facts (verified)

- `part_categories` is a self-referencing adjacency tree (`parent_id`,
  `unique(parent_id, name)`), so 3 levels (root → subcategory → item) need **no
  schema change — only seed data**. (`supabase/migrations/0003_fitment_taxonomy.sql`)
- `listing_categories(listing_id, category_id)` join tags a listing to categories
  (`0012_fitment_rules.sql`). Listings are expected to be tagged at the **leaf
  (item) level**; selecting any ancestor must match the whole subtree.
- `search_listings` RPC currently matches **exact** `category_id`
  (`0023_search_security_definer.sql` / `0024_*`). Needs a **recursive-CTE
  descendant match** so a root/subcategory selection matches its whole subtree.
- The existing categories were **app-seeded into staging (not via migration)** —
  the new taxonomy reorganizes/replaces them; staging test listings re-tagged or
  cleared.

## Target flow

Welcome explorer cascade: **Make → Model → (search now, no more data) →
Category(root) → Advanced(Subcategory → Item + Condition)**.
`/browse` filters: **Category → Subcategory → Item** dependent selects + Condition.
New cascade reader: `getChildCategories(parentId)` (mirrors `getModels`/`getConfigs`).

## The 20 root categories (from the stakeholder board)

1. Grill & Accessories
2. Battery, Tool, DPF Covers & Boxes
3. Fuel Tanks, Straps & Accessories  ← full subtree below
4. Air Cleaners, Screens, Light Brackets & Accessories
5. Mud Flaps, Hangers, Weights & Accessories
6. Exhaust & Accessories
7. Body Parts, Cab & Sleeper
8. Bumpers and Accessories
9. Tires & Rims
10. Power Train & Running Gear
11. Mirrors, Brackets & Accessories
12. Front Windshield Sunvisor
13. Interior & Seating
14. Cab & Sleeper Light Panels
15. Rear Fenders
16. Lighting
17. Light Brackets & Accessories
18. Tail Light Panels

(The board image repeats "Air Cleaners…" and "Light Brackets & Accessories" in the
bottom row — treat as duplicates; ~18 unique roots. Confirm exact names/order with
the stakeholder at plan time.)

## Full subtree — FUEL TANKS, STRAPS & ACCESSORIES (root → subcategory → items)

### Fuel Tanks
- Fuel Tank Assemblies
- Driver Side Fuel Tanks
- Passenger Side Fuel Tank
- Aluminum Fuel Tanks
- Stainless Steel Fuel Tanks
- Replacement Fuel Tanks
- Custom Fuel Tanks

### Fuel Tank Straps
- Fuel Tank Straps
- Stainless Fuel Tank Straps
- Aluminum Fuel Tank Straps
- OEM Replacement Straps
- Aftermarket Straps

### Fuel Tank Strap Covers
- Stainless Strap Covers
- Chrome Strap Covers
- Smooth Strap Covers
- Bead Rolled Strap Covers
- Lighted Strap Covers
- Custom Strap Covers
- Fuel Tank Strap Light Brackets

### Fuel Tank Mounting Components
- Tank Mount Brackets
- Tank Saddles
- Tank Mount Kits
- Tank Supports
- Tank Isolators
- Mounting Hardware
- Crossmembers
- Tank Cradles
- Fuel Tank Light Brackets

### Fuel Tank Steps
- Fuel Tank Steps
- Tank Mounted Steps
- Stainless Tank Steps
- Aluminum Tank Steps
- Lighted Tank Steps
- Grip Steps
- Replacement Step Treads

### Fuel Tank End Caps
- Stainless End Caps
- Aluminum End Caps
- Custom End Caps
- Decorative End Caps

### Fuel Tank Fairings & Covers
- Fuel Tank Fairings
- Tank Wraps
- Tank Skins
- Tank Covers
- Stainless Tank Wraps

### Fuel Tank Lighting
- Fuel Tank Light Brackets
- Tank Mounted Light Bars
- Under Tank Lighting
- Accent Lighting
- LED Strip Lighting
- Courtesy Lights
- Ground Lighting
- Rock Lights
- Marker Lights

### Fuel Tank Light Brackets & Accessories
- Tank Light Brackets
- Single Light Brackets
- Dual Light Brackets
- Multi-Light Brackets
- Watermelon Light Brackets
- 2" Light Brackets
- 4" Light Brackets
- LED Mounting Brackets
- Light Bezels
- Light Grommets
- Wiring Kits

### Fuel Tank Filler Components
- Fuel Filler Necks
- Fuel Filler Extensions
- Fuel Caps
- Chrome Fuel Caps
- Locking Fuel Caps
- Fuel Doors
- Fuel Fill Guards
- Fuel Fill Trim Rings

### Fuel Tank Protection
- Tank Guards
- Stone Guards
- Mud Guards
- Tank Shields
- Protective Covers
- Impact Guards

### Fuel Tank Accessories
- Tank Tool Trays
- Storage Mounts
- Air Line Holders
- Hose Holders
- Strap Accessories
- Mounting Accessories
- Hardware Kits

### Fuel System Components
- Fuel Sending Units
- Fuel Pickups
- Fuel Lines
- Fuel Fittings
- Fuel Tank Sensors
- Fuel Level Components

### Fuel Tank Repair Components
- Repair Panels
- Weld-In Bungs
- Replacement Mounts
- Replacement Hardware
- Tank Repair Kits

## Notes / open items for plan time

- Some item names repeat across subcategories (e.g., "Fuel Tank Light Brackets"
  appears under Mounting, Lighting, and Strap Covers as "…Strap Light Brackets").
  `unique(parent_id, name)` allows the same name under different parents — fine.
- Decide whether listings can be tagged at multiple levels or only the leaf
  (recommended: leaf only; ancestors matched via the recursive CTE).
- Confirm how the existing v1.0 facet tests / e2e that assume the old flat
  categories should be updated.
