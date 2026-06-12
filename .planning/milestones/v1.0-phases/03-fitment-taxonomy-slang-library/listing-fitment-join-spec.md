# Listing ↔ Fitment Join Spec (Phase-5 input)

**Status:** DESIGN-ONLY in Phase 3. The SQL below ships in **Phase 5** alongside the
`listings` table — do NOT add any of it to `0003_fitment_taxonomy.sql`.

This locks two requirements whose tables can't exist until `listings` exists:

- **FITL-10** — a single part (listing) maps to many trucks / configs / terms / categories
  (a true many-to-many tagging model).
- **FITL-09** — **Barnyard**: an anything-goes listing that is never *required* to carry
  fitment tags.

It also carries forward the 03-01 decision that `configurations` is a **shared master**, so
`listing_configs` references the canonical `configurations.id` (NOT a per-model config).

---

## 1. The 7 listing join tables

Each is a pure M2M bridge: composite PK `(listing_id, <dim>_id)`, RLS enabled in the same
migration, **public SELECT** (so anyone can read a listing's fitment), and **writes scoped to
the listing owner**. All `<dim>_id` FKs reference the canonical Phase-3 reference tables.

| Join table                | Columns                                   | Trailing FK references         |
| ------------------------- | ----------------------------------------- | ------------------------------ |
| `listing_models`          | `(listing_id, model_id)`                  | `public.models.id`             |
| `listing_configs`         | `(listing_id, configuration_id)`          | `public.configurations.id`     |
| `listing_search_terms`    | `(listing_id, search_term_id)`            | `public.search_terms.id`       |
| `listing_categories`      | `(listing_id, category_id)`               | `public.part_categories.id`    |
| `listing_materials`       | `(listing_id, material_id)`               | `public.materials.id`          |
| `listing_conditions`      | `(listing_id, condition_id)`              | `public.conditions.id`         |
| `listing_special_filters` | `(listing_id, special_filter_id)`         | `public.special_filters.id`    |

Reference shape (Phase 5 will write 7 of these, varying only the trailing column):

```sql
-- EXAMPLE (Phase 5 — do NOT add to 0003):
create table public.listing_models (
  listing_id bigint not null references public.listings(id) on delete cascade,
  model_id   bigint not null references public.models(id)   on delete restrict,
  primary key (listing_id, model_id)
);
-- secondary index for reverse lookup (see §3)
create index listing_models_model_id_idx on public.listing_models (model_id);

alter table public.listing_models enable row level security;

-- public read: a listing's fitment is browsable by everyone
create policy "listing_models public-readable"
  on public.listing_models for select
  to anon, authenticated using (true);

-- owner-only writes (see §4)
create policy "listing_models owner-write"
  on public.listing_models for all
  to authenticated
  using (
    exists (select 1 from public.listings l
            where l.id = listing_id and l.seller_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.listings l
            where l.id = listing_id and l.seller_id = (select auth.uid()))
  );
```

`on delete cascade` on `listing_id` (deleting a listing drops its tags);
`on delete restrict` on the reference-table FK (you can't delete a make/model/config that
listings still reference — protects taxonomy integrity).

---

## 2. `listing_makes` is NOT a real table

Make is **derived**, not stored: a listing's makes come from
`listing_models → models.make_id`. Materializing `listing_makes` would let make and model
drift out of sync (a listing tagged Kenworth W900 but make=Peterbilt). Only denormalize a
make column/table in **Phase 7** *if* `EXPLAIN ANALYZE` on the search path proves the
`listing_models → models` hop is a measured bottleneck — not preemptively.

---

## 3. Indexing

The composite PK `(listing_id, <dim>_id)` already provides an index on the **leading**
column (`listing_id`) — fast for "show me this listing's tags."

For **reverse lookups** ("which listings have model X / material Y") the search/feed path
filters on the **trailing** column, which the PK does NOT cover. Add a secondary index on
the trailing `<dim>_id` to each join table (e.g. `listing_models_model_id_idx`).

---

## 4. RLS owner-write policy

Writes to every join table are gated by ownership of the parent listing. Canonical shape:

```sql
exists (select 1 from public.listings l
        where l.id = listing_id and l.seller_id = (select auth.uid()))
```

- `(select auth.uid())` (wrapped in a subselect) per CLAUDE.md invariant 2 — lets Postgres
  cache the auth lookup per-statement.
- `seller_id` is the owning column on `listings` (Phase 5 names it; adjust if the Phase-5
  listings schema uses a different owner column).
- Public read stays `using (true)`; only writes are owner-scoped.

---

## 5. Barnyard (FITL-09)

Barnyard is a **boolean on `listings`**, not a sentinel category row and not a join table:

```sql
-- on the Phase-5 listings table:
is_barnyard boolean not null default false
```

Semantics: **"Barnyard means *don't force me to tag*, not tagging forbidden."** A Barnyard
listing MAY still carry any of the join rows in §1 (a seller can tag a Barnyard item if they
want), but the listing-create flow must not *require* fitment tags when `is_barnyard = true`.
Non-Barnyard listings should require at least a minimal fitment tag set (Phase-5 form rule).

There is deliberately **no** `part_categories` row named "Barnyard" — that was rejected in
03-02 seed rules so the taxonomy stays clean and Barnyard stays a first-class listing flag.

---

## 6. Divergence note carried from 03-01

03-01 made `configurations` a **shared master** (unique name), diverging from
`ARCHITECTURE.md`'s `configurations.model_id` sketch. Consequence for Phase 5:
`listing_configs` references the **canonical** `configurations.id`, never a per-model config
duplicate. Model-vs-config applicability (which configs are valid for a tagged model) is
expressed by `model_configurations` and can be used by the Phase-5 form to constrain the
config picker once a model is chosen.
