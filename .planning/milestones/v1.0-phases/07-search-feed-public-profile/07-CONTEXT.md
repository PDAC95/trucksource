# Phase 7: Search, Feed & Public Profile - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

A buyer discovers parts — the differentiator's payoff. They browse a feed of active listings without logging in, search by keyword + facets + trucker slang with typo/synonym tolerance, filter to "fits my truck" from their garage, and view a seller's public profile. Search and listing-view events are logged from day one so analytics (Phase 10) can later report most-searched and most-viewed items.

Requirements: SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05.

In scope: feed, keyword search, faceted filtering, slang/typo tolerance, "fits my truck" filter (consumes Phase 4 garage hook), public seller profile `/u/[username]`, search-event + listing-view-event logging.

Out of scope (fixed by architecture, not re-litigated here): FTS + `pg_trgm` (+ `unaccent`) with GIN indexes, `search_synonyms` table for slang, privacy-by-table-split + RLS default-deny, PII never on public surfaces. Comments / saves / "mark sold" are Phase 8.
</domain>

<decisions>
## Implementation Decisions

### Feed & results layout
- **Grid of cards**, responsive (2–4 columns by width). Not list, not timeline.
- Each card shows: **main photo**, **title + price** (or "Precio a consultar" when no price), **condition badge + State/Province location**, and a **fitment chip (Make+Model)**.
- **Infinite scroll** for loading more (mind back-button restoration and event logging interplay).
- Initial feed (no query) ordered **newest first**.
- **Feed and search are the same screen** — the feed is search with empty filters; typing/filtering updates in-place. Not separate routes.
- Clicking a card opens a **dedicated page `/listing/[id]`** (shareable URL, SEO, feeds into Phase 9 contact flow). Not a modal.
- Empty results → **friendly message + a way to clear/reset filters** (and/or suggest what to adjust). Actionable, no dead-end.
- **Fully open to anonymous visitors** — browse, search, and filter with no gate. The login gate appears only at contact time (Phase 9). (Exception: "fits my truck" naturally needs an account — see below.)

### Search, facets & slang
- Facet filters (Make, Model, Configuration, Part Category, Material, Condition, Special Filters) live in a **sidebar on desktop, drawer on mobile** ("Filtros" button opens it).
- Hierarchical facets are **dependent/cascading**: choosing Make filters available Models; choosing Model filters Configurations. Options load dynamically; avoids empty combinations.
- Active filters shown as **removable chips + a result count** above the results ("X resultados"). Clicking a chip's "x" removes that filter.
- **All state in the URL** (query params): keyword + facets + fits-my-truck. Shareable, back/forward works, refresh preserves state. Coherent with same-screen + infinite scroll.
- When a query corrects a typo or expands a synonym/slang term, show a **banner "Mostrando resultados para … (buscaste: …)"** with the option to search the exact term. Transparent; teaches the matching vocabulary.
- **Live autocomplete / suggestions** while typing (dropdown of suggested terms/parts, including recognized slang). Requires a suggestions endpoint with debounce.
- **Fuzzy fallback**: when there's no exact match but trigram has near matches, show the closest ones with a "Resultados similares" note rather than falling to the empty state — upholds the tolerance promise.
- Keyword match runs over: **part title, part number, Common Search Terms / slang tags (from Phase 6), and the listing description**.

### "Fits my truck"
- Activated by a **prominent button/chip ("Fits my truck")** — the star differentiator. If the buyer has multiple trucks in their garage, it opens a **truck selector**.
- **Anonymous visitors**: the control is visible; tapping it invites login/registration ("Inicia sesión y agrega tu camión para filtrar por fitment"). Promotes signup by showing the value — not hidden.
- **Logged in but empty garage**: show a **CTA to add a truck** ("Aún no tienes camiones. Agrega uno a tu garage para filtrar") linking straight to add-truck (Phase 4).
- When active, it appears as a **removable chip** ("Fits: 2019 Volvo VNL") alongside the other filters and **combines (AND)** with keyword and facets — consistent with the rest of the active-filter model.

### Public seller profile (`/u/[username]`)
- Header shows **`coalesce(display_name, username)` + the seller-type badge prominently** (on top of the roadmap-fixed minimum: username, State/Province, Country, Member Since, live active-listings count).
- Body is a **grid of the seller's active listings**, same card format as the feed.
- Profile listings are a **simple list + sort** (recent / price) — **no full facet panel** (sellers rarely have enough inventory in v1 to justify it).
- **Empty profile** (no active listings): render the header normally + a friendly "sin listings activos" empty state in the listings zone. Profile stays valid and shareable.
- Reachable from: **the listing detail page (clickable username)**, **the feed/result card (clickable username)**, and **direct URL `/u/[username]`** (public, indexable).

### Event logging (SRCH-05 — instrumented from day one)
- **Search event** captures: **raw term + normalized/expanded term**, **applied facets**, **result count**, and **user (auth.uid if logged in, null if anonymous) + timestamp**. Enables most-searched reporting and detection of missing slang / unsatisfied demand (zero-result searches).
- **Listing-view event**: counted **when the buyer opens the `/listing/[id]` detail page** (server-side). Clear signal of real interest; avoids inflating with feed impressions. (Feed impressions are NOT logged in v1.)

### Result ordering & "active" definition
- Keyword search results ordered **by relevance (FTS `ts_rank` + trigram closeness) first, recency as tiebreaker**. (Feed with no query stays newest-first.)
- Feed/search shows **only `status=active`, non-expired, non-sold** listings (excludes drafts, expired per LIST-09, and sold). Enforced via RLS/filter so the public sees only current inventory.

### Claude's Discretion
- Exact card spacing, typography, loading skeletons, and responsive breakpoints.
- Suggestions-endpoint debounce timing and result shape.
- Avatar/initials treatment in the profile header (not a hard requirement; generated initials acceptable if no avatar exists in v1).
- Implementation of infinite-scroll back-button/scroll-restoration.
</decisions>

<specifics>
## Specific Ideas

- "Fits my truck" should feel like the **star feature** — prominent, not buried as just-another-facet.
- Slang transparency matters: the "Mostrando resultados para…" banner should let users learn the supported vocabulary, with a path back to the exact term.
- The public profile is centered on the **listings grid** — that's what the buyer came to see; everything else is a light header.
</specifics>

<deferred>
## Deferred Ideas

- **In-profile search/filters** (mini-search scoped to a single seller's inventory) — future enhancement; v1 profile is list + sort only.
- **Feed-impression logging** (distinct from detail-view) — not in v1; revisit if analytics needs impression-level data.
- Comments, saves/bookmarks, "mark sold" — **Phase 8** (not this phase).
</deferred>

---

*Phase: 07-search-feed-public-profile*
*Context gathered: 2026-06-10*
