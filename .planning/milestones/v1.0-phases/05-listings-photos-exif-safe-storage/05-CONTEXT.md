# Phase 5: Listings, Photos & EXIF-Safe Storage - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

A seller can **create and edit** a listing with the full public field set (Part Title, Part Number, Make, Model, Fitment, Condition, Material, Asking Price, Damage Notes, Date Listed), tag it against the Phase 3 fitment library (many-to-many), upload multiple photos that are **stripped of all metadata server-side** (EXIF/GPS), select a **per-listing shipping option**, and have an **account-level contact preference** respected. This phase also establishes the server-side EXIF/GPS-strip guarantee and instruments listing-view event logging from day one.

**Explicitly out of scope (other phases):**
- Fitment *suggestions* / intelligence → Phase 6 (this phase is manual tagging only; garage pre-fill here is a manual shortcut, not auto-suggestion)
- Search, feed, faceted filtering → Phase 7
- Mark-as-sold → Phase 8 (covered by LIST-06, which is mapped to Phase 8)
- Contact form → private chat → Phase 9

**Requirements covered:** LIST-01, LIST-02, LIST-03, LIST-04, LIST-05, LIST-07

</domain>

<decisions>
## Implementation Decisions

### Form flow
- **Single long page organized in sections** (Part data → Fitment → Photos → Shipping), not a multi-step wizard or accordion. Lowest friction, seller sees full scope at once.
- **No draft state in v1.** The listing is created only on a valid publish; leaving early discards. No `draft` status, no autosave. (Keeps DB + logic simple; roadmap asks only for create/edit.)
- **Edit reuses the same form component, pre-filled** with current values. One component for create + edit — no separate edit view.
- **On successful publish, redirect to the published listing's public page** (the buyer-facing view) with a success confirmation.

### Photo upload
- **Up to 8 photos**, **10MB each**, accepted formats **JPG / PNG / WebP**. `sharp` re-encodes everything to a consistent format. HEIC (iPhone) is rejected or converted — planner/researcher to confirm handling.
- **Drag-drop reordering; the first photo is automatically the cover/thumbnail.** No separate "set cover" button.
- **Immediate local preview + per-photo spinner/overlay** while the server processes (uploads + strips EXIF). Per-photo feedback, not a single global progress bar.
- **Upload + EXIF-strip happens at selection time**, not at publish. Each photo is sent and processed the moment it's selected; publish only confirms. → **Open implementation question for research/planning:** where do pre-publish photos live before a listing row exists? (e.g. per-user staging path + reconcile on create, or pre-create the listing in a pending state). The EXIF-strip + no-GPS regression test gate applies regardless of where this lands.

### Fitment tagging
- **Cascading dependent selects** for Make → Model → Config — **reuse the My Garage (Phase 4) cascade pattern**. Familiar, guided.
- **Multi-fit: a listing can apply to multiple Make/Model/Config combinations.** Seller adds combinations to a list. This is what makes the Phase 3 many-to-many design pay off — do not collapse to single-fit.
- **Required to publish: Make + Model + Condition.** Optional: Configuration, Part Category, Material, Special Filters. Date Listed is automatic.
- **The Barnyard = an explicit toggle** ("doesn't fit standard fitment") that relaxes/hides the fitment selects and marks the listing as Barnyard. Deliberate, avoids mis-tagged listings.

### Listing fields & states
- **Required: Part Title + Asking Price.** Optional: Part Number (not always known for used/generic parts), Damage Notes (only if damaged). Date Listed is automatic.
- **Asking Price: required numeric value in USD** (North-American market). Validation: > 0, currency format. No multi-currency in v1.
- **Contact preference is account-level**, configured once in account/profile settings, **default = Marketplace Messaging Only** (most private). The listing form only *displays* it as reference; it is not edited from the listing form. (LIST-07 is account-scoped.)
- **Only `active` status in v1** — a listing is `active` on publish. But design the `status` column as an **extensible enum** (`active | sold | ...`) so Phase 8 (mark-as-sold) doesn't require a breaking migration.

### Claude's Discretion
- Exact section visual design, spacing, typography of the form.
- Loading skeleton / empty states beyond what's specified.
- HEIC handling specifics (reject vs server-convert) — confirm during research.
- Pre-publish photo storage strategy (staging path vs pending listing) — confirm during research; both satisfy the EXIF gate.
- Exact shape of the listing-view event log row (instrument now; consumed in P10 analytics).

</decisions>

<specifics>
## Specific Ideas

- Reuse the **Phase 4 My Garage Make→Model→Config cascade** for the fitment tagging UI — same dependent-select pattern, consistency across the app.
- Photo UX should feel like a standard marketplace uploader: drag-drop, first-photo-is-cover, immediate preview with per-photo processing feedback.
- Contact preference default is the **most private** option (Marketplace Messaging Only), consistent with the product's privacy-first posture.

</specifics>

<deferred>
## Deferred Ideas

- **Fitment suggestions / "smart" pre-fill** — Phase 6 (Fitment Intelligence). Here, only a manual garage shortcut is in scope, if any.
- **Mark-as-sold** — Phase 8 (LIST-06).
- **Pause/hide a listing** (`inactive`/`hidden` status + toggle) — not requested in P5; revisit in a later milestone if needed.
- **"Make an offer / OBO" pricing flag** — not in P5 scope; backlog if sellers request it.
- **Search / feed discovery of listings** — Phase 7.

</deferred>

---

*Phase: 05-listings-photos-exif-safe-storage*
*Context gathered: 2026-06-05*
