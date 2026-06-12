# Phase 6: Fitment Intelligence - Research

**Researched:** 2026-06-09
**Domain:** Rules-driven fitment-suggestion layer over existing manual tagging (Next.js 16 App Router Server Actions + Supabase Postgres/RLS)
**Confidence:** HIGH (everything load-bearing was read from the actual repo migrations/components, not assumed; the few external claims are flagged MEDIUM)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Trigger & timing**
- **Real-time suggestions.** As soon as the seller makes a relevant selection (primarily a part category), suggestions appear automatically below — no extra click.
- **Primary trigger = Part Category.** Choosing a part category (e.g. "Bumpers") drives the rule-based suggestions of typically-associated configs / search terms / categories. (Part-number patterns and free-text title parsing are NOT triggers in v1 — see Deferred.)
- **Preserve confirmed selections on re-trigger.** If the seller changes a selection after already confirming some suggestions, what they accepted stays; only new suggestions are added. A seller's decision is never overwritten.
- **Subtle loading state.** Show a small skeleton/spinner in the suggestions zone while computing.

**Presentation & confirmation**
- **Grouped chips.** Suggestions render as clickable chips grouped by dimension / source (e.g. "From your garage", "Common for Bumpers"). Compact and scannable.
- **One-by-one + "Add all".** Seller clicks individual chips to accept, with an "Add all suggested" shortcut.
- **Accepted suggestions migrate to the existing tag zone.** On accept, the chip leaves the suggestions area and appears in the existing confirmed-fitment list (the Phase 5 `FitmentMultiSelect` area), each with its remove (X). Single source of truth for confirmed fitment.
- **Dismiss individual suggestions.** Each suggestion has a small X to remove it from the suggested list for this session (session-only — no persisted "never suggest this" in v1).
- **"Never auto-applied" is a hard guarantee.** Nothing enters the confirmed-fitment list without an explicit seller click. This is FINT-02 and is a correctness requirement.

**Pre-fill from garage**
- **Garage trucks appear as suggestions, NOT pre-applied.** Surface as highlighted suggestions accepted with one click.
- **Visually distinguished as "From your garage."**
- **No garage → silent.** Omit the group; rule-based suggestions work normally. No nudge in v1.
- **Garage suggestions expand to flat dimensions.** A garage truck (e.g. Peterbilt 359 Extended Hood) also suggests its typical search terms / special filters ("359 Guys", "Long Hood"), not just the exact Make/Model/Config. (Research to confirm how `fitment_rules` models this.)

**Precision & states**
- **Few and precise (precision > recall).** Only suggestions backed by a clear, direct rule are shown. No ranking/score UI in v1.
- **Explainability via group headers.** "From your garage", "Common for Bumpers" — no per-chip tooltips.
- **Empty state = brief message.** "No automatic suggestions — add fitments manually below." Don't hide the section silently.

### Claude's Discretion
- Exact chip styling, group spacing, visual integration with `FitmentMultiSelect` in `components/listings/listing-form.tsx`.
- Whether the suggestion service is a Server Action vs Edge Function (ARCHITECTURE.md says Server Action `lib/fitment/suggest.ts`, promotable later).
- The exact shape of `fitment_rules` (trigger_type, etc.) and how garage-truck → flat-dimension expansion is encoded in data.
- Loading/skeleton implementation details.
- Accessibility specifics (keyboard nav for chips, ARIA on the suggestions region) — apply standard good practice.

### Deferred Ideas (OUT OF SCOPE)
- **Part-number-pattern triggers** — `fitment_rules` may support a `part_number_pattern` trigger type as a column value, but v1 does NOT drive suggestions from part numbers.
- **Free-text / title keyword parsing** as a trigger.
- **Acceptance/dismissal telemetry** to tune rules (re-check invariant #8 in research — see below; the specific accept/reject analytics is deferred).
- **Persisted "never suggest this" dismissals** — v1 dismissal is session-only.
- **Admin authoring UI for `fitment_rules`** — Phase 10. Phase 6 assumes rules exist as seed data.
- **Nudge to populate garage** when empty.
- **Ranking / confidence score surfaced to the seller.**
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FINT-01 | When a seller creates a listing, the system suggests applicable trucks, configurations, and categories based on the part details | `fitment_rules` table (new migration) + `lib/fitment/suggest.ts` Server Action keyed off the selected part category + the seller's garage. Trigger = part category (CONTEXT). See **Architecture Pattern 1 & 2**. |
| FINT-02 | Suggested fitments are presented for seller confirmation and are never auto-applied | Suggestions render as chips in a NEW zone; nothing reaches the `FitmentSelection[]` state without an explicit click. Hard guarantee enforced in the client (no effect/auto-merge) and verifiable. See **Architecture Pattern 3** + **Validation Architecture**. |
| FINT-03 | A confirmed listing appears in every applicable fitment search result and truck category | Accepting a suggestion writes the SAME `listing_fitment` rows as manual tagging (model+config) via the UNCHANGED `createListing`/`updateListing` actions. Search is Phase 7; **the Phase-6 testable claim is "accepted suggestion = identical join rows as a manual add"** — not search behaviour. See **Open Question 1** (flat-dimension persistence gap) and **FINT-03 section**. |
</phase_requirements>

## Summary

Phase 6 is a **suggestion layer bolted onto an already-working manual tagging UI**, not a new subsystem. The existing pieces you must respect, verbatim from the repo:

- `components/listings/listing-form.tsx` owns a `const [fitment, setFitment] = useState<FitmentSelection[]>` and mirrors it into RHF via `form.setValue("fitment", …, { shouldValidate: true })`. The submit refine is `isBarnyard || fitment.length >= 1`. **Accepted suggestions must flow through `setFitment(next)` exactly the way `FitmentMultiSelect`'s `onChange` does** — do not invent a parallel state.
- `FitmentSelection` (in `components/listings/fitment-multi-select.tsx`) = `{ modelId, configId, makeName, modelName, configName }`. This is the ONLY fitment dimension the listing actually persists today.
- The DB join `public.listing_fitment` stores ONLY `(listing_id, model_id, config_id)`. **There is NO listing↔part_category, listing↔search_term, listing↔material, or listing↔special_filter join table, and the listing form has NO part-category selector at all.** This is the single most important finding for planning.

The CONTEXT locks **"primary trigger = Part Category."** But a part category is not currently captured on a listing. So Phase 6 has to do two things the casual reading of "just add suggestions" hides: **(a) add a part-category selector to the form** (the trigger input), and **(b) decide what happens to suggested *flat* dimensions (search terms, special filters) that have nowhere to be persisted.** Per the precision-first and FINT-03-now-testable framing, the cleanest v1 scope is: suggestions that map to the EXISTING `listing_fitment` shape (model / config) are accepted and persisted as real join rows (fully satisfying FINT-03 today); suggested flat dimensions either get their own minimal join tables in this phase or are explicitly deferred to Phase 7. **This is the key scoping decision the planner must make — see Open Question 1.** The recommendation below is to add the listing↔category and listing↔search_term join tables now, because without listing↔category the "appears in every applicable… truck category" half of FINT-03 cannot ever be true and Phase 7 search would have nothing to query.

The mechanics are low-risk and well-precedented in this repo: a new `fitment_rules` reference table modelled exactly like the Phase-3 taxonomy tables (RLS-on, single `anon, authenticated` read policy, no write policy → service-role/seed-only writes); a `lib/fitment/suggest.ts` Server Action that reads `fitment_rules` + the caller's garage via the cookie-bound client (RLS-scoped, `getClaims()`); seed rules in a new migration; and client wiring that debounces on the category select and merges accepted chips into `setFitment`.

**Primary recommendation:** Add migration `0012_fitment_rules.sql` (the rules table, RLS-on, public-read, no-write, modelled on 0003) **plus** `listing_categories` (and recommended `listing_search_terms`) join tables modelled on `listing_fitment`; add a Part Category selector to the form's Fitment section as the trigger; build `lib/fitment/suggest.ts` as a Server Action returning grouped suggestions; merge accepted chips into the existing `fitment` state (and new category/term state) with no auto-apply; seed a handful of rules; verify with an integration test that an accepted suggestion produces byte-identical join rows to a manual tag.

## Standard Stack

No new libraries. Everything needed is already in `package.json` and in use.

### Core
| Library | Version (installed) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| `@supabase/ssr` | 0.10.3 | Cookie-bound server client (`lib/supabase/server.ts`) for the suggest Server Action + the rules/garage reads | Already the repo's only data path; RLS-enforced |
| `@supabase/supabase-js` | 2.106.2 | Query builder used by all readers | In use repo-wide |
| `zod` | 4.4.3 | Validate the suggest input + (if extended) the listing schema | Single client+server source of truth (CLAUDE.md) |
| `react-hook-form` | 7.77 + `@hookform/resolvers` 5.4 | The form already uses `useForm` + `zodResolver(listingSchema)` | Accepted suggestions sync via `form.setValue` exactly as fitment does today |
| `react` | 19.2.4 | `React.startTransition` / `useTransition` for the non-janky real-time fetch | Already used in `listing-form.tsx` (`React.startTransition`) |
| `lucide-react` | 1.17 | `X` icon for dismiss/remove (already imported in `fitment-multi-select.tsx`) | Repo convention |
| shadcn `Badge` / `Button` / `Skeleton` | (vendored) | Chips, "Add all", loading skeleton | Repo uses shadcn `Badge` for fitment chips today; add `skeleton` via the shadcn CLI if not present |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sonner` | 2.0.7 | Toast feedback (already used in the form) | Optional: confirm "Added N suggestions" |

**Installation:** none required. If a `Skeleton` component is not yet vendored under `components/ui/`, add it: `npx shadcn@latest add skeleton`. (Verify presence first — do not assume.)

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server Action `lib/fitment/suggest.ts` | Route Handler `app/api/fitment/suggest` | Route Handler is callable from a debounced `fetch` and is trivially cacheable, but the repo has ZERO precedent for client→route-handler reads; every cascade reader (`getModels`, `getConfigs`, `getConditions`) is a `"use server"` action called directly from client components. **Match that precedent: Server Action.** |
| Server Action | Supabase Edge Function | Edge adds deploy/runtime surface and a second auth path for zero v1 benefit. ARCHITECTURE.md explicitly says "promotable to an Edge Function" — i.e. later. Do NOT build Edge now. |
| New `listing_categories` join table now | Reuse `is_barnyard`-style single column | A part has ONE primary category but FINT-03 says "every applicable … truck category"; a join table is the M2M-correct shape and matches `listing_fitment`. Use a join table. |

## Architecture Patterns

### Recommended Project / file layout (new + touched)
```
supabase/migrations/
  0012_fitment_rules.sql        # NEW: fitment_rules + listing_categories (+ listing_search_terms) tables, RLS-on
  0013_fitment_rules_seed.sql   # NEW: seed rules (or fold into seed.sql — see Pattern 5)
lib/fitment/                    # NEW directory (does not exist yet)
  suggest.ts                    # "use server" — the suggestion service (FINT-01)
  types.ts                      # shared FitmentSuggestion / SuggestionGroup types (client + server)
lib/listings/
  cascade.ts                    # ADD getPartCategories() reader (mirrors getConditions)
  schema.ts                     # EXTEND: add categoryIds (+ searchTermIds) to listingSchema
lib/actions/listings.ts         # EXTEND create/update to persist listing_categories rows
components/listings/
  fitment-suggestions.tsx       # NEW: the grouped-chips suggestions zone
  fitment-multi-select.tsx      # ADD a Part Category select (the trigger) OR add it in listing-form
  listing-form.tsx              # WIRE suggestions ↔ fitment state; pass garage + categories in
tests/integration/
  fitment-intelligence.test.ts  # NEW: rules table RLS gate + accept-writes-same-rows
```

### Pattern 1: `fitment_rules` modelled exactly on the Phase-3 reference tables
**What:** A reference/seed table that maps a trigger (a part category, or a model/config for garage expansion) to an implied taxonomy entity. Authored by admin (Phase 10) / seed (Phase 6), read-only to everyone else.
**When:** This is the data backbone of FINT-01.

Model it as the ARCHITECTURE.md sketch refined to use **real FKs into the existing taxonomy** (the repo's `search_term_targets` already proves this "exclusive-arc of nullable FKs" pattern — copy it, do not invent a loose `trigger_value text` discriminator, which cannot FK-enforce that the referenced entity exists):

```sql
-- 0012_fitment_rules.sql  (style mirrors 0003 verbatim: lowercase, bigint identity PK,
-- RLS enabled in THIS migration, ONE anon+authenticated read policy, NO write policy.)

create table public.fitment_rules (
  id bigint generated always as identity primary key,

  -- TRIGGER side — exactly one trigger entity (exclusive arc, like search_term_targets).
  -- v1 populates trigger_category_id (CONTEXT: primary trigger = Part Category) and the
  -- garage-expansion arms (trigger_model_id / trigger_config_id). trigger_part_number_pattern
  -- exists as a deferred column but is never the driver in v1.
  trigger_category_id bigint references public.part_categories(id) on delete cascade,
  trigger_model_id    bigint references public.models(id)          on delete cascade,
  trigger_config_id   bigint references public.configurations(id)  on delete cascade,
  -- trigger_part_number_pattern text,   -- DEFERRED: present for forward-compat, unused in v1

  -- IMPLIES side — exactly one implied entity (also an exclusive arc).
  implies_model_id        bigint references public.models(id)           on delete cascade,
  implies_config_id       bigint references public.configurations(id)   on delete cascade,
  implies_category_id     bigint references public.part_categories(id)  on delete cascade,
  implies_search_term_id  bigint references public.search_terms(id)     on delete cascade,
  implies_special_filter_id bigint references public.special_filters(id) on delete cascade,

  confidence smallint not null default 100,  -- 0..100; v1 surfaces only high-confidence, never shown to seller
  created_at timestamptz not null default now(),

  constraint exactly_one_trigger
    check (num_nonnulls(trigger_category_id, trigger_model_id, trigger_config_id) = 1),
  constraint exactly_one_implies
    check (num_nonnulls(implies_model_id, implies_config_id, implies_category_id,
                        implies_search_term_id, implies_special_filter_id) = 1),
  constraint confidence_range check (confidence between 0 and 100)
);
create index fitment_rules_trigger_category_idx on public.fitment_rules (trigger_category_id);
create index fitment_rules_trigger_model_idx    on public.fitment_rules (trigger_model_id);
create index fitment_rules_trigger_config_idx   on public.fitment_rules (trigger_config_id);

alter table public.fitment_rules enable row level security;
create policy "fitment_rules public-readable"
  on public.fitment_rules for select
  to anon, authenticated using (true);
-- NO insert/update/delete policy → writes are service-role/seed-only (default-deny),
-- exactly like every Phase-3 reference table and like search_term_targets.
```

**How garage-truck → flat-dimension expansion is encoded (CONTEXT requirement):** a rule row with `trigger_model_id = <359>` (and optionally `trigger_config_id = <Extended Hood>`) and `implies_search_term_id = <"359 Guys">` (or `implies_special_filter_id = <Long Hood>`). The suggest service, given a garage truck, queries `fitment_rules where trigger_model_id = truck.model_id and (trigger_config_id is null or trigger_config_id = truck.config_id)` and emits the implied search terms / filters as the "From your garage" expansion. This reuses the SAME table as category-driven rules — no second mechanism.

**Note on `model_configurations`:** garage expansion to a *config-level* truck suggestion (e.g. "you have a 359, also tag 359 Day Cab") can also lean on the existing `model_configurations` applicability join rather than a bespoke rule. Prefer driving exact-fitment suggestions from the truck itself + `model_configurations`, and reserve `fitment_rules` for the *slang/flat* expansions and the *category→fitment* inferences.

### Pattern 2: `lib/fitment/suggest.ts` — Server Action returning grouped suggestions
**What:** Given the seller's current trigger selections (the chosen part-category id) it returns suggestions grouped by SOURCE so the group header is the explainability layer (CONTEXT).
**When:** Called real-time from the client as the category changes (debounced).

```ts
// lib/fitment/suggest.ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { listMyTrucks } from "@/lib/garage/queries"; // existing P4 contract, RLS-scoped

export type SuggestedFitment = {           // maps onto FitmentSelection on accept
  modelId: number; configId: number | null;
  makeName: string; modelName: string; configName: string | null;
};
export type SuggestedTag = { kind: "search_term" | "special_filter" | "category"; id: number; name: string };

export type SuggestionGroup =
  | { source: "garage"; label: "From your garage"; fitments: SuggestedFitment[]; tags: SuggestedTag[] }
  | { source: "category"; label: string /* e.g. "Common for Bumpers" */; fitments: SuggestedFitment[]; tags: SuggestedTag[] };

export type SuggestResult = { groups: SuggestionGroup[] };

export async function suggestFitment(input: {
  partCategoryId: number | null;
}): Promise<SuggestResult> {
  const supabase = await createClient();
  // getClaims() — NOT getSession() (CLAUDE.md invariant #6). listMyTrucks already does
  // an RLS-scoped read via the cookie client, so garage suggestions are the caller's own.
  const groups: SuggestionGroup[] = [];

  // 1) GARAGE group (omit entirely if no trucks — CONTEXT "no garage → silent")
  const trucks = await listMyTrucks();
  if (trucks.length > 0) { /* map trucks → SuggestedFitment[]; expand via fitment_rules trigger_model_id */ }

  // 2) CATEGORY group (only when a category is chosen)
  if (input.partCategoryId != null) {
    // select implied entities from fitment_rules where trigger_category_id = input.partCategoryId
    // resolve implies_* ids to names via the public taxonomy tables
  }

  return { groups };
}
```

Key points the planner must enforce:
- **Auth via `getClaims()`** (invariant #6). The garage read is already RLS-scoped through the cookie-bound client; do NOT use the service role here.
- **Resolve names server-side** so the client can render chips and, on accept, build a full `FitmentSelection` without a second round-trip (mirrors how `FitmentMultiSelect` keeps names alongside ids).
- **Precision filter:** only emit suggestions whose rule `confidence` is high (e.g. ≥ a threshold constant). No score reaches the UI (CONTEXT).
- **Return `{ groups: [] }`** (never throw) so the empty-state message is a pure client decision.

### Pattern 3: Client wiring — accepted chips merge into the EXISTING `fitment` state (FINT-02)
**What:** The suggestions zone is a NEW component rendered inside the Fitment `<section>` of `listing-form.tsx`. Accepting a chip calls the SAME `setFitment` updater the manual `FitmentMultiSelect.onChange` uses.
**When:** This is the hard "never auto-applied" guarantee.

```tsx
// inside listing-form.tsx Fitment section, alongside <FitmentMultiSelect …>
const [categoryId, setCategoryId] = React.useState<number | null>(defaults?.categoryId ?? null);
const [suggestions, setSuggestions] = React.useState<SuggestionGroup[]>([]);
const [isSuggesting, startSuggest] = React.useTransition();

React.useEffect(() => {
  // debounce ~250ms; startTransition keeps typing/selecting jank-free (React 19, repo uses startTransition already)
  const t = setTimeout(() => startSuggest(async () => {
    const res = await suggestFitment({ partCategoryId: categoryId });
    setSuggestions(res.groups);
  }), 250);
  return () => clearTimeout(t);
}, [categoryId]);

function acceptFitment(s: SuggestedFitment) {
  // EXACTLY the FitmentMultiSelect.onChange path — de-dupe on (modelId, config arm),
  // then setFitment([...]) AND form.setValue("fitment", …, { shouldValidate: true }).
}
```

- **No `useEffect` ever calls `setFitment` automatically.** Only the chip click / "Add all" button handler does. That is the FINT-02 guarantee, and it is checkable in code review + e2e.
- **De-dupe against current `fitment`** before adding (the existing `addFitment` already does the same `(modelId, config arm)` check — reuse that predicate).
- **Preserve confirmed selections on re-trigger (CONTEXT):** because accepted chips live in `fitment` state and re-running the suggest effect only replaces `suggestions` (not `fitment`), prior confirmations are untouched by construction. Also filter the freshly-returned suggestions to drop any already present in `fitment` so they don't re-appear.
- **Dismiss = session-only:** keep a `Set` of dismissed suggestion keys in component state; filter the rendered groups against it. Not persisted.

### Pattern 4: The Part-Category trigger input is NEW and must be added
**What:** The form has no category control today. Add a single-select Part Category to the Fitment section (it is the primary trigger AND, recommended, becomes persisted listing data via `listing_categories`).
**When:** Required — without it there is no trigger, and FINT-03's "truck category" half is unsatisfiable.
- Reader: add `getPartCategories()` to `lib/listings/cascade.ts`, mirroring `getConditions()` (anon-public read, id+name, ordered). part_categories is a 2-level tree (seed.sql) — return them grouped/indented or flat with parent context.
- This is a **listing data addition**, so it touches `listingSchema`, `createListing`, `updateListing`, the form, AND the listing detail read (`lib/listings/queries.ts`) if you want the category shown back. Keep that surface in scope when sizing the phase.

### Pattern 5: Seed rules so the feature can demo (admin authoring is Phase 10)
**What:** A handful of `fitment_rules` rows + the listing↔category enabling, shipped as seed data.
**When:** Required for FINT-01/03 to be demonstrable.
- Follow the repo's seed idioms: `on conflict … do nothing`, resolve FK ids by `select`-by-name from the taxonomy (seed.sql already does this join-by-name pattern for `part_categories` children and `search_term_targets`).
- Minimum demo set: (a) `Bumpers → implies_search_term "Large Car"` / `→ implies_special_filter`; (b) `Hoods → implies_search_term "Long Hood"`; (c) garage expansion: `trigger_model_id 359 → implies_search_term "359 Guys"`. Use terms that ALREADY exist in the Phase-3 seed (`359 Guys`, `Large Car`, etc.) so FK lookups resolve.
- **Idempotency caveat:** `fitment_rules` has no natural unique key like `(name)`. Add a partial/expression unique index OR guard each seed insert with `where not exists (…)` (the same approach seed.sql uses for top-level `part_categories`). The planner should add a unique index over the trigger+implies arms (using `coalesce(…,0)` to fold the NULL arms — the repo's established trick) so seeds are re-runnable.

### Anti-Patterns to Avoid
- **A second source of truth for confirmed fitment.** Do NOT add a `suggestedFitment` array that the submit path reads. Accepted suggestions become rows in the SAME `fitment` state; the existing submit/validation is unchanged (CONTEXT specific idea).
- **Loose polymorphic `trigger_value text` / `implies_value text`.** The ARCHITECTURE.md sketch uses text columns; the repo's *actual* convention (search_term_targets) rejects that — use real FK arms + a `num_nonnulls = 1` CHECK so a rule can never point at a nonexistent entity.
- **Service-role anywhere in the suggest path.** Garage + rules are both readable by the cookie-bound client (garage via owner RLS, rules via public-read). Reaching for `lib/supabase/admin.ts` here is wrong (invariant #3).
- **`getSession()` for the caller.** Use `getClaims()` (invariant #6) — though note the garage read goes through `listMyTrucks()` which already relies on RLS, so you may not need to read the uid at all.
- **Auto-applying garage trucks.** They are SUGGESTIONS (CONTEXT). Never seed `fitment` from the garage on mount.
- **`select('*')` joins that pull profiles.** Not relevant here (no PII tables touched) but keep the column-enumeration discipline.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Make→Model→Config option loading | A new cascade | `getModels` / `getConfigs` from `lib/garage/cascade.ts` | Already library-valid via `model_configurations!inner`; the create action re-checks the same combos |
| Reading the seller's garage | A direct `garage_trucks` query | `listMyTrucks()` (`lib/garage/queries.ts`) | It's the documented P6/P7 contract, RLS-scoped, names resolved, never touches PII |
| Fitment chip + remove UI | New chip component | The `Badge` + `X` pattern in `fitment-multi-select.tsx` | Visual + a11y consistency; reuse the remove affordance |
| Combo validity ("is this config valid for this model") | Client-side check | The server-side `model_configurations` re-check already in `createListing`/`updateListing` | Trust boundary lives in the action; suggestions are untrusted too |
| Listing fitment persistence | A new write path | The existing `createListing`/`updateListing` child-insert (`listing_fitment`) | FINT-03: accepted suggestion = identical rows as manual tag |
| Idempotent reference seeding | Ad-hoc inserts | `on conflict … do nothing` + join-by-name (seed.sql idiom) | Re-runnable seeds; matches Phase 3 |

**Key insight:** ~80% of Phase 6 is *wiring*, not new infrastructure. The only genuinely new persistent artifacts are `fitment_rules` and (recommended) `listing_categories`/`listing_search_terms`. Everything else reuses Phase 3/4/5 code paths.

## Common Pitfalls

### Pitfall 1: Treating "suggest part category" as free when the listing has no category at all
**What goes wrong:** Planner assumes the trigger already exists in the form. It does NOT — there's no category control and no listing↔category persistence. The phase silently balloons.
**Why:** CONTEXT says "primarily a part category" as if it's an existing field; the actual form (read above) only has title/partNumber/price/condition/damageNotes + the Make/Model/Config fitment + barnyard.
**How to avoid:** Treat "add Part Category to the listing (selector + schema + actions + read-back + join table + RLS)" as an explicit Wave-1 deliverable, separate from the suggestion engine. Size the phase accordingly.
**Warning signs:** A plan that lists only `fitment_rules` + `suggest.ts` + chips and no listing-schema/migration change for categories.

### Pitfall 2: Flat dimensions (search terms, special filters) have nowhere to land
**What goes wrong:** The garage-expansion suggestions ("359 Guys", "Long Hood") and category-implied slang are visible chips, but accepting them has no `listing_*` table to write to — so FINT-03 ("appears in every applicable search result") is a lie for those dimensions.
**Why:** `listing_fitment` is model+config only; there's no `listing_search_terms`/`listing_special_filters`.
**How to avoid (decision required — see Open Question 1):** EITHER (a) add `listing_search_terms` (+ optionally `listing_special_filters`) join tables now so accepted flat suggestions persist and Phase 7 search can use them; OR (b) scope v1 suggestions to ONLY model/config + category (drop flat-dimension chips), and defer slang-tag persistence to Phase 7. **Recommendation: (a) for `listing_categories` + `listing_search_terms` at minimum**, because the garage→flat expansion is an explicit CONTEXT requirement and Phase 7 slang search needs the data. Whatever is chosen, make it explicit; do not ship chips that accept into nothing.
**Warning signs:** A suggestion chip whose "accept" handler has no corresponding insert in `createListing`.

### Pitfall 3: RLS forgotten on the new tables (the recurring cross-cutting gate)
**What goes wrong:** A new table (`fitment_rules`, `listing_categories`) ships without RLS or with a too-broad write policy — the Phase-6 instance of PITFALLS #2.
**How to avoid:** `alter table … enable row level security` in the SAME migration (invariant #2). `fitment_rules` = public-read, NO write policy (seed/service-role only), exactly like Phase-3 tables. `listing_categories`/`listing_search_terms` = public-read + owner-write-via-EXISTS-on-listing, exactly copying `listing_fitment`'s two policies. The integration test (below) must assert anon-read works and anon-write is denied for `fitment_rules`, and that owner-write/owner-only holds for the listing join tables.
**Warning signs:** Migration creates a table with no `enable row level security` line; `using (true)` on a write policy.

### Pitfall 4: Real-time suggest jank / waterfall
**What goes wrong:** Firing `suggestFitment` on every keystroke/select with no debounce or transition causes flicker and re-render storms; the skeleton flashes.
**How to avoid:** Debounce (~250ms) + `useTransition`/`startTransition` (already a repo pattern) so the input stays responsive and the suggestions zone shows the subtle skeleton during the pending transition. Cancel stale requests (clear the timeout in the effect cleanup).
**Warning signs:** No debounce; `await` directly in an onChange; skeleton never shows or never clears.

### Pitfall 5: Edit mode re-suggests already-confirmed fitments
**What goes wrong:** In edit mode the form is pre-filled with `defaults.fitment`; the suggest service doesn't know those exist and re-suggests them, cluttering the zone.
**Why:** The form is reused for create+edit (`mode` prop); `defaults?.fitment` seeds `fitment` state.
**How to avoid:** Client-side, filter returned suggestions against the CURRENT `fitment` (and category/term) state before rendering — drop any suggestion already confirmed. This also satisfies "preserve confirmed selections on re-trigger." (Doing it client-side is simplest; the server doesn't need the current selection set in v1.)
**Warning signs:** Editing a listing shows its own existing fitments as fresh suggestions.

### Pitfall 6: `confidence` / precision threshold not enforced → noisy suggestions
**What goes wrong:** Every rule fires regardless of confidence; the seller is overwhelmed, violating precision-first.
**How to avoid:** Apply a high-confidence filter server-side and keep seed rules deliberately sparse and direct. No ranking UI (CONTEXT). When in doubt, don't seed the rule.

## Code Examples

### Reading part categories (new cascade reader, mirrors getConditions)
```ts
// lib/listings/cascade.ts  — ADD
export type PartCategoryOption = { id: number; name: string; parentId: number | null };

export async function getPartCategories(): Promise<PartCategoryOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("part_categories")
    .select("id, name, parent_id")
    .order("parent_id", { nullsFirst: true })
    .order("name");
  if (error || !data) return [];
  return data.map((c) => ({ id: c.id, name: c.name, parentId: c.parent_id }));
}
```

### `listing_categories` join (mirror of `listing_fitment` — for migration 0012)
```sql
create table public.listing_categories (
  id bigint generated always as identity primary key,
  listing_id bigint not null references public.listings(id) on delete cascade,
  category_id bigint not null references public.part_categories(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index listing_categories_listing_id_idx on public.listing_categories (listing_id);
create unique index listing_categories_uniq on public.listing_categories (listing_id, category_id);

alter table public.listing_categories enable row level security;
create policy "listing_categories public-read" on public.listing_categories
  for select to anon, authenticated using (true);
create policy "listing_categories owner-write" on public.listing_categories
  for all to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid())))
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid())));
```
(`listing_search_terms` is identical with `term_id → public.search_terms(id)`.)

### Extending `listingSchema` (single source of truth)
```ts
// lib/listings/schema.ts — ADD to the .object({...}) before the .refine:
categoryIds: z.array(z.coerce.number().int().positive()).default([]),
searchTermIds: z.array(z.coerce.number().int().positive()).default([]), // if listing_search_terms is in scope
```
Then in `createListing`/`updateListing`: after the listing insert, bulk-insert `listing_categories` (and `listing_search_terms`) the SAME way `listing_fitment` is inserted; in `updateListing`, add them to the "delete then re-insert children" block. **Do not change the existing `fitment` handling** — accepted model/config suggestions still flow through it unchanged (FINT-03 for trucks).

## State of the Art

| Old Approach | Current Approach | Why |
|--------------|------------------|-----|
| ARCHITECTURE.md `fitment_rules(trigger_type, trigger_value, implies_type, implies_value)` text-discriminator | FK-arm exclusive-arc table (real FKs + `num_nonnulls=1` CHECK) | The repo's `search_term_targets` already established this; text values can't FK-enforce existence (PITFALLS #1 dangling-target class) |
| Auto-apply fitment | Seller-confirmed chips, never auto-applied | FINT-02 + PITFALLS #7 (false positives erode trust irreversibly) |

**Deprecated/outdated:** the literal `trigger_value`/`implies_value` text columns from the architecture sketch — supersede with FK arms. (The sketch's *intent* — "rules as data, admin-extensible" — is preserved.)

## Open Questions

1. **Scope of flat-dimension persistence (the one real decision).**
   - What we know: `listing_fitment` = model+config only. CONTEXT requires garage→flat expansion (search terms, special filters) AND "primary trigger = part category" (which isn't persisted today). FINT-03 says "every applicable fitment search result AND truck category."
   - What's unclear: how many new listing↔dimension join tables Phase 6 should add vs defer to Phase 7.
   - **Recommendation:** Add `listing_categories` (mandatory — without it "truck category" half of FINT-03 is impossible and the trigger has no home) and `listing_search_terms` (strongly recommended — it's where garage slang expansion lands and what Phase-7 slang search will read). Treat `listing_special_filters` / `listing_materials` as OPTIONAL/deferrable to Phase 7 unless the seed rules need them. Surface this to the planner as the phase's scoping fork.

2. **Where does the Part Category selector live — single vs multi?**
   - The trigger is "a part category" (singular in CONTEXT). But FINT-03 says "every applicable truck *category*." Recommend: a SINGLE primary category select drives suggestions (the trigger), but persist via the M2M `listing_categories` so the model is future-proof and a listing can hold more than one if later needed. Confirm with stakeholder during planning if multi-category selection is desired in v1 UI (default: single).

3. **Does the listing detail page need to display the new category/terms?**
   - `lib/listings/queries.ts` currently reads back only `listing_fitment`. If categories/terms are persisted, the detail read SHOULD surface them for the seller to verify (and for Phase-7 search facets). Recommend including in scope; low cost (one more embed).

4. **`is_barnyard` interaction.** A Barnyard listing may have no Make/Model. Does a part category still drive suggestions for Barnyard items? Recommend: category-based suggestions still work (a Barnyard item can have a category), but garage/truck suggestions are irrelevant when Barnyard is on. Keep the suggestions zone available; the barnyard-or-≥1-fitment refine is unchanged.

## Validation Architecture

> `.planning/config.json` has `workflow.research/plan_check/verifier: true` but **no `nyquist_validation` key**. The repo nonetheless has a real, established test harness (vitest + integration suites that self-skip without Supabase env), and every prior phase shipped a Wave-0 anon-RLS gate + schema unit tests. This section follows that established repo pattern.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 (unit + integration); Playwright 1.60 (e2e, `test:e2e`) |
| Config file | `vitest.config.mts` (+ `vite-tsconfig-paths`), node env per-file via `@vitest-environment node` |
| Quick run (unit) | `npm run test -- tests/unit/<file>.test.ts` |
| Full suite | `npm run test` (`vitest run`) |
| Integration gating | Self-skips unless `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` set (`tests/integration/_supabase.ts`, `INTEGRATION_ENABLED`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FINT-01 | `suggestFitment` returns category-implied + garage-expanded groups from seeded rules | integration (anon for rules; auth-scoped for garage) | `npm run test -- tests/integration/fitment-intelligence.test.ts` | ❌ Wave 0 |
| FINT-01 | `getPartCategories()` returns the seeded 2-level tree | unit/integration | (same file or `tests/unit/listing-cascade…`) | ❌ Wave 0 |
| FINT-02 | Accepted suggestion enters `fitment` state ONLY on explicit click; no effect auto-applies | e2e (Playwright) + code-review gate | `npm run test:e2e -- <spec>` | ❌ Wave 0 (e2e) — or assert in a component test |
| FINT-02/03 | An accepted model/config suggestion produces the SAME `listing_fitment` rows as a manual add | integration | `npm run test -- tests/integration/fitment-intelligence.test.ts` | ❌ Wave 0 |
| RLS gate | `fitment_rules` anon-readable, anon-write denied; `listing_categories` owner-write only | integration | `npm run test -- tests/integration/fitment-intelligence.test.ts` | ❌ Wave 0 |
| Schema | extended `listingSchema` accepts `categoryIds`/`searchTermIds`, still enforces barnyard-or-fitment refine | unit | `npm run test -- tests/unit/listing-schema.test.ts` (extend existing) | ✅ extend |

### Sampling Rate
- **Per task commit:** `npm run test -- <the file touched>` + `npm run typecheck`.
- **Per wave merge:** `npm run test` (full vitest run).
- **Phase gate:** full vitest suite green + (if e2e added) `npm run test:e2e` green before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/integration/fitment-intelligence.test.ts` — `fitment_rules` RLS gate (anon-read ok, anon-write denied), seed presence, and accept-writes-same-rows equivalence. Model on `tests/integration/fitment.test.ts` + `tests/integration/listings.test.ts`.
- [ ] Extend `tests/unit/listing-schema.test.ts` — `categoryIds`/`searchTermIds` parsing + refine still holds.
- [ ] (Optional but recommended) a Playwright spec or a component test asserting FINT-02: suggestions don't enter the confirmed list without a click. Note: FINT-02 is partly a code-review invariant ("no useEffect calls setFitment").
- [ ] Confirm `components/ui/skeleton.tsx` exists; if not, `npx shadcn@latest add skeleton`.

## Sources

### Primary (HIGH confidence — read directly from the repo)
- `supabase/migrations/0003_fitment_taxonomy.sql` — exclusive-arc FK pattern (`search_term_targets`), RLS-on + single public-read + no-write convention, `coalesce(…,0)` unique-index trick.
- `supabase/migrations/0006_listings.sql` — `listing_fitment` shape (model+config only), public-read + owner-write-via-EXISTS policies, `listing_view_events` invariant-#8 instrumentation pattern.
- `supabase/migrations/0004_garage.sql` / `0005_garage_year.sql` — `garage_trucks` owner-scoped shape (model+config+year).
- `components/listings/listing-form.tsx`, `components/listings/fitment-multi-select.tsx` — `FitmentSelection[]` state, `setFitment`/`form.setValue` sync, submit refine, create+edit reuse, `startTransition` usage.
- `lib/listings/schema.ts`, `lib/actions/listings.ts` — `listingSchema`, child-insert + replace-children edit pattern, `getClaims()` identity, `model_configurations` combo re-check.
- `lib/garage/queries.ts` (`listMyTrucks` — the P6/P7 contract), `lib/garage/cascade.ts` / `lib/listings/cascade.ts` (`getModels`/`getConfigs`/`getConditions`).
- `supabase/seed.sql` — part_categories 2-level tree + idempotent join-by-name seed idiom; existing search terms (`359 Guys`, `Large Car`, `Aerodyne`, …).
- `tests/integration/fitment.test.ts`, `tests/integration/_supabase.ts`, `tests/unit/listing-schema.test.ts`, `package.json`, `vitest.config.mts` — test harness + self-skip gating.
- `.planning/research/ARCHITECTURE.md` (fitment_rules sketch, suggest service location), `.planning/research/PITFALLS.md` (#2 RLS, #7 fitment precision), `.planning/ROADMAP.md` Phase 6, `.planning/REQUIREMENTS.md` (FINT-01/02/03, GRGE-04).

### Secondary (MEDIUM)
- CLAUDE.md Architectural Invariants (#1 table split, #2 RLS default-deny, #3 service-role server-only, #6 getClaims, #8 event logging) — project law, applied throughout.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all paths verified in installed `package.json` and live code.
- Architecture / `fitment_rules` shape: HIGH — derived directly from the repo's own `search_term_targets` + `listing_fitment` precedents, not from training data.
- The flat-dimension-persistence scoping (Open Q1): MEDIUM — it's a genuine product/scope fork the planner/stakeholder must resolve; the recommendation is opinionated but reversible.
- Pitfalls: HIGH — sourced from PITFALLS.md + the actual code gaps observed.

**Invariant #8 (event logging) determination:** Phase 6 ships **no new event logging**. The accept/reject suggestion telemetry is explicitly DEFERRED (CONTEXT). Invariant #8's "log with the feature" rule applies to *non-reconstructible* user-facing events (search events, listing-view events) — those belong to Phases 5/7 and are already instrumented (`listing_view_events` in 0006). A suggestion accept/reject is reconstructible from the resulting `listing_fitment`/`listing_categories` rows at confirmation time and is a tuning signal, not a product event, so it is correctly out of scope. **Conclusion: no logging table or instrumentation is required in Phase 6.**

**Research date:** 2026-06-09
**Valid until:** ~2026-07-09 (stable — pinned stack, internal patterns; re-verify only if Phase 7 search design changes the listing↔dimension persistence decision).
