# Phase 3: Fitment Taxonomy & Slang Library - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the 8-level fitment library — Make (L1) → Model (L2) → Configuration (L3) → Common Search Terms / trucker slang (L4) → Part Categories (L5) → Materials (L6) → Condition (L7) → Special Filters (L8) — plus "The Barnyard" anything-goes category, as **queryable reference data**. Trucker slang is modeled as a synonym/alias table (never hardcoded into queries), a part can map many-to-many to trucks/configs/terms/categories, and the launch taxonomy + slang dictionary are seeded and browsable.

This phase delivers **data model + seed data + RLS**. It does NOT build search UI, listing creation, fitment auto-suggest, or admin management screens — those are Phases 5, 6, 7, and 10. The table shapes are already specified in `.planning/research/ARCHITECTURE.md` ("Fitment Taxonomy (8 levels + Barnyard)") and are the structural starting point.

</domain>

<decisions>
## Implementation Decisions

### Seed scope (launch breadth)
- **Makes:** Two dominant brands only — **Peterbilt + Kenworth**. These own the classic/owner-operator/custom segment where take-off and used parts move most. Other makes (Freightliner, Western Star, Volvo, Mack, International, etc.) are deferred to post-launch expansion.
- **Models:** Iconic / popular models per make (~5–15 each) — the ones buyers actually search (e.g. W900, 379, 389, T800). Not the full historical catalog, not current-production-only (classics dominate the used market).
- **Configurations (L3):** A **shared standard set** of configurations (e.g. Day Cab, Sleeper, Flat-top, Aerodyne, Extended) applied to relevant models — not researched per-model. Pragmatic and sufficient for v1.
- **Levels L5–L8 (Part Categories, Materials, Conditions, Special Filters):** **Claude's discretion** on depth — define a sensible, domain-grounded set. These are the spine of filtering; seed them reasonably complete (materials and conditions are bounded lists; categories a sensible tree). See Claude's Discretion below.
- **Slang dictionary:** **High-value curated set, ~20–40 terms** — the terms a real buyer types ('359 Guys', 'Flat Glass Kenworth', 'Aerodyne', 'Large Car', 'Glider', etc.). Quality over quantity, appropriate for a 2-make launch.

### Slang modeling (L4 — the matching quality decision)
- **Resolution:** Each slang term **maps to real entities** (make/model/config). Search translates slang → fitment and filters by those trucks. This is structural, not just fuzzy text — precise matching is the goal. (Search itself is Phase 7; Phase 3 provides the data that makes it possible.)
- **Cardinality:** **Many-to-many.** One term → N entities; one entity → N terms. Reflects how generic slang ('Aerodyne', 'Large Car') spans multiple trucks.
- **Level mapping:** **Polymorphic by level.** A term may resolve to a make, a model, OR a config depending on the term ('359 Guys' → model; 'Aerodyne' → config; 'Flat Glass Kenworth' → make + config). The link record records which level/entity it points to.
- **Data-driven invariant (locked):** Slang is **100% data-driven** — zero terms hardcoded in queries. Adding a row must be enough to make a new slang term work in search. (This is a project invariant from CLAUDE.md §7; restated here as a hard requirement for this phase's schema.)
- **Spelling variants / typos** ('Areodyne', 'flatglass'): **Claude's discretion** — decide whether to store explicit alias/variant data in Phase 3 or rely on `pg_trgm` similarity in Phase 7. `pg_trgm` is already in the stack.

### The Barnyard (anything-goes category)
- **Model:** **Boolean flag `is_barnyard` on the listing** (confirms the ARCHITECTURE.md proposal), not a sentinel category row.
- **Coexistence with tags:** A Barnyard listing **may still carry normal fitment tags** (make/model/category) if applicable, but is never required to. Barnyard means "don't force me to tag," not "tagging forbidden." Maximizes the chance a part still surfaces in fitment searches.
- **Phase 3 deliverable:** **Data model only** — the schema supports the flag and its RLS; the seed accounts for Barnyard. Barnyard behavior in listing creation and search lands in Phases 5 and 7. (The `is_barnyard` column lives on `listings`, which is created in Phase 5 — Phase 3 must define how Barnyard fits the reference-data model and the taxonomy/seed, not the listings table itself.)

### Data source & maintenance
- **Seed origin:** **AI-generated + user review.** Claude generates the initial dataset (Peterbilt/KW models, shared configs, curated slang, L5–L8) from heavy-truck domain knowledge; the user reviews and corrects before it is finalized into `seed.sql`.
- **Seed delivery:** Versioned in **`supabase/seed.sql`** (per ARCHITECTURE.md), reproducible across environments. Not buried in a schema migration.
- **Post-launch growth:** Expansion happens via **migration/seed edits by developer/admin**. No admin management UI is built in Phase 3 — the admin fitment console is Phase 10.
- **Seed integrity test (required):** A check/test that verifies the seed loads clean — valid FKs, no orphans, and **every slang term resolves to entities that actually exist**. The roadmap notes schema quality "caps everything downstream," so seed correctness is gated here.

### Cross-cutting gate (carried from ROADMAP, restated)
- All new reference and join tables: **RLS enabled default-deny in the same migration that creates them.** Public reference reads allowed; writes restricted (admin/service-role). Re-verify the privacy/RLS gate as part of this phase.

### Claude's Discretion
- Exact depth and shape of **L5 Part Categories** (top-level + subcategory tree), **L6 Materials**, **L7 Conditions**, **L8 Special Filters** — define a sensible heavy-truck set.
- Whether to store **explicit slang variants/typos** in Phase 3 or defer to `pg_trgm` matching in Phase 7.
- Whether to tag/categorize slang terms by type (model-slang / config-slang / brand-slang) — optional structure for future ranking; not required.
- Whether `listing_makes` is a real join table or derived via `models.make_id` (ARCHITECTURE.md leaves this open as a denormalization-for-speed choice).
- Exact mechanism details of the seed integrity check (SQL assertions, a test in the suite, or a verification script).

</decisions>

<specifics>
## Specific Ideas

- The reference slang already cited in the docs must be representative of the curated set: '359 Guys', 'Flat Glass Kenworth', 'Aerodyne' — plus the kind of terms owner-operators actually use ('Large Car', 'Glider').
- Precision of fitment is the product's differentiator vs. Facebook/Craigslist — the slang→entity mapping is what makes one part surface across every relevant truck. Don't water it down to plain text search.
- Two-make launch (Peterbilt + Kenworth) is a deliberate focus decision to validate the model before broadening, not a limitation of the schema — the schema must scale to all NA makes without change.

</specifics>

<deferred>
## Deferred Ideas

- **Additional makes** (Freightliner, Western Star, Volvo, Mack, International, Hino, etc.) — post-launch taxonomy expansion via seed/migration; schema already supports them.
- **Admin UI to manage fitment / slang** — Phase 10 (Admin Ops). Surfaced as scope creep during discussion; explicitly out of Phase 3.
- **Slang term type/categorization for ranking** — optional future enhancement; only build if it earns its keep in Phase 7 search ranking.
- **External dataset import (ACES/PIES)** — considered and declined for v1; licensing/format overhead not worth it for a 2-make launch.

</deferred>

---

*Phase: 03-fitment-taxonomy-slang-library*
*Context gathered: 2026-06-04*
