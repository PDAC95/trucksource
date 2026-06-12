# Phase 7: Search, Feed & Public Profile - Research

**Researched:** 2026-06-10
**Domain:** Postgres FTS + pg_trgm hybrid search, faceted filtering, Next.js 16 App Router URL-state, RLS-safe public surfaces, analytics event logging
**Confidence:** HIGH (schema verified against migrations on disk; FTS/RPC pattern confirmed via Supabase docs through Context7; one P0 schema gap flagged)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Feed & results layout**
- **Grid of cards**, responsive (2–4 columns by width). Not list, not timeline.
- Each card shows: **main photo**, **title + price** (or "Precio a consultar" when no price), **condition badge + State/Province location**, and a **fitment chip (Make+Model)**.
- **Infinite scroll** for loading more (mind back-button restoration and event logging interplay).
- Initial feed (no query) ordered **newest first**.
- **Feed and search are the same screen** — the feed is search with empty filters; typing/filtering updates in-place. Not separate routes.
- Clicking a card opens a **dedicated page `/listing/[id]`** (shareable URL, SEO, feeds into Phase 9 contact flow). Not a modal.
- Empty results → **friendly message + a way to clear/reset filters** (and/or suggest what to adjust). Actionable, no dead-end.
- **Fully open to anonymous visitors** — browse, search, and filter with no gate. The login gate appears only at contact time (Phase 9). (Exception: "fits my truck" naturally needs an account.)

**Search, facets & slang**
- Facet filters (Make, Model, Configuration, Part Category, Material, Condition, Special Filters) live in a **sidebar on desktop, drawer on mobile** ("Filtros" button opens it).
- Hierarchical facets are **dependent/cascading**: choosing Make filters available Models; choosing Model filters Configurations. Options load dynamically; avoids empty combinations.
- Active filters shown as **removable chips + a result count** above the results ("X resultados"). Clicking a chip's "x" removes that filter.
- **All state in the URL** (query params): keyword + facets + fits-my-truck. Shareable, back/forward works, refresh preserves state.
- When a query corrects a typo or expands a synonym/slang term, show a **banner "Mostrando resultados para … (buscaste: …)"** with the option to search the exact term.
- **Live autocomplete / suggestions** while typing (dropdown of suggested terms/parts, including recognized slang). Requires a suggestions endpoint with debounce.
- **Fuzzy fallback**: when there's no exact match but trigram has near matches, show the closest ones with a "Resultados similares" note rather than falling to the empty state.
- Keyword match runs over: **part title, part number, Common Search Terms / slang tags (from Phase 6), and the listing description**.

**"Fits my truck"**
- Activated by a **prominent button/chip ("Fits my truck")**. Multiple trucks → opens a **truck selector**.
- **Anonymous visitors**: control is visible; tapping invites login/registration ("Inicia sesión y agrega tu camión para filtrar por fitment").
- **Logged in but empty garage**: show a **CTA to add a truck** linking straight to add-truck (Phase 4).
- When active, appears as a **removable chip** ("Fits: 2019 Volvo VNL") and **combines (AND)** with keyword and facets.

**Public seller profile (`/u/[username]`)**
- Header shows **`coalesce(display_name, username)` + the seller-type badge prominently** (on top of: username, State/Province, Country, Member Since, live active-listings count).
- Body is a **grid of the seller's active listings**, same card format as the feed.
- Profile listings are a **simple list + sort** (recent / price) — **no full facet panel**.
- **Empty profile**: render header normally + a friendly "sin listings activos" empty state.
- Reachable from: **the listing detail page (clickable username)**, **the feed/result card (clickable username)**, and **direct URL `/u/[username]`** (public, indexable).

**Event logging (SRCH-05 — instrumented from day one)**
- **Search event** captures: **raw term + normalized/expanded term**, **applied facets**, **result count**, and **user (auth.uid if logged in, null if anonymous) + timestamp**.
- **Listing-view event**: counted **when the buyer opens the `/listing/[id]` detail page** (server-side). Feed impressions are NOT logged in v1.

**Result ordering & "active" definition**
- Keyword search results ordered **by relevance (FTS `ts_rank` + trigram closeness) first, recency as tiebreaker**. (Feed with no query stays newest-first.)
- Feed/search shows **only `status=active`, non-expired, non-sold** listings.

### Claude's Discretion
- Exact card spacing, typography, loading skeletons, and responsive breakpoints.
- Suggestions-endpoint debounce timing and result shape.
- Avatar/initials treatment in the profile header (generated initials acceptable if no avatar exists in v1).
- Implementation of infinite-scroll back-button/scroll-restoration.

### Deferred Ideas (OUT OF SCOPE)
- **In-profile search/filters** (mini-search scoped to a single seller's inventory) — future; v1 profile is list + sort only.
- **Feed-impression logging** (distinct from detail-view) — not in v1.
- Comments, saves/bookmarks, "mark sold" — **Phase 8** (not this phase).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRCH-01 | Buyer can browse a feed of active listings | `searchListings` RPC with empty `q`/facets, `status='active'` filter, newest-first. Public-read RLS on `listings` already exists (0006). Same card read shape as profile grid. |
| SRCH-02 | Buyer can search by keyword (part title, part number) | **GAP:** needs a new migration adding a `tsvector` generated column + GIN index to `listings` (does NOT exist today). FTS over `title` + `part_number` (+ description — see GAP below) via `websearch_to_tsquery` + `ts_rank`. |
| SRCH-03 | Filter by Make, Model, Configuration, Part Category, Material, Condition, Special Filters | EXISTS-joins against `listing_fitment` (model/config), `listing_categories`, `conditions`. **GAP:** no `listing_materials` / `listing_special_filters` join tables exist — Material & Special-Filter facets have nothing to filter on. See Open Questions. |
| SRCH-04 | Trucker slang / Common Search Terms, typo- and synonym-tolerant | Slang lives in `search_terms` (citext) + `search_term_targets` (0003) and per-listing in `listing_search_terms` (0012). Trigram on `search_terms.term` for typos; synonym expansion via `search_term_targets`. |
| SRCH-05 | Search & listing-view events logged | `listing_view_events` (0006) + `recordListingView` action ALREADY EXIST and work. **GAP:** no `search_event` table — needs a new migration, insert-only RLS mirroring `listing_view_events`. |
</phase_requirements>

## Summary

Phase 7 is the differentiator's payoff: a single same-screen feed/search surface over the `listings` table, plus the `/u/[username]` profile that already renders (Phase 1) but needs its listings grid wired. The stack is fully decided and already proven in this repo — Next.js 16 App Router Server Components reading through the cookie-bound `@/lib/supabase/server` client, Postgres FTS + `pg_trgm` + `unaccent` (all three extensions enabled since migration 0001), facet filters as EXISTS-joins, and a `searchListings` RPC. The architecture, stack, and pitfalls research already prescribe the exact approach; this phase executes it.

The single most important finding from reading the migrations on disk: **the search infrastructure the architecture assumes does not exist yet.** `listings` has NO `search_vector` tsvector column, NO `description` column (only `damage_notes`), NO FTS GIN index, and there is NO `search_event` table. There is also no `listing_materials` / `listing_special_filters` join table, so two of the seven facets (Material, Special Filters) have no per-listing data to filter against. Phase 7 MUST open with a migration (Wave 0/1) that adds these before any query code is written. Everything downstream (RPC, facets, slang) is otherwise a clean reuse of existing readers (`getModels`/`getConfigs` cascade, `getConditions`/`getPartCategories`, `listMyTrucks`) and existing patterns (`recordListingView`, the enumerated-columns profile read).

The "fits my truck" filter is an AND of the garage truck's `model_id` (and optional `config_id`) against `listing_fitment` — `listMyTrucks()` already returns exactly the shape needed (`modelId`, `configId`). The view-event half of SRCH-05 is DONE (`recordListingView` fires on the existing `/listing/[id]` page); only the search-event half is new.

**Primary recommendation:** Wave 1 = one migration (`0014_search.sql`: tsvector generated column + GIN index, `description` column, `unaccent`-immutable FTS config, `search_events` table with insert-only RLS, the `search_listings` RPC, optional `listing_materials`/`listing_special_filters` joins) + a no-PII contract test + an `EXPLAIN ANALYZE` index-usage gate. Then build the read surface (`lib/search/`), the same-screen feed/search UI with URL-state, the "fits my truck" control, the profile grid, and `recordSearchEvent`.

## Standard Stack

### Core (all already installed — verified in package.json)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js (App Router) | `16.2.x` | Server Components read search results; `searchParams` is the URL-state source of truth | Already the repo's framework; `searchParams` is `await`-ed (async request API) |
| @supabase/ssr | `0.10.x` | `createClient()` cookie-bound server client = RLS boundary | Already wired in `lib/supabase/server.ts`; the ONLY supported SSR auth path |
| @supabase/supabase-js | `2.106.x` | `.rpc('search_listings', …)` + `.from(...).select(...)` | Already installed; `.rpc()` is how the FTS function is called |
| Postgres FTS (`tsvector`/`websearch_to_tsquery`/`ts_rank`, GIN) | built-in (PG 17) | Ranked keyword search over title/part#/description/slang | The decided, Supabase-recommended approach (STACK.md, ARCHITECTURE.md) |
| pg_trgm | enabled in 0001 | Trigram fuzzy/typo matching + autocomplete; `similarity()` already used by `find_similar_own_listings` (0010) | Slang/typo tolerance ("Areodyne", "359 Guys"); GIN trgm index already exists on `listings.title` (0010) |
| unaccent | enabled in 0001 | Accent-insensitive search (bilingual users) | Already enabled; wrap into the FTS config |

### Supporting (already installed)
| Library | Purpose | When to Use |
|---------|---------|-------------|
| shadcn/ui (`radix-ui`, owned components) | Sidebar/drawer (Sheet), Command (autocomplete), Badge (chips), Card (result grid) | Facet drawer, removable filter chips, autocomplete dropdown |
| lucide-react | Icons (Filtros, X on chips, truck icon) | Throughout the search UI |
| sonner (`@/components/ui/sonner`) | Toasts | Already used on the listing page; optional for "Fits my truck → login" prompts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Postgres FTS + pg_trgm | Algolia / Meilisearch / Elasticsearch | **Forbidden in v1** (STACK.md, CLAUDE.md #7): adds a sync pipeline, no payoff at launch scale. |
| One `search_listings` RPC | Inline PostgREST `.or()` / `.textSearch()` chains in app code | RPC keeps the FTS+trigram+facet logic in one place, EXPLAIN-able, and reuses the GIN index reliably. `.textSearch()` can't easily blend trigram fallback + ranking. |
| tsvector generated column | Trigger-maintained tsvector | Generated `stored` column (Supabase-documented pattern) is simpler and can't drift. **Caveat:** generated columns require IMMUTABLE expressions — see Pitfall 2 (unaccent). |

**No new installs needed.** Phase 7 is migrations + lib + UI on the existing stack.

## Architecture Patterns

### Recommended Project Structure (additions only)
```
app/
├── (public)/
│   ├── page.tsx                 # REPLACE the (app) home? No — feed is a PUBLIC route.
│   │                            # CONTEXT: feed+search = same screen, anon-open.
│   │                            # Likely app/(public)/page.tsx (the marketplace feed/search).
│   ├── listings/[id]/page.tsx   # EXISTS — view-event logging already wired (rename to /listing/[id]? see GAP)
│   └── u/[username]/page.tsx    # EXISTS — add the active-listings grid + sort
lib/
├── search/                      # NEW — query builders + readers for the search RPC
│   ├── params.ts                # parse/serialize URL searchParams <-> typed SearchQuery
│   ├── queries.ts               # searchListings() (calls rpc), facetCounts(), autocomplete()
│   └── events.ts                # recordSearchEvent() — mirrors lib/actions/listing-view.ts
components/
├── search/                      # NEW — feed grid, facet sidebar/drawer, chips, autocomplete, fits-my-truck
supabase/migrations/
└── 0014_search.sql              # NEW — tsvector col + GIN, description col, search_events, search_listings RPC, (materials/special join tables)
```

> **Route note (decide in planning):** CONTEXT says the card opens **`/listing/[id]`** (singular) but the page that EXISTS is **`app/(public)/listings/[id]/page.tsx`** (plural). The publish redirect in `createListing` and `recordListingView` already target the plural path. Recommendation: keep the existing **plural `/listings/[id]`** (do NOT churn working routes/redirects/tests); treat CONTEXT's "/listing/[id]" as shorthand. Flag for planner.

### Pattern 1: FTS via a `tsvector` generated column + GIN index + `search_listings` RPC
**What:** Add a `stored` generated `tsvector` to `listings`; index it GIN; expose ranked search through a Postgres function called with `.rpc()`.
**When to use:** All keyword search (SRCH-02, and the text half of SRCH-04).
**Example (verified against Supabase FTS docs via Context7):**
```sql
-- Source: https://supabase.com/docs/guides/database/full-text-search
-- In 0014_search.sql. NOTE: to_tsvector('english', …) IS immutable, so it is legal
-- in a generated column. unaccent() is NOT immutable by default — see Pitfall 2.
alter table public.listings
  add column if not exists description text;        -- GAP: no description column exists today

alter table public.listings
  add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('english',
      coalesce(title,'') || ' ' ||
      coalesce(part_number,'') || ' ' ||
      coalesce(description,'') || ' ' ||
      coalesce(damage_notes,''))
  ) stored;

create index if not exists listings_search_vector_idx
  on public.listings using gin (search_vector);
```
```sql
-- The RPC: blends FTS ranking with facet EXISTS-joins. SECURITY INVOKER so the
-- caller's RLS still applies (listings is public-read; only active rows returned here).
-- Returns ONLY public columns — NEVER seller PII (Pitfall 1). search_path = '' per repo convention.
create or replace function public.search_listings(
  p_q text default null,
  p_make_id bigint default null,
  p_model_id bigint default null,
  p_config_id bigint default null,
  p_category_id bigint default null,
  p_condition_id bigint default null,
  p_fits_model_id bigint default null,   -- "fits my truck"
  p_fits_config_id bigint default null,
  p_limit int default 24,
  p_offset int default 0
) returns table (id bigint, title text, asking_price numeric, /* …public cols only… */ rank real)
language sql stable security invoker set search_path = '' as $$
  select l.id, l.title, l.asking_price, /* … */
    case when p_q is null then 0
         else ts_rank(l.search_vector, websearch_to_tsquery('english', p_q)) end as rank
  from public.listings l
  where l.status = 'active'
    and (p_q is null or l.search_vector @@ websearch_to_tsquery('english', p_q))
    and (p_condition_id is null or l.condition_id = p_condition_id)
    and (p_model_id is null or exists (
          select 1 from public.listing_fitment lf
          where lf.listing_id = l.id and lf.model_id = p_model_id
            and (p_config_id is null or lf.config_id = p_config_id)))
    and (p_category_id is null or exists (
          select 1 from public.listing_categories lc
          where lc.listing_id = l.id and lc.category_id = p_category_id))
    and (p_fits_model_id is null or exists (
          select 1 from public.listing_fitment lf
          where lf.listing_id = l.id and lf.model_id = p_fits_model_id
            and (p_fits_config_id is null or lf.config_id is null or lf.config_id = p_fits_config_id)))
  order by rank desc, l.date_listed desc       -- relevance first, recency tiebreaker (CONTEXT)
  limit p_limit offset p_offset;
$$;
```
```ts
// Called from a Server Component / lib reader through the existing server client.
// Source pattern: Context7 /supabase/supabase (.rpc usage)
const supabase = await createClient();
const { data } = await supabase.rpc("search_listings", { p_q: q, p_make_id: makeId, /* … */ });
```

### Pattern 2: All search state in `searchParams` (Next.js 16 App Router)
**What:** The feed/search page is a Server Component reading `searchParams` (the URL is the single source of truth — CONTEXT). Filter changes do a client-side `router.push`/`replace` with new params; the RSC re-renders with new results.
**When to use:** Feed, keyword, all facets, fits-my-truck (everything except the autocomplete dropdown).
**Example:**
```tsx
// app/(public)/page.tsx — searchParams is a Promise in Next 16 (async request API)
export default async function FeedPage({
  searchParams,
}: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const query = parseSearchParams(sp);     // lib/search/params.ts -> typed SearchQuery
  const results = await searchListings(query);
  // record the search event server-side (best-effort) only when q or facets present
  if (query.hasCriteria) void recordSearchEvent(query, results.length);
  return <FeedGrid query={query} results={results} />;
}
```
- **Cascading facets** (Make→Model→Config) reuse the EXISTING `getModels(makeId)` / `getConfigs(modelId)` readers from `@/lib/garage/cascade` — same readers the garage + listing form already use. Don't duplicate.
- **Anon-safe caching:** the feed touches no PII and no per-user data → it does NOT need `force-dynamic`. BUT see Pitfall 4: the search-event side-effect and the per-request `searchParams` already make it dynamic; if you log the event in the RSC, the page is effectively dynamic. Keep "fits my truck" results out of any shared cache (they're per-user via the garage).

### Pattern 3: Slang/synonym expansion at the app (or SQL) layer, with a transparency banner
**What:** Before/within search, map the raw term against `search_terms` (citext, case-insensitive) and `search_term_targets` (slang → make/model/config). When a slang term resolves or a typo is trigram-corrected, surface the "Mostrando resultados para … (buscaste: …)" banner.
**When to use:** SRCH-04.
**Recommendation:** Do the **expansion in a small reader before the RPC** (or as a CTE inside the RPC) so the app knows what it expanded (to populate the banner). Two complementary mechanisms:
1. **Exact/typo slang match:** `select term from search_terms where term % :raw order by similarity(term,:raw) desc` (pg_trgm `%` operator, uses the existing capability). The matched canonical term feeds both the banner and the FTS query.
2. **Synonym → taxonomy:** join the matched `search_terms.id` through `search_term_targets` to get `make_id/model_id/config_id`, and AND that into the facet filter (so "359 Guys" filters to Peterbilt 359 fitments) AND match `listing_search_terms` directly.
- **Per-listing slang:** also OR an EXISTS against `listing_search_terms`/`search_terms.term % :raw` so a listing tagged with the slang term matches even if its title doesn't contain it.

### Pattern 4: "Fits my truck" = AND the garage truck against `listing_fitment`
**What:** `listMyTrucks()` (existing, owner-RLS) returns `{ modelId, configId, makeName, modelName, year, configName }`. Pass the selected truck's `modelId` (+ `configId`) as `p_fits_model_id`/`p_fits_config_id` into `search_listings`. Three UI states per CONTEXT (anon → login prompt; logged-in empty garage → add-truck CTA; has trucks → selector + removable chip).
**When to use:** GRGE-03 consumption.
**Example:**
```ts
// Server Component branch
const { data: claims } = await supabase.auth.getClaims();
if (!claims) /* render anon login-prompt control */;
else {
  const trucks = await listMyTrucks();          // existing reader
  if (trucks.length === 0) /* render add-truck CTA -> /profile/garage */;
  else /* render truck selector; selected truck.modelId -> searchParams 'fits' */;
}
```
- Config granularity: a listing fit at MODEL level (`config_id IS NULL`) should match ANY config of that model — the RPC's `(p_fits_config_id is null or lf.config_id is null or lf.config_id = p_fits_config_id)` arm handles that. Confirm this matches the garage semantics (`configId null = model granularity`).

### Pattern 5: RLS-safe profile grid (enumerated columns, derived count)
**What:** `/u/[username]` already reads `profiles_public` with ENUMERATED columns and the `active_listing_count` RPC. Add the active-listings grid: a `seller_id`-scoped read of `listings` (public-read table) with `status='active'`, same card shape as the feed, `recent | price` sort from a `sort` searchParam. No facets.
**When to use:** PRIV-01/04, profile body.
**Reuse:** the same card read shape (cover photo via `listingPhotoPublicUrl`, fitment chip) as the feed grid. **Never** `select('*')`; never touch `profiles_private`.

### Anti-Patterns to Avoid
- **`LIKE '%term%'` / `ILIKE` on raw columns** — CLAUDE.md #7 + Pitfall 7 forbid it. Use the GIN-indexed `search_vector @@ websearch_to_tsquery(...)` and pg_trgm `%`/`similarity()`. Verify with `EXPLAIN ANALYZE` (no `Seq Scan`).
- **`select('*')` or `profiles(*)` on the feed/profile reads** — Pitfall 1; ships PII into the payload. Enumerate columns; seller is resolved via `profiles_public` (public columns only), exactly as `getListing` already does.
- **Building the tsvector with a non-IMMUTABLE function in a generated column** — `unaccent()` is not immutable by default; a generated column using it fails to create. See Pitfall 2.
- **Auto-applying slang expansion silently** — CONTEXT requires the transparency banner with a path back to the exact term. Never swap the user's query without telling them.
- **`getSession()` anywhere server-side** — use `getClaims()`/`getUser()` (CLAUDE.md #6). The existing readers already do.
- **Logging search events from a statically-cached render** — they'd undercount. The view-event page is `force-dynamic` for exactly this reason; mirror that posture for the search-event side-effect.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Make→Model→Config cascade options | New cascade readers | `getModels(makeId)` / `getConfigs(modelId)` in `@/lib/garage/cascade` | Already built, tested, public-read; the listing form + garage already use them |
| Condition / Part-Category facet options | New readers | `getConditions()` / `getPartCategories()` in `@/lib/listings/cascade` | Already built (2-level category tree handled) |
| "Fits my truck" garage read | New garage query | `listMyTrucks()` in `@/lib/garage/queries` | Owner-RLS, returns `modelId`/`configId` already |
| Listing-view event logging | New event logger | `recordListingView()` + `listing_view_events` table + `force-dynamic` page | DONE in Phase 5; half of SRCH-05 already ships |
| Search-event logging plumbing | Novel pattern | Clone `lib/actions/listing-view.ts` → `recordSearchEvent` + a `search_events` table mirroring `listing_view_events`' insert-only RLS | Same best-effort, swallow-errors, insert-only, no-PII posture |
| Cover photo URL | New URL builder | `listingPhotoPublicUrl(supabase, path)` in `@/lib/listings/storage` | Already used by `getListing`/`getMyListings` |
| Public name resolution | Inline coalesce | `resolvePublicName(display_name, username)` in `@/lib/seller/badge` | Already used by the profile page |
| FTS ranking / tsquery parsing | Custom tokenizer | `websearch_to_tsquery('english', …)` + `ts_rank` | Postgres-native, handles quotes/AND/OR; Supabase-documented |
| Fuzzy match | Levenshtein in JS | pg_trgm `%` / `similarity()` (already enabled) | Index-backed; `find_similar_own_listings` (0010) already proves the pattern in this repo |

**Key insight:** ~80% of Phase 7's data access is reuse. The genuinely new code is one migration (FTS column + GIN + search_events + RPC), one `lib/search/` module, the search/feed UI, and the profile grid. Resist re-implementing readers that already exist.

## Common Pitfalls

### Pitfall 1: PII leak on the feed / profile grid via over-fetch
**What goes wrong:** A `select('*')` or `profiles(*)` join on the feed card read pulls seller PII into the JSON payload (invisible in the UI, present in DevTools/scrapers).
**Why it happens:** `seller_id` FKs `auth.users`, so it's tempting to join the profile to show the username. The card needs the username — but only from `profiles_public` (enumerated).
**How to avoid:** Resolve the seller via a separate `profiles_public` read with enumerated columns (`username, state_province, country`), exactly as `getListing` already does. The `search_listings` RPC must return ONLY public columns. Add a contract test: anon search/feed/profile response contains zero keys from `PII_KEYS` (the denylist in `tests/integration/_supabase.ts`).
**Warning signs:** any `*` in a feed/profile/RPC select; PII keys in the network payload.

### Pitfall 2: `unaccent()` is not IMMUTABLE → generated tsvector column fails to create
**What goes wrong:** `to_tsvector('english', unaccent(title))` in a `generated always as (...) stored` column raises "generation expression is not immutable." Supabase ships `unaccent` as STABLE, not IMMUTABLE.
**Why it happens:** Generated columns require a strictly immutable expression; `unaccent` depends on a dictionary, so PG marks it STABLE.
**How to avoid (pick one, decide in planning):**
1. **Simplest (recommended for v1):** build the generated column with plain `to_tsvector('english', …)` (immutable) and rely on pg_trgm for the fuzzy/accent-tolerant fallback. English FTS already lowercases/stems; accents are a minor edge for a mostly-English truck-parts catalog.
2. Create an `IMMUTABLE` wrapper: `create function public.immutable_unaccent(text) returns text language sql immutable as $$ select public.unaccent('public.unaccent', $1) $$;` then use it in the generated expression. (Documented Postgres workaround; verify it resolves with `search_path=''`.)
**Warning signs:** migration apply error "generation expression is not immutable"; accented queries return nothing.

### Pitfall 3: `EXPLAIN ANALYZE` shows `Seq Scan` — the GIN index isn't used
**What goes wrong:** The query is written so the planner skips the GIN index (e.g., wrapping `search_vector` in a function, or a query with no extractable trigrams), degrading to a full scan that's slow at volume.
**Why it happens:** Index usage is silent until data grows; small dev tables seq-scan fine.
**How to avoid:** The cross-cutting gate REQUIRES an `EXPLAIN ANALYZE` check confirming `Bitmap Index Scan`/`Index Scan` on `listings_search_vector_idx` (and the trgm index) for a representative query. Make this an explicit verification step. Keep `search_vector @@ websearch_to_tsquery(...)` un-wrapped on the left side.
**Warning signs:** `Seq Scan on listings` in the plan; search latency rising with row count.

### Pitfall 4: Caching serves stale/empty results or skips event logging
**What goes wrong:** If the feed RSC is statically cached, the search-event side-effect won't run on cached renders (undercount), and new listings won't appear.
**Why it happens:** Next.js caching defaults; a page with no dynamic signal can be cached.
**How to avoid:** The feed reads per-request `searchParams` (already a dynamic signal). For the search-event side-effect, mirror the `force-dynamic` posture the `/listings/[id]` page uses for `recordListingView`. Per-user "fits my truck" results must never be in a shared cache (they read `getClaims` + garage). Use `getClaims()`/`getUser()`, never `getSession()`.
**Warning signs:** search counts lower than reality after deploy; a user sees another user's fits-my-truck results.

### Pitfall 5: Two facets have no data to filter on (Material, Special Filters)
**What goes wrong:** SRCH-03 lists Material and Special Filters as facets, but there is NO `listing_materials` / `listing_special_filters` join table — only `listing_fitment` (model/config), `listing_categories`, and `condition_id`. The facet UI would offer filters that match nothing (or 500 on a missing relation).
**Why it happens:** Phase 5/6 deliberately deferred these joins (0012 header explicitly says "listing_special_filters / listing_materials … v1 has no listing join for these dimensions").
**How to avoid:** Decide in planning (see Open Questions): either (a) add the two join tables in `0014_search.sql` AND add their selectors to the listing form (cross-phase scope), or (b) drop Material + Special Filters from the v1 facet set and document it. Do NOT ship a facet that filters nothing.
**Warning signs:** a Material facet that always returns 0 results; PostgREST error on `listing_materials`.

### Pitfall 6: Slang query returns nothing because expansion isn't wired
**What goes wrong:** "359 Guys" doesn't appear in any title, so naive FTS returns empty — the exact failure the slang dictionary exists to prevent (Pitfall 7 in PITFALLS.md).
**Why it happens:** Treating slang as a query-time string problem instead of using `search_terms`/`search_term_targets`/`listing_search_terms`.
**How to avoid:** Pattern 3 — match the raw term against `search_terms` (trigram `%`), expand via `search_term_targets`, AND match `listing_search_terms`. Test: each seeded slang term returns its expected listings. The fuzzy fallback ("Resultados similares") covers near-misses instead of an empty state.

## Code Examples

### Search-event logging (clone of the proven view-event pattern)
```ts
// lib/search/events.ts — mirrors lib/actions/listing-view.ts EXACTLY.
// Source pattern: existing lib/actions/listing-view.ts (this repo)
"use server";
import { createClient } from "@/lib/supabase/server";

export async function recordSearchEvent(input: {
  rawTerm: string | null;
  normalizedTerm: string | null;   // expanded/slang-resolved term
  facets: Record<string, number | null>;
  resultCount: number;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub ?? null;   // NULL = anon searcher
    await supabase.from("search_events").insert({
      raw_term: input.rawTerm,
      normalized_term: input.normalizedTerm,
      facets: input.facets,                        // jsonb
      result_count: input.resultCount,
      searcher_id: userId,
    });
  } catch {
    // best-effort: never block render on a logging failure
  }
}
```

### `search_events` table (insert-only RLS, mirrors `listing_view_events`)
```sql
-- 0014_search.sql. Service-role-readable only (Phase 10 analytics). No IP/PII.
create table public.search_events (
  id bigint generated always as identity primary key,
  raw_term text,
  normalized_term text,
  facets jsonb not null default '{}'::jsonb,
  result_count int not null,
  searcher_id uuid references auth.users(id) on delete set null,  -- NULL = anon
  created_at timestamptz not null default now()
);
alter table public.search_events enable row level security;
-- EXACTLY ONE policy: anyone may INSERT. No select/update/delete → service-role-only read.
create policy "search_events insert" on public.search_events
  for insert to anon, authenticated with check (true);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `searchParams` as a sync object | `searchParams` is a `Promise` you `await` | Next.js 15+ (carried into 16) | All search reads `await searchParams` — the repo already does this for `params` |
| `to_tsquery` (strict syntax) | `websearch_to_tsquery` (Google-like, tolerant) | PG 11+ | Use `websearch_to_tsquery` for user input; handles quotes/OR without throwing |
| Trigger-maintained tsvector | `generated always as (...) stored` column | PG 12+ | Simpler, drift-proof — but requires IMMUTABLE expression (Pitfall 2) |

**Deprecated/outdated:** `getSession()` server-side (use `getClaims`); `LIKE '%x%'` search (use FTS+trgm); external search engines in v1 (forbidden).

## Open Questions

1. **Material & Special-Filter facets have no per-listing data.**
   - What we know: only `listing_fitment` (model/config), `listing_categories`, and `condition_id` exist per listing. 0012 explicitly deferred `listing_materials`/`listing_special_filters`.
   - What's unclear: does v1 ship these two facets (CONTEXT lists all seven) or drop them?
   - Recommendation: For a faithful CONTEXT implementation, add `listing_materials` + `listing_special_filters` join tables in `0014_search.sql` AND wire their selectors into the listing form (a cross-phase add). If scope must be tight, drop Material + Special Filters from the v1 facet set and document the deferral — but flag to the stakeholder, since SRCH-03 names them.

2. **No `description` column on `listings`.**
   - What we know: only `damage_notes` exists; CONTEXT says keyword match runs over "the listing description."
   - What's unclear: is `damage_notes` the intended "description," or is a real `description` field expected (which would also need a listing-form field)?
   - Recommendation: Add a `description` column in `0014_search.sql` and include it in the tsvector; add the field to the listing form (small cross-phase add). If deferred, treat `damage_notes` as the description source for FTS and document it.

3. **Route path: `/listing/[id]` (CONTEXT) vs existing `/listings/[id]` (plural).**
   - What we know: the working page, the `createListing` redirect, and `recordListingView` all use plural `/listings/[id]`.
   - Recommendation: keep plural; do not churn working routes/redirects/tests.

4. **Feed home route placement.**
   - What we know: CONTEXT says feed+search is one anon-open screen. `app/(public)/` is the public route group; `app/(app)/page.tsx` exists (authenticated home).
   - Recommendation: build the feed at `app/(public)/page.tsx` (or `app/(public)/search/page.tsx` aliased to the same component) so it's anon-open. Confirm the root `/` destination in planning.

5. **Autocomplete endpoint shape & debounce (Claude's discretion).**
   - Recommendation: a Route Handler or Server Action `autocomplete(prefix)` returning slang terms (`search_terms.term % :prefix`) + matching titles, debounced client-side (~200ms). Keep it read-only, public, no PII.

## Validation Architecture

> `.planning/config.json` has no `workflow.nyquist_validation` key. This section is included anyway because the Phase 7 cross-cutting gate (ROADMAP.md) explicitly REQUIRES two observable checks: GIN-index usage via `EXPLAIN ANALYZE` and no-PII on public surfaces.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.8` (+ Playwright `@playwright/test` for E2E) |
| Config file | `vitest` (repo root config); integration tests run against Supabase Staging via `.env.local` anon key |
| Quick run command | `npx vitest run tests/unit/<file>` |
| Full suite command | `npm test` (i.e. `vitest run`) |
| E2E command | `npm run test:e2e` |
| Integration helper | `tests/integration/_supabase.ts` (`anonClient()`, `PII_KEYS`, `PUBLIC_PROFILE_KEYS`, `INTEGRATION_ENABLED`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRCH-01 | Anon feed returns only active listings, no PII keys | integration (vs Staging) | `npx vitest run tests/integration/search.test.ts` | ❌ Wave 0 |
| SRCH-02 | Keyword search ranks title/part#/description hits | integration | `npx vitest run tests/integration/search.test.ts` | ❌ Wave 0 |
| SRCH-02 | `EXPLAIN ANALYZE` uses `listings_search_vector_idx` (no Seq Scan) | integration / SQL probe | `npx vitest run tests/integration/search.test.ts -t "index"` | ❌ Wave 0 |
| SRCH-03 | Facet EXISTS-joins filter correctly (model/config/category/condition) | integration | `npx vitest run tests/integration/search.test.ts -t "facet"` | ❌ Wave 0 |
| SRCH-04 | Each seeded slang term resolves to expected listings; typo fuzzy-matches | integration | `npx vitest run tests/integration/search.test.ts -t "slang"` | ❌ Wave 0 |
| SRCH-05 | `search_events` & `listing_view_events` insertable by anon, not select-able | integration (RLS) | `npx vitest run tests/integration/search.test.ts -t "events"` | ❌ Wave 0 (view half covered in `listings.test.ts`) |
| SRCH-05 | `recordSearchEvent` swallows errors / never throws | unit | `npx vitest run tests/unit/search-events.test.ts` | ❌ Wave 0 |
| SRCH-03/params | URL `searchParams` ↔ typed `SearchQuery` round-trips | unit | `npx vitest run tests/unit/search-params.test.ts` | ❌ Wave 0 |
| Privacy gate | Anon feed/search/profile-grid payload has zero `PII_KEYS` | integration (contract) | `npx vitest run tests/integration/search.contract.test.ts` | ❌ Wave 0 (extend `privacy.contract.test.ts` pattern) |
| E2E | Anon browse → search slang → filter facet → open listing | e2e | `npm run test:e2e` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/<touched>` + `npx tsc --noEmit`
- **Per wave merge:** `npm test` (full Vitest suite, ~28 files green today)
- **Phase gate:** full suite green + the `EXPLAIN ANALYZE` index check + the no-PII contract test green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/integration/search.test.ts` — SRCH-01..05 behavior + the `EXPLAIN ANALYZE` GIN-index assertion (live vs Staging)
- [ ] `tests/integration/search.contract.test.ts` — no-PII on feed/search/profile-grid (extend `privacy.contract.test.ts` + `PII_KEYS`)
- [ ] `tests/unit/search-params.test.ts` — URL param parse/serialize round-trip
- [ ] `tests/unit/search-events.test.ts` — `recordSearchEvent` best-effort/no-throw (mocked client)
- [ ] E2E spec for the anon browse→search→filter→detail happy path
- [ ] Migration `0014_search.sql` must be applied to Staging before integration tests run (the repo's `supabase db query --linked -f` flow)

## Sources

### Primary (HIGH confidence)
- On-disk migrations `0001`, `0003`, `0006`, `0008`, `0010`, `0012` — exact table/column/RLS/index names (authoritative for this repo)
- On-disk readers: `lib/listings/queries.ts`, `lib/listings/cascade.ts`, `lib/garage/queries.ts`, `lib/garage/cascade.ts`, `lib/fitment/suggest.ts`, `lib/actions/listing-view.ts`; pages `app/(public)/u/[username]/page.tsx`, `app/(public)/listings/[id]/page.tsx`
- Context7 `/supabase/supabase` — FTS `tsvector` generated column + GIN index, `websearch_to_tsquery` + `ts_rank`, `.rpc()` calling convention (verified current)
- Supabase FTS docs — https://supabase.com/docs/guides/database/full-text-search
- `.planning/research/{ARCHITECTURE,STACK,PITFALLS}.md` — decided stack, search RPC design, PII/RLS/EXIF/caching pitfalls

### Secondary (MEDIUM confidence)
- pg_trgm operator/index behavior — https://www.postgresql.org/docs/current/pgtrgm.html (verified against repo's existing `find_similar_own_listings` usage)
- `unaccent` IMMUTABLE-in-generated-column constraint — Postgres docs + the repo's own note in 0010 that pg_trgm `similarity()` needed schema-qualification under `search_path=''` (same class of gotcha)

### Tertiary (LOW confidence)
- None — all critical claims grounded in on-disk schema or Supabase docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library already installed and proven in-repo; FTS/RPC confirmed via Context7.
- Architecture: HIGH — reuses existing readers/patterns; the new RPC mirrors the documented Supabase FTS approach.
- Pitfalls: HIGH — schema gaps (no tsvector/description/search_events/material+special joins) verified by reading the migrations, not assumed.
- Schema gaps: HIGH — confirmed absent on disk; these are the load-bearing planning inputs.

**Research date:** 2026-06-10
**Valid until:** 2026-07-10 (stable stack; revisit if Next.js or @supabase/ssr minor bumps land)
