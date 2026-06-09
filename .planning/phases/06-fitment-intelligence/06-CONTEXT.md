# Phase 6: Fitment Intelligence - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

When a seller creates a listing, the system suggests applicable fitments (trucks, configurations, categories, and flat-tag dimensions) derived from the part details and pre-fed by the seller's garage. Suggestions are presented for explicit seller confirmation and are **never auto-applied**. Once confirmed, the listing surfaces in every applicable fitment search result and truck category. Tuned for **precision over recall**.

Requirements: FINT-01 (suggest from part details), FINT-02 (seller-confirmed, never auto-applied), FINT-03 (confirmed listing appears in every applicable search path).

This phase adds the **suggestion layer** on top of the existing manual fitment tagging built in Phase 5 (`FitmentMultiSelect` / `listing_fitment` join tables). It does not replace manual tagging — it accelerates it. The rules engine itself (`fitment_rules` table + suggestion service `lib/fitment/suggest.ts`) is implementation; downstream agents own its design per ARCHITECTURE.md.

**Out of scope (other phases):** the search surfaces that consume confirmed fitments (Phase 7), the admin UI to author/extend `fitment_rules` (Phase 10).
</domain>

<decisions>
## Implementation Decisions

### Trigger & timing
- **Real-time suggestions.** As soon as the seller makes a relevant selection (primarily a part category), suggestions appear automatically below — no extra click.
- **Primary trigger = Part Category.** Choosing a part category (e.g. "Bumpers") drives the rule-based suggestions of typically-associated configs / search terms / categories. (Part-number patterns and free-text title parsing are NOT triggers in v1 — see Deferred.)
- **Preserve confirmed selections on re-trigger.** If the seller changes a selection after already confirming some suggestions, what they accepted stays; only new suggestions are added. A seller's decision is never overwritten.
- **Subtle loading state.** Show a small skeleton/spinner in the suggestions zone while computing — honest if the `fitment_rules` query has any latency.

### Presentation & confirmation
- **Grouped chips.** Suggestions render as clickable chips grouped by dimension / source (e.g. "From your garage", "Common for Bumpers"). Compact and scannable.
- **One-by-one + "Add all".** Seller clicks individual chips to accept, with an "Add all suggested" shortcut. Balances speed with control.
- **Accepted suggestions migrate to the existing tag zone.** On accept, the chip leaves the suggestions area and appears in the existing confirmed-fitment list (the Phase 5 `FitmentMultiSelect` area), each with its remove (X). Single source of truth for confirmed fitment.
- **Dismiss individual suggestions.** Each suggestion has a small X to remove it from the suggested list for this session, keeping the list clean. (Dismissal is session-only — no persisted "never suggest this" in v1.)
- **"Never auto-applied" is a hard guarantee.** Nothing enters the confirmed-fitment list without an explicit seller click. This is FINT-02 and is a correctness requirement, not a preference.

### Pre-fill from garage
- **Garage trucks appear as suggestions, NOT pre-applied.** The seller's garage trucks (Make→Model→Config) surface as highlighted suggestions the seller accepts with one click. Respects "never auto-applied."
- **Visually distinguished as "From your garage."** Garage-sourced suggestions get their own group/badge so the seller knows they came from THEIR trucks (builds trust, signals relevance).
- **No garage → silent.** If the seller has no garage trucks, simply omit the "From your garage" group; rule-based suggestions work normally. No nudge in v1.
- **Garage suggestions expand to flat dimensions.** A garage truck (e.g. Peterbilt 359 Extended Hood) also suggests its typical search terms / special filters ("359 Guys", "Long Hood"), not just the exact Make/Model/Config — broader coverage from a known-relevant truck. (Research to confirm how `fitment_rules` models this expansion.)

### Precision & states
- **Few and precise (precision > recall).** Only suggestions backed by a clear, direct rule are shown. When in doubt, don't show it. Prioritize not overwhelming the seller or polluting search over catching every possible fitment. No ranking/score UI surfaced in v1.
- **Explainability via group headers.** The "why" is communicated by the group title ("From your garage", "Common for Bumpers") — no per-chip tooltips needed.
- **Empty state = brief message.** When no rule applies (category without mappings, no garage): show a short line like "No automatic suggestions — add fitments manually below." Don't hide the section silently; direct the seller to the manual path.

### Claude's Discretion
- Exact chip styling, group spacing, and how the suggestions zone integrates visually with the existing `FitmentMultiSelect` section in `components/listings/listing-form.tsx`.
- Whether the suggestion service is a Server Action vs Edge Function (ARCHITECTURE.md says Server Action `lib/fitment/suggest.ts`, promotable later).
- The exact shape of `fitment_rules` (trigger_type, etc.) and how garage-truck → flat-dimension expansion is encoded in data.
- Loading/skeleton implementation details.
- Accessibility specifics (keyboard nav for chips, ARIA on the suggestions region) — apply standard good practice.
</decisions>

<specifics>
## Specific Ideas

- ARCHITECTURE.md already sketches the intended UX: `'also tag: Aerodyne, Long Hood Guys?'` — grouped, one-click-accept suggestions. Honor that direction.
- The suggestion layer wraps the EXISTING Phase 5 tagging UI (`FitmentMultiSelect`, `FitmentSelection[]` state in `listing-form.tsx`). Accepted suggestions must flow into that same `fitment` state so the existing submit/validation path (barnyard-or-≥1-fitment refine) is unchanged.
- Group titles double as the explainability layer — "From your garage" vs "Common for [Category]".
- This must also work in **edit mode** (the form is reused for create + edit per `listing-form.tsx`); confirm suggestion behavior on edit during planning (likely: same suggestions, already-confirmed fitments not re-suggested).
</specifics>

<deferred>
## Deferred Ideas

- **Part-number-pattern triggers** — `fitment_rules` supports a `part_number_pattern` trigger type, but v1 won't drive suggestions from part numbers (data may not exist). Future enhancement.
- **Free-text / title keyword parsing** as a suggestion trigger — more recall, less precision; conflicts with the precision-first goal. Future phase.
- **Acceptance/dismissal telemetry** to tune rules — NOT in Phase 6. Note: invariant #8 (event logging ships *with* the feature, not the dashboard) should be re-checked in research — if surfacing/search-event logging touches this flow it may need to be considered, but suggestion accept/reject analytics specifically is deferred.
- **Persisted "never suggest this" dismissals** — v1 dismissal is session-only. Persisting seller preferences is future work.
- **Admin authoring UI for `fitment_rules`** — Phase 10 (Admin Ops). Phase 6 assumes rules exist as seed/data; it does not build the editor.
- **Nudge to populate garage** when empty — considered and rejected for v1 (keep the create-listing flow frictionless).
- **Ranking / confidence score surfaced to the seller** — not shown in v1; precision-first means low-confidence suggestions simply aren't displayed.
</deferred>

---

*Phase: 06-fitment-intelligence*
*Context gathered: 2026-06-09*
