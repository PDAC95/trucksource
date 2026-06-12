# Phase 4: My Garage - Research

**Researched:** 2026-06-04
**Domain:** Owner-scoped relational data (a per-user "garage" of trucks) referencing the Phase-3 fitment library; Next.js 16 App Router (Server Components + Server Actions) + Supabase Postgres/RLS; a dependent Make→Model→Config cascade UI in a shadcn modal.
**Confidence:** HIGH (every pattern this phase needs already exists in-repo from Phases 1–3 and is verified by reading the actual migrations, actions, forms, and tests; the only NEW thing is the first owner-scoped *read+write* `authenticated` table, which is a direct application of patterns already in `profiles_private` and the architecture docs).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Truck selector (add flow)**
- **Dependent cascade**: ordered selection Make → Model → Configuration. Selecting a Make loads only that Make's Models; selecting a Model loads only its Configs. No invalid combinations possible.
- **Searchable levels when lists are long**: Make likely short (plain dropdown fine); Model/Config may be long → make those filter-as-you-type. Decide per-level by actual list length.
- **Required depth: Make + Model minimum.** Configuration is optional. If no Config is chosen, the truck is stored at Model granularity and the "fits my truck" filter operates at Model level for that truck.
- **Library-only, no free text**: a user can only save Make/Model/Config combinations that exist in the Phase-3 fitment library. If their truck isn't found, **block the save and surface a "Missing your truck? Let us know" report/feedback affordance.**
- **No exact duplicates**: the same (Make, Model, Config) combination cannot be saved twice by one user. (Nickname distinguishes genuinely-similar trucks if needed.)
- **Add UI = modal/dialog**: an "Add truck" button opens a modal containing the cascade; the user never leaves the garage view.
- **Success feedback**: brief success toast + the new truck appears immediately in the garage list.

**Garage view (list + manage)**
- **Card-based layout** — one card per saved truck, room for nickname, full fitment string, and actions.
- **Per-truck info**: nickname displayed prominently when present; the full `Make Model Config` combination shown beneath. When nickname is empty, the fitment combination is the primary label.
- **Edit = same cascade modal, pre-filled** with the truck's current selections.
- **Delete requires confirmation** ("Delete this truck?") to prevent accidental removal.
- **Soft cap ~20 trucks** per user. (Exact number is Claude's discretion if 20 proves awkward.)

**Nickname / label**
- **Optional nickname per truck** (e.g. "Mi 379 rojo"). Empty nickname → fall back to the fitment combination as the label.
- **Validation**: optional, **max length ~40 characters**, no special requirements.
- **"Fits my truck" truck selection = explicit selector at filter time.** No persistent default/active truck. When a user has multiple trucks, search/feed presents a chooser among their trucks; the Phase-7 hook receives a single `truck_id`. (No default flag to manage.)

**Empty state & entry**
- **Location: section of the user profile** (e.g. a "My Garage" tab / `/profile/garage`) — private account data, in the user's own area, not a public top-level surface.
- **Post-registration: soft, skippable invitation.** After registering, an optional banner/step ("Add your truck to see parts that fit") that is clearly skippable and never blocks.
- **Empty state = explanatory + CTA**: explains the value plus an "Add truck" button.
- **"Fits my truck" with zero trucks (Phase-7 contract)**: the filter control is still discoverable, but activating it with no saved trucks invites the user to add one first (link to the garage). Defined here as the contract; the actual search UI is built in Phase 7.

### Claude's Discretion
- Exact soft-cap number if 20 is awkward.
- Per-level decision of which cascade dropdowns get search vs. plain dropdown (driven by real Phase-3 list lengths).
- Card visual design, spacing, iconography.
- Toast styling and exact copy.
- Loading/skeleton states while cascade levels fetch.

### Deferred Ideas (OUT OF SCOPE)
- Building the actual "fits my truck" search/feed filter UI — **Phase 7** (this phase only exposes the `truck_id` filtering contract).
- Seller fitment pre-fill suggestion logic — **Phase 6** (this phase only makes garage trucks available as a pre-fill source).
- Free-text / user-submitted truck Make/Model/Config entries — out of scope for v1 (library-only). The "Missing your truck? Let us know" feedback could feed a future admin-curation flow.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GRGE-01 | User can add one or more trucks to their garage (Make → Model → Configuration from the fitment library), optionally — not required at registration | New `garage_trucks` table (owner-scoped RLS) FKs to `models.id` (required) + `configurations.id` (nullable); add flow = shadcn Dialog with a Make→Model→Config cascade fed by Server Component / route-handler reads of `makes`/`models`/`model_configurations`; addTruck Server Action validates the shared Zod schema + re-checks the (model, config) library combo + owner scope. Optional/never-forced is enforced by NOT touching registration (`handle_new_user` is unchanged) and a skippable post-registration banner. |
| GRGE-02 | User can view, edit, and remove trucks in their garage | List = Server Component reading the owner's `garage_trucks` joined to fitment names via the cookie-bound user client (RLS scopes to `auth.uid()`); edit = same Dialog pre-filled, `updateTruck` action; delete = AlertDialog confirm → `deleteTruck` action; each action re-derives `auth.uid()` via `getClaims()` and relies on RLS `WITH CHECK`/`USING ((select auth.uid()) = user_id)`. |
| GRGE-03 | Buyer can filter the feed/search to parts that fit a selected garage truck ("Fits my truck"), with one click | **Contract only this phase.** Define the stable shape Phase 7 consumes: a `truck_id` (bigint PK of `garage_trucks`) resolves to `{ make_id, model_id, config_id|null }` via a read helper (`lib/garage/queries.ts`) and/or a `garage_truck_fitment(truck_id)` SQL function. Provide an owner-scoped "list my trucks for the chooser" query. Granularity rule from CONTEXT: config null ⇒ filter at model level. |
| GRGE-04 | A seller's garage trucks pre-fill / accelerate Fitment Intelligence suggestions when they create a listing | **Source contract only this phase.** Expose the same owner-scoped "list my trucks → resolved make/model/config" helper so Phase 6 can read the seller's garage as a pre-fill source. No suggestion logic here. |
</phase_requirements>

## Summary

Phase 4 is **almost entirely a re-application of patterns already shipped in Phases 1–3.** There is no new external library, no new infrastructure, and no new auth surface — it lives behind the existing `(app)` auth gate. The one genuinely new element is the **first owner-scoped read *and* write `authenticated` table** (`garage_trucks`): Phases 1–2 owner-scoping covered only `profiles_private` (owner read/update, rows inserted by a trigger) and service-role-only abuse tables. `garage_trucks` is the first table where an authenticated user does INSERT/SELECT/UPDATE/DELETE on their own rows, so it needs the full four-policy owner set with `(select auth.uid()) = user_id` (the perf-correct wrapper the repo already uses everywhere).

The schema is small: `garage_trucks(id, user_id→auth.users, model_id→models, config_id→configurations NULL, nickname, created_at)`. It FKs into the **real Phase-3 tables** (confirmed by reading `0003_fitment_taxonomy.sql`): `makes`, `models(make_id, name)`, `configurations` (a **shared master**, NOT per-model), and `model_configurations(model_id, configuration_id)` is the applicability join the cascade must read to scope a model's configs. Make is *derived* via `models.make_id` — the garage row stores `model_id` (+ optional `config_id`), not `make_id`, because model already determines make and configs are validated against `model_configurations`.

The UI is a card-list Server Component under a new `/profile/garage` route inside the `(app)` group, with an "Add truck" shadcn **Dialog** containing the dependent cascade. The cascade and all mutations follow the **exact** repo conventions: shared Zod schema (client + Server Action), RHF + `zodResolver` + `sonner` toasts, `router.refresh()` to re-resolve the force-dynamic server list, `getClaims()` (never `getSession()`) in every action, and a privacy/RLS integration-test gate mirroring `rls.test.ts`/`fitment.test.ts`.

**Primary recommendation:** Add migration `0004_garage.sql` (table + 4 owner policies + RLS-in-same-migration + a `garage_truck_fitment`/list helper for the Phase 6/7 contracts), a `lib/garage/schema.ts` shared Zod module, `lib/actions/garage.ts` Server Actions (add/update/delete, all `getClaims`-scoped + library-combo re-validation), a `lib/garage/queries.ts` owner-scoped read helper, `/profile/garage` page + an "Add truck" Dialog cascade, and `tests/integration/garage.test.ts` proving owner-isolation under RLS (anon sees 0; the cross-cutting PII gate still green). Install the missing shadcn primitives (`dialog`, `alert-dialog`, `command`, `popover`) for the modal + searchable cascade.

## Standard Stack

Everything is already pinned in `package.json`. Phase 4 adds **no new npm dependency** — only a few shadcn components (CLI-installed, you own the files).

### Core (already installed — versions from package.json)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.6 | App Router, Server Components, Server Actions | Project stack; the garage page is a force-dynamic `(app)` route |
| react / react-dom | 19.2.4 | UI + `useActionState`/`startTransition` | Repo's form pattern uses `startTransition` (see `phone-step.tsx`) |
| @supabase/ssr | 0.10.3 | Cookie-bound server client (RLS-enforced) | `lib/supabase/server.ts` `createClient()` is the read/write client for owner rows |
| @supabase/supabase-js | 2.106.2 | Query builder + RPC | Used both in actions and in the anon integration tests |
| react-hook-form | 7.77.0 | Cascade form state | Repo standard (`register-form`, `phone-step`) |
| zod | 4.4.3 | Shared client+server schema | CLAUDE.md invariant: same schema both sides |
| @hookform/resolvers | 5.4.0 | `zodResolver` | Repo standard |
| sonner | 2.0.7 | Success/error toasts | CONTEXT requires a success toast; `<Toaster/>` already wired |
| lucide-react | 1.17.0 | Icons on cards/buttons | Repo standard |
| zod | 4.4.3 | validation | — |

### Supporting — shadcn components to install (you own them after install)
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `dialog` | "Add truck" / "Edit truck" modal (CONTEXT: add UI = modal) | Wrap the cascade |
| `alert-dialog` | "Delete this truck?" confirm (CONTEXT: delete requires confirmation) | Delete affordance |
| `command` + `popover` | Filter-as-you-type combobox for long Model/Config lists (CONTEXT: searchable levels) | Model/Config levels if lists are long |
| `card` (optional) | Card-per-truck layout | Or hand-roll with existing Tailwind classes like `empty-listings.tsx` |

**Note:** `select.tsx`, `button.tsx`, `form.tsx`, `input.tsx`, `label.tsx`, `checkbox.tsx`, `sonner.tsx`, `badge.tsx` already exist. `dialog`, `alert-dialog`, `command`, `popover`, `card` do **not** exist yet (`Glob components/**` confirms). Install via the project's shadcn CLI (`npx shadcn@latest add dialog alert-dialog command popover card`). `radix-ui@1.4.3` (the unified package the repo uses) backs these.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn `command` combobox for cascade levels | plain `select` for all 3 levels | If Phase-3 lists are short, plain `select` (already installed) is simpler and zero new components. CONTEXT explicitly says decide per-level by **actual list length** — see Open Questions for the measured counts. |
| Server Action reads for cascade options | Route Handler (`app/api/...`) returning JSON | Repo has both patterns (`username-available/route.ts` is a route handler; actions read directly). For a cascade, prefer reading options in the **Server Component** (initial makes) + a small Server Action or route handler for dependent fetches. Reference tables are anon-public so either works. |
| Storing `make_id` on the row | Derive make from `models.make_id` | Don't store make — it's redundant and risks drift; `model_id` already determines make. |

**Installation:**
```bash
# No npm install needed. Only shadcn components:
npx shadcn@latest add dialog alert-dialog command popover card
```

## Architecture Patterns

### Recommended Project Structure (new files this phase)
```
app/
└── (app)/
    └── profile/
        └── garage/
            ├── page.tsx              # Server Component: force-dynamic, getClaims gate,
            │                         #   reads owner garage_trucks + fitment names, renders cards
            ├── garage-list.tsx       # (optional client wrapper if needed for dialog state)
            ├── add-truck-dialog.tsx  # "use client": Dialog + cascade form (RHF + zod + sonner)
            └── truck-card.tsx        # card + edit/delete affordances (AlertDialog confirm)
lib/
├── actions/
│   └── garage.ts                     # "use server": addTruck/updateTruck/deleteTruck
│                                     #   (getClaims-scoped, shared-zod re-validate, combo re-check)
└── garage/
    ├── schema.ts                     # shared Zod (truckSchema): model_id req, config_id optional, nickname<=40
    └── queries.ts                    # owner-scoped reads: listMyTrucks(), truck→{make,model,config} (P6/P7 contract)
supabase/
└── migrations/
    └── 0004_garage.sql               # garage_trucks + RLS-in-same-migration + 4 owner policies
                                      #   + optional garage_truck_fitment(truck_id) helper fn
tests/
└── integration/
    └── garage.test.ts                # RLS gate: anon sees 0 rows; anon write denied; (owner-isolation)
```

Mounting under `(app)/profile/garage` inherits the existing **email-confirmation + auth gate** for free (the `(app)/layout.tsx` `getClaims()` redirect). The CONTEXT note "section of the user profile" → `/profile/garage`; there is currently no `/profile` route, so this phase introduces the `profile` segment (no conflict — `(app)` currently owns only `/`, `/verify`).

### Pattern 1: Owner-scoped read+write table (the one NEW thing) — full four-policy set
**What:** `garage_trucks` is the first table where `authenticated` users INSERT/SELECT/UPDATE/DELETE *their own* rows. Mirror the `profiles_private` owner posture but add INSERT + DELETE (private profiles are trigger-inserted; garage rows are user-inserted).
**When to use:** This table.
**Example** (mirrors `0001`/`0002` style verbatim — lowercase SQL, `(select auth.uid())` wrapper, RLS enabled in the same migration):
```sql
-- 0004_garage.sql
create table public.garage_trucks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id bigint not null references public.models(id) on delete restrict,
  config_id bigint references public.configurations(id) on delete restrict,  -- NULL = model-level
  nickname text,
  created_at timestamptz not null default now(),
  constraint nickname_len check (nickname is null or char_length(nickname) <= 40),
  -- no exact duplicate (Make,Model,Config) per user; coalesce folds the NULL config arm
  -- (same idempotency trick as search_term_targets_uniq in 0003)
  unique (user_id, model_id, coalesce(config_id, 0))
);
create index garage_trucks_user_id_idx on public.garage_trucks (user_id);

alter table public.garage_trucks enable row level security;

create policy "owner reads own trucks"
  on public.garage_trucks for select
  to authenticated using ((select auth.uid()) = user_id);
create policy "owner inserts own trucks"
  on public.garage_trucks for insert
  to authenticated with check ((select auth.uid()) = user_id);
create policy "owner updates own trucks"
  on public.garage_trucks for update
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "owner deletes own trucks"
  on public.garage_trucks for delete
  to authenticated using ((select auth.uid()) = user_id);
-- NO anon policy => garage is structurally invisible publicly (CONTEXT invariant).
```
**Note on `unique (user_id, model_id, coalesce(config_id, 0))`:** a plain `unique(user_id, model_id, config_id)` does NOT dedupe NULL configs (NULLs are distinct in a unique constraint), so two model-level trucks would both be allowed. The repo already solved this exact NULL-arm problem in `0003` (`search_term_targets_uniq` with `coalesce(...,0)`). Implement it as a **unique index** (constraints can't use expressions): `create unique index garage_trucks_uniq on public.garage_trucks (user_id, model_id, coalesce(config_id, 0));`

### Pattern 2: Config must belong to the chosen model (library-combo integrity)
**What:** CONTEXT: "no invalid combinations possible." A FK to `configurations` alone does NOT guarantee the config is *applicable to that model* — `configurations` is a **shared master**; applicability lives in `model_configurations`. So when `config_id` is non-null, the action must verify a row exists in `model_configurations(model_id, configuration_id)`.
**When to use:** addTruck / updateTruck, server-side (trust boundary).
**Example:**
```ts
// inside lib/actions/garage.ts, after zod parse + getClaims:
if (config_id != null) {
  const { data: ok } = await supabase
    .from("model_configurations")
    .select("id")
    .eq("model_id", model_id)
    .eq("configuration_id", config_id)
    .maybeSingle();
  if (!ok) return { ok: false, error: "invalid_combo" }; // → "Missing your truck? Let us know"
}
```
The cascade UI already prevents bad combos (it only shows configs from `model_configurations` for the chosen model), but the server **re-validates** because the client is untrusted — this is the same trust-boundary discipline as `register`/`sendOtp`.

### Pattern 3: Shared Zod schema, client + server (CLAUDE.md invariant)
**What:** One `truckSchema` in `lib/garage/schema.ts` validates in the cascade form AND inside the Server Action. Exactly the `lib/verify/schema.ts` + `lib/validation/auth.ts` pattern.
**Example:**
```ts
// lib/garage/schema.ts
import { z } from "zod";
export const truckSchema = z.object({
  modelId: z.coerce.number().int().positive(),          // Make+Model required (Make implied by model)
  configId: z.coerce.number().int().positive().nullable().optional(), // Config optional
  nickname: z.string().max(40).optional().or(z.literal("")),
});
export type TruckInput = z.infer<typeof truckSchema>;
```
(`z.coerce.number()` because Radix Selects emit strings; the repo already coerces booleans the same way in `register/actions.ts`.)

### Pattern 4: Server Action mutation + `router.refresh()` re-resolve (repo's signature flow)
**What:** Mutations are `"use server"` actions returning a discriminated `{ ok: true } | { ok: false; error: ... }` result (exactly `SendOtpResult`/`RegisterState`). The client form calls the action inside `startTransition`, toasts on result, and calls `router.refresh()` so the **force-dynamic** garage page re-reads `garage_trucks` and shows the new card. No client list-state to drift — DB is the source of truth (same rationale as `phone-step.tsx`).
**When to use:** add / edit / delete.
**Example (action skeleton, mirrors `verify.ts`):**
```ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { truckSchema } from "@/lib/garage/schema";

export type AddTruckResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" | "invalid" | "invalid_combo" | "duplicate" | "cap_reached" };

export async function addTruck(input: unknown): Promise<AddTruckResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  const parsed = truckSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { modelId, configId, nickname } = parsed.data;

  // soft cap (~20) — count owner rows first
  const { count } = await supabase
    .from("garage_trucks")
    .select("id", { count: "exact", head: true });   // RLS scopes to owner
  if ((count ?? 0) >= 20) return { ok: false, error: "cap_reached" };

  // config applicability re-check (Pattern 2) …

  const { error } = await supabase.from("garage_trucks").insert({
    user_id: userId,                 // RLS WITH CHECK also enforces this
    model_id: modelId,
    config_id: configId ?? null,
    nickname: nickname || null,
  });
  if (error) {
    // 23505 unique_violation => duplicate (Make,Model,Config) for this user
    if ((error as { code?: string }).code === "23505") return { ok: false, error: "duplicate" };
    return { ok: false, error: "invalid" };
  }
  return { ok: true };
}
```

### Pattern 5: Dependent cascade data fetching (Make → Model → Config)
**What:** Reference tables (`makes`/`models`/`configurations`/`model_configurations`) are **anon-public read** (proven by `fitment.test.ts`), so the cascade can read them with the cookie-bound server client OR even the browser client. Recommended:
- **Initial makes** — fetch in the Server Component (`page.tsx`) and pass to the dialog as props (no client round-trip on open).
- **Models for a make** — `select id,name from models where make_id = $1 order by name`.
- **Configs for a model** — join through applicability: `select c.id, c.name from configurations c join model_configurations mc on mc.configuration_id = c.id where mc.model_id = $1 order by c.name`.
- Dependent fetches on selection: a small **Server Action** (`getModels(makeId)` / `getConfigs(modelId)`) returning `{id,name}[]`, called from the client cascade. This keeps queries server-side and reuses `createClient()`. (A route handler like `username-available/route.ts` is an equally valid alternative.)
**Anti-pattern:** loading ALL models/configs up front and filtering client-side — fine if Phase-3 lists are tiny (see Open Questions for counts: 17 models, 9 configs at launch → up-front load is actually viable and simplest, but the cascade must still **scope configs by `model_configurations`**, not show all 9).

### Pattern 6: The Phase 6 / Phase 7 consumption contract (build it as a stable helper now)
**What:** GRGE-03/04 are *contracts* this phase, not UI. Define ONE owner-scoped read surface both later phases import, so they don't reach into `garage_trucks` directly:
```ts
// lib/garage/queries.ts
export type GarageTruck = {
  id: number;            // truck_id — the stable handle Phase 7's "fits my truck" passes around
  nickname: string | null;
  makeId: number; makeName: string;
  modelId: number; modelName: string;
  configId: number | null; configName: string | null;  // null => filter at MODEL granularity
};
// listMyTrucks(): GarageTruck[]  — owner-scoped (cookie client, RLS), used by:
//   - this phase's garage list + the "Add truck" cap check
//   - Phase 7 "fits my truck" chooser (returns truck_id per CONTEXT)
//   - Phase 6 seller pre-fill source
```
Optionally also ship a SQL helper `garage_truck_fitment(truck_id bigint)` (SECURITY INVOKER so RLS still applies — do NOT use SECURITY DEFINER here; this is owner data, not a public-safe boolean like `is_verified_seller`) returning `(make_id, model_id, config_id)` for Phase 7's filter join. **Granularity contract:** `config_id IS NULL` ⇒ match by model; non-null ⇒ match by exact config. Document this so Phase 7 builds the join right the first time.

### Anti-Patterns to Avoid
- **SECURITY DEFINER on garage reads.** The Phase-1/2 RPCs (`active_listing_count`, `is_verified_seller`) are DEFINER because they expose only a *public-safe scalar*. Garage rows are private owner data — a DEFINER function would bypass RLS and could leak another user's garage. Use plain owner-RLS reads or a SECURITY INVOKER function.
- **Storing `make_id` on `garage_trucks`.** Redundant; derive via `models.make_id`. Storing it invites drift.
- **`select('*')` joining garage to profiles.** Same PII-leak class as PITFALLS #1 — garage never needs profile data; the list joins only to fitment reference names.
- **Plain `unique(user_id, model_id, config_id)`** — does not dedupe model-level (NULL config) trucks. Use the `coalesce(config_id,0)` unique **index**.
- **Trusting the client cascade for combo validity.** Re-validate `model_configurations` server-side (Pattern 2).
- **Forcing garage at registration.** `handle_new_user` (0001) stays untouched; entry is a skippable post-registration banner only.
- **Exposing garage on any public surface** (e.g. `/u/[username]`). The public profile reads `profiles_public` only — never join garage.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Owner-row authorization | Manual `where user_id = …` only in app code | RLS owner policies + `(select auth.uid())` | DB enforces even if an action forgets a filter; repo invariant |
| Duplicate-combo prevention | App-side "does it already exist" check only | DB unique index `(user_id, model_id, coalesce(config_id,0))` + catch `23505` | Race-safe; app check alone races |
| Modal / confirm dialog | Custom overlay + focus trap | shadcn `dialog` / `alert-dialog` (radix-backed) | Accessibility, focus management for free |
| Searchable dropdown | Custom filter input + list | shadcn `command` + `popover` combobox | Keyboard nav, a11y; only if lists are long |
| Form state + validation | Manual controlled inputs | RHF + `zodResolver` + shared schema | Repo standard; one schema both sides |
| Toast | Custom snackbar | `sonner` (`<Toaster/>` already mounted) | Already in repo |
| Identity in actions | `getSession()` | `getClaims()` | `getSession` trusts unverified cookies (invariant 6) |

**Key insight:** This phase should introduce **zero novel infrastructure.** Every concern already has a chosen tool in-repo; the plan is "wire the established patterns to a new tiny table."

## Common Pitfalls

### Pitfall 1: NULL config defeats the duplicate-prevention unique constraint
**What goes wrong:** Two model-level trucks (same model, no config) both insert because `NULL <> NULL` in a unique constraint.
**Why it happens:** Postgres treats NULLs as distinct in unique constraints/indexes by default.
**How to avoid:** Unique **index** on `(user_id, model_id, coalesce(config_id, 0))` — the repo's own `0003` solution.
**Warning signs:** Duplicate cards for the same model with no nickname.

### Pitfall 2: Config validated only by FK, not by applicability
**What goes wrong:** A config that exists but isn't applicable to the chosen model gets saved (because `configurations` is a shared master, FK passes).
**Why it happens:** Diverges from the ARCHITECTURE sketch (`configurations.model_id`); the real schema puts applicability in `model_configurations`.
**How to avoid:** Server-side `model_configurations(model_id, configuration_id)` existence check (Pattern 2) AND scope the cascade's config options through that join.
**Warning signs:** A truck whose config makes no sense for its model.

### Pitfall 3: Caching serving one user's garage to another
**What goes wrong:** Personalized garage list cached and shown to a different user.
**Why it happens:** Forgetting `force-dynamic` on a personalized route (PITFALLS #6 / invariant 6).
**How to avoid:** The `(app)` layout is already `force-dynamic` (inherited); set `export const dynamic = "force-dynamic"` on `garage/page.tsx` too (the `verify/page.tsx` does this defensively). Reads use the cookie-bound client.
**Warning signs:** Garage shows after logout, or wrong trucks after account switch.

### Pitfall 4: Soft-cap race / client-only cap
**What goes wrong:** A user blows past ~20 by racing requests, or the cap is enforced only in the UI.
**How to avoid:** Count owner rows server-side in `addTruck` before insert (RLS scopes the count). A DB-level cap (trigger) is optional belt-and-suspenders but not required for a "soft" cap; server-side count is sufficient.
**Warning signs:** Users with 50 trucks.

### Pitfall 5: Empty-string nickname stored instead of NULL
**What goes wrong:** `""` is stored, so "empty nickname → fall back to fitment label" logic breaks (it's not NULL).
**How to avoid:** Normalize `nickname || null` in the action (Pattern 4) and treat empty as absent in the UI.

### Pitfall 6: New table breaks the cross-cutting privacy/RLS gate
**What goes wrong:** Adding a table without re-running the PII/RLS contract test lets a regression slip.
**How to avoid:** Add `tests/integration/garage.test.ts` (anon SELECT on `garage_trucks` returns 0 rows, anon INSERT denied) AND keep the full suite green (`privacy.contract.test.ts` / `rls.test.ts` must still pass). This is the phase's RLS gate (ROADMAP cross-cutting requirement).

## Code Examples

### Owner-scoped read of the garage list (Server Component)
```ts
// app/(app)/profile/garage/page.tsx  (force-dynamic)
const supabase = await createClient();
const { data } = await supabase.auth.getClaims();
if (!data?.claims) redirect("/login");

// RLS scopes to the owner; join only to fitment NAMES (never PII).
const { data: trucks } = await supabase
  .from("garage_trucks")
  .select(`
    id, nickname, config_id,
    models:model_id ( id, name, makes:make_id ( id, name ) ),
    configurations:config_id ( id, name )
  `)
  .order("created_at", { ascending: false });
```
(Nested selects here are safe — they touch only public reference tables, never `profiles_*`.)

### Anon RLS gate (mirrors rls.test.ts / fitment.test.ts)
```ts
// tests/integration/garage.test.ts   @vitest-environment node
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, anonClient } from "./_supabase";
const d = INTEGRATION_ENABLED ? describe : describe.skip;

d("garage_trucks is owner-scoped (anon-deny)", () => {
  it("anon SELECT returns 0 rows (RLS default-deny for anon)", async () => {
    const { data, error } = await anonClient().from("garage_trucks").select("*");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
  it("anon INSERT is denied (no anon policy)", async () => {
    const { error } = await anonClient()
      .from("garage_trucks")
      .insert({ user_id: "00000000-0000-0000-0000-000000000000", model_id: 1 });
    expect(error).not.toBeNull();
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `configurations.model_id` (per-model configs, per ARCHITECTURE.md sketch) | `configurations` is a **shared master**; applicability in `model_configurations` | Phase 3 decision (STATE.md 2026-06-04) | Garage MUST FK `config_id`→`configurations.id` and validate applicability via `model_configurations`, not assume config belongs to model |
| `getSession()` | `getClaims()` / `getUser()` | repo-wide (invariant 6) | All garage actions use `getClaims()` |
| Stored boolean flags exposed publicly | SECURITY DEFINER RPC for public-safe scalars only | Phases 1–2 | Garage reads are owner-RLS, NOT DEFINER (private data) |

**Deprecated/outdated:**
- ARCHITECTURE.md's `configurations(model_id)` — superseded by the shared-master design; trust the migration `0003`, not the sketch.
- `@supabase/auth-helpers-nextjs` — never use (CLAUDE.md / STACK).

## Open Questions

1. **Actual Phase-3 list lengths (drives plain-select vs combobox per level).**
   - What we know (from STATE.md seed record + `fitment.test.ts`): launch seed = **makes=2, models=17, configurations=9** (master), `model_configurations`=44 applicability links. So per *make* a handful of models; per *model* a handful of applicable configs.
   - What's unclear: exact per-make model counts and per-model config counts (small, but verify live).
   - Recommendation: At launch sizes, **plain `select`** for all three levels is adequate and simplest (no `command`/`popover` needed yet). Still install/keep combobox optional for Model if a make grows large later. **Verify live** with `supabase db query` (`select make_id, count(*) from models group by 1` and `select model_id, count(*) from model_configurations group by 1`) during planning so the planner picks per-level controls from real numbers.

2. **Where does the post-registration skippable banner live?**
   - What we know: CONTEXT wants a soft, skippable invitation after registering; registration currently redirects to `/check-email` (email confirmation gate), and the first authenticated landing is `(app)/page.tsx`.
   - What's unclear: exact placement (a dismissible banner on `(app)/page.tsx` vs a one-time step).
   - Recommendation: A dismissible banner on the `(app)` dashboard (`/`) shown when the user has 0 garage trucks, linking to `/profile/garage`. No persisted "dismissed" flag needed for v1 (could be `localStorage`); never blocks. Confirm with planner.

3. **Is a `garage_truck_fitment()` SQL function worth shipping now, or just the TS helper?**
   - What we know: Phase 7 needs to resolve `truck_id → {make,model,config}` for its filter join; Phase 6 needs the seller's truck list.
   - Recommendation: Ship the TS `lib/garage/queries.ts` helper (definitely) and, optionally, a SECURITY INVOKER SQL function for Phase 7's server-side join. Lean toward the TS helper as the contract; add the SQL function only if planning for Phase 7 shows it's needed in-DB. Either way, document the **config-null ⇒ model-granularity** rule.

4. **`on delete` for `model_id`/`config_id` FKs.**
   - Recommendation: `on delete restrict` (admin shouldn't silently nuke users' saved trucks by retiring a model). If a model is ever retired, that's an admin (Phase 10) concern. (Contrast with `on delete cascade` used inside the taxonomy itself.)

## Validation Architecture

> `.planning/config.json` shows `workflow.research/plan_check/verifier: true` but no `nyquist_validation` key. Including a lightweight test map because the project already runs an integration gate per phase (the cross-cutting RLS/privacy gate) and this phase MUST re-verify it.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | `vitest.config.*` (present — `tests/stubs/server-only.ts` aliased; `vite-tsconfig-paths` for `@/`) |
| Quick run command | `npm test` (`vitest run`) |
| Full suite command | `npm test` (13 files / 68 passed / 1 skipped pre-Phase-4) |
| Integration env | node; self-skips without `NEXT_PUBLIC_SUPABASE_*` (`INTEGRATION_ENABLED`); anon key vs Staging |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRGE-01 | add truck (library-only combo, optional, owner-scoped) | integration (RLS) + unit (zod) | `npm test` | ❌ Wave 0 (`tests/integration/garage.test.ts`, `tests/unit/garage-schema.test.ts`) |
| GRGE-01 | garage NOT public — anon sees 0 rows, anon write denied | integration (RLS gate) | `npm test` | ❌ Wave 0 (garage.test.ts) |
| GRGE-02 | view/edit/remove own trucks | integration (owner round-trip, if authed-client harness added) / manual UAT | `npm test` / UAT | ⚠️ partial — anon-deny is automatable; authed owner-CRUD is manual UAT unless a service/authed client is added |
| GRGE-03 | `truck_id → {make,model,config}` contract + config-null⇒model granularity | unit (queries helper) / contract | `npm test` | ❌ Wave 0 (`lib/garage/queries.ts` + a small test) |
| GRGE-04 | garage trucks readable as a seller pre-fill source | (same helper as GRGE-03) | `npm test` | ❌ Wave 0 (shared helper) |
| cross-cutting | PII/RLS gate still green (no regression) | integration | `npm test` | ✅ exists (`privacy.contract.test.ts`, `rls.test.ts`) — must stay green |

### Sampling Rate
- **Per task commit:** `npm test` (suite is fast; integration self-skips without secrets).
- **Per wave merge:** `npm test` full suite green.
- **Phase gate:** Full suite green + new `garage.test.ts` passing against Staging before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/integration/garage.test.ts` — anon-deny SELECT + anon INSERT denied (covers GRGE-01 privacy/RLS gate). Mirror `rls.test.ts` exactly (node env, `INTEGRATION_ENABLED ? describe : describe.skip`, `anonClient`).
- [ ] `tests/unit/garage-schema.test.ts` — `truckSchema`: model required, config optional/nullable, nickname ≤40, coercion of string ids.
- [ ] (optional) a small test for `lib/garage/queries.ts` shape (GRGE-03/04 contract).
- [ ] Migration `0004_garage.sql` applied to Staging (via `supabase db push` like 0001/0002, or `supabase db query --linked -f` like 0003 seed) before integration tests run.
- No new framework install — Vitest + the `_supabase.ts` harness already cover the gate.

## Sources

### Primary (HIGH confidence) — in-repo, read directly this session
- `supabase/migrations/0001_foundation_privacy.sql`, `0002_verification.sql`, `0003_fitment_taxonomy.sql` — exact table/column names, RLS posture, `(select auth.uid())` wrapper, `coalesce(...,0)` NULL-arm unique trick, DEFINER-RPC-for-public-scalar pattern.
- `lib/actions/verify.ts`, `app/(auth)/register/actions.ts` — Server Action shape (`getClaims`, shared-zod re-validate, discriminated result, `23505`/error handling).
- `lib/verify/schema.ts`, `lib/validation/auth.ts` — shared client+server Zod convention.
- `app/(app)/verify/phone-step.tsx`, `app/(app)/verify/page.tsx`, `app/(app)/layout.tsx` — RHF + `zodResolver` + `sonner` + `startTransition` + `router.refresh()` flow; force-dynamic auth gate.
- `tests/integration/rls.test.ts`, `tests/integration/fitment.test.ts`, `tests/integration/_supabase.ts` — the RLS/privacy gate pattern to mirror; PII denylist; anon-client harness.
- `app/api/username-available/route.ts` — route-handler read alternative for cascade fetches.
- `.planning/STATE.md` — Phase-3 seed counts (makes=2, models=17, configurations=9, model_configurations=44) + the "configurations is a shared master" decision.
- `package.json` — pinned versions; confirmed NO new dependency needed; `components/` glob confirmed `dialog`/`command`/`popover`/`alert-dialog`/`card` not yet installed.

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` (data-model + RLS patterns) — note its `configurations.model_id` sketch is superseded by the shipped shared-master design.
- `.planning/research/PITFALLS.md` (#1 PII over-fetch, #2 RLS default-deny, #6 caching) — applied to the garage surface.

### Tertiary (LOW confidence)
- None — every claim is grounded in repo files read this session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions read from `package.json`; no new dependency; shadcn components verified absent.
- Architecture: HIGH — every pattern is an in-repo precedent (owner-scoped RLS, shared zod, action+refresh, force-dynamic gate, anon RLS test). The one new element (first owner read+write table) is a direct extension of `profiles_private` + ARCHITECTURE's documented owner-policy intent.
- Pitfalls: HIGH for RLS/NULL-arm/caching/combo-integrity (grounded in the actual migrations); MEDIUM only for the exact post-registration banner placement (UX decision, flagged as Open Question).

**Research date:** 2026-06-04
**Valid until:** ~2026-07-04 (stable stack; revisit only if Phase-3 schema or stack versions change)
