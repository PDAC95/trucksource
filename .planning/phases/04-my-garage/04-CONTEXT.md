# Phase 4: My Garage - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

A user can save one or more of their trucks (Make → Model → Configuration, referencing the Phase 3 fitment library) to their profile — optionally, never forced at registration. They can view, edit, and remove those trucks. The phase exposes two consumption hooks for later phases:
- **"Fits my truck" filter** — a `truck_id`-based filtering contract consumed by Phase 7 (search/feed).
- **Seller fitment pre-fill** — garage trucks accelerate Fitment Intelligence suggestions, consumed by Phase 6.

`garage_trucks` is owner-scoped (a user reads/writes only their own garage via RLS, `auth.uid() = user_id`). Garage data is **never** exposed on any public surface. Building the search filter UI and the seller pre-fill logic themselves belong to Phases 7 and 6 — this phase only defines and exposes the contracts.

</domain>

<decisions>
## Implementation Decisions

### Truck selector (add flow)
- **Dependent cascade**: ordered selection Make → Model → Configuration. Selecting a Make loads only that Make's Models; selecting a Model loads only its Configs. No invalid combinations possible.
- **Searchable levels when lists are long**: Make is likely short (plain dropdown fine); Model/Config may be long → make those filter-as-you-type. Decide per-level by actual list length.
- **Required depth: Make + Model minimum.** Configuration is optional. If no Config is chosen, the truck is stored at Model granularity and the "fits my truck" filter operates at Model level for that truck.
- **Library-only, no free text**: a user can only save Make/Model/Config combinations that exist in the Phase 3 fitment library. If their truck isn't found, **block the save and surface a "Missing your truck? Let us know" report/feedback affordance.** Keeps fitment data clean and the filter joins reliable.
- **No exact duplicates**: the same (Make, Model, Config) combination cannot be saved twice by one user. (Nickname distinguishes genuinely-similar trucks if needed.)
- **Add UI = modal/dialog**: an "Add truck" button opens a modal containing the cascade; the user never leaves the garage view.
- **Success feedback**: brief success toast + the new truck appears immediately in the garage list.

### Garage view (list + manage)
- **Card-based layout** — one card per saved truck, room for nickname, full fitment string, and actions.
- **Per-truck info**: nickname displayed prominently when present; the full `Make Model Config` combination shown beneath. When nickname is empty, the fitment combination is the primary label.
- **Edit = same cascade modal, pre-filled** with the truck's current selections.
- **Delete requires confirmation** ("Delete this truck?") to prevent accidental removal.
- **Soft cap ~20 trucks** per user — generous for a personal fleet, protects the table from abuse/noise. (Exact number is Claude's discretion if 20 proves awkward.)

### Nickname / label
- **Optional nickname per truck** (e.g. "Mi 379 rojo"). Empty nickname → fall back to the fitment combination as the label.
- **Validation**: optional, **max length ~40 characters**, no special requirements.
- **"Fits my truck" truck selection = explicit selector at filter time.** No persistent default/active truck. When a user has multiple trucks, search/feed presents a chooser among their trucks; the Phase 7 hook receives a single `truck_id`. (This keeps garage state minimal — no default flag to manage.)

### Empty state & entry
- **Location: section of the user profile** (e.g. a "My Garage" tab / `/profile/garage`) — it is private account data and belongs in the user's own area, not a public top-level surface.
- **Post-registration: soft, skippable invitation.** After registering, an optional banner/step ("Add your truck to see parts that fit") that is clearly skippable and never blocks. Respects the roadmap's "optional, never forced at registration" rule.
- **Empty state = explanatory + CTA**: explains the value ("Save your trucks to filter parts that fit") plus an "Add truck" button — turns the empty view into an action.
- **"Fits my truck" with zero trucks (Phase 7 contract)**: the filter control is still discoverable, but activating it with no saved trucks invites the user to add one first (link to the garage). Defined here as the contract; the actual search UI is built in Phase 7.

### Claude's Discretion
- Exact soft-cap number if 20 is awkward.
- Per-level decision of which cascade dropdowns get search vs. plain dropdown (driven by real Phase 3 list lengths).
- Card visual design, spacing, iconography.
- Toast styling and exact copy.
- Loading/skeleton states while cascade levels fetch.

</decisions>

<specifics>
## Specific Ideas

- Nickname example given by user: "Mi 379 rojo" — supports the fleet-with-similar-trucks distinguishing use case.
- The garage is explicitly framed as a *convenience that powers filtering and seller speed*, not a required profile step — the UX should never make a user feel they must fill it in.

</specifics>

<deferred>
## Deferred Ideas

- Building the actual "fits my truck" search/feed filter UI — **Phase 7** (this phase only exposes the `truck_id` filtering contract).
- Seller fitment pre-fill suggestion logic — **Phase 6** (this phase only makes garage trucks available as a pre-fill source).
- Free-text / user-submitted truck Make/Model/Config entries — out of scope for v1 (library-only). The "Missing your truck? Let us know" feedback could feed a future admin-curation flow.

</deferred>

---

*Phase: 04-my-garage*
*Context gathered: 2026-06-04*
