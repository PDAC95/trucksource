# Phase 17: Seller Activation & Transaction Trust Gates - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the just-in-time phone-verification trust gates designed in Phase 2 but never connected.
Verification infra (`/verify` wizard, `is_verified_seller()`, badge) and the selling/contact flows
already exist — this phase connects them:

- **Sell gate** (publish a listing): require `phone_verified_at` AND `marketplace_terms_accepted_at`
  (= `is_verified_seller()`).
- **Contact gate** (contact a seller): require `phone_verified_at` only.
- Parameterize the `/verify` wizard with `?next=` and `?require=phone|seller`.
- Add functional nav entries (Sell, My Listings, Account) + verify prompts.
- Server actions are the trust boundary (`createListing`, `submitContact` re-check flags).

Locked by the approved design doc (`docs/superpowers/specs/2026-06-18-seller-activation-trust-gates-design.md`):
two asymmetric gates, early gate for contact / Publish-time gate for sell, no new verification columns,
anti-abuse confirmed not rebuilt. This phase is connective tissue + gating, not new features.

</domain>

<decisions>
## Implementation Decisions

### Gate interception UX
- **/sell unverified notice:** persistent banner at the top of the form (visible while filling) —
  sets expectations early so the Publish redirect is not a surprise. Tone: "Verify your phone to
  publish. Fill it out — your work is saved."
- **Publish click (unverified):** direct redirect — save draft to sessionStorage, immediately
  redirect to `/verify?require=seller&next=/sell`. No intermediate confirm dialog.
- **Photos at redirect:** warn before leaving. If photos are attached when Publish is hit, the
  redirect path communicates "You'll re-add your photos after verifying," and the rehydrated form
  on return shows a reminder. No silent loss.
- **Contact Seller button (unverified):** looks identical to the verified state; gate is invisible
  until click, which routes to `/verify?require=phone&next=/listings/[id]`. (Anonymous →
  `/login?next=...`, already exists.)

### Return-from-verify behavior
- **Contact gate return:** auto-open the Contact Seller modal on return to `/listings/[id]` (detect
  the contact intent) — zero extra clicks.
- **Sell gate return:** rehydrate the form from sessionStorage; user re-attaches photos and clicks
  Publish manually (auto-publish is impossible since photos must be re-added).
- **Abandonment:** sell draft survives in sessionStorage (rehydrates if they return to /sell in the
  same session). Contact intent is disposable — nothing to save.
- **Confirmation:** brief toast on return ("Phone verified — you're all set"), plus the normal
  publish/contact success feedback after the action completes.

### Navigation entries
- **Desktop:** "Sell" is an always-visible header action (primary conversion); "My Listings" and
  "Account" live in the existing user-menu dropdown.
- **Mobile:** all three (Sell, My Listings, Account) appear as list items in the mobile menu.
- **Labels:** `Sell` → `/sell`, `My Listings` → `/sell/listings`, `Account` → `/account` (plain,
  matches route names).
- **Proactive CTA:** include "Become a verified seller" on `/account` for unverified users (routes
  to `/verify?require=seller`). Scoped to `/account` only (not the public profile) for Phase 17.

### Draft preservation scope
- **Fields saved:** all serializable form state — title, description, price, fitment
  (make/model/config), category, year, condition, special filters, location. Everything except
  `File` objects (photos).
- **TTL / storage:** `sessionStorage`, current session only. No cross-session persistence, no
  stale-draft management.
- **Rehydrate UX:** auto-fill the form silently from the draft with a small notice ("Restored your
  draft — re-attach photos to publish"). No "restore?" prompt.
- **Clear timing:** clear the draft only on a successful publish. It survives verify round-trips and
  in-session navigation until then.

### Claude's Discretion (resolve in research/planning)
- **Defense-in-depth depth:** server-action re-check is mandatory (the trust boundary). Whether to
  ALSO add a DB-level guard (RLS policy or trigger) on `listings` insert and on
  `contact_log`/`message_threads` insert is a planning decision — the project invariant ("RLS is the
  only authorization boundary") strongly favors adding the DB-level guard. Design doc marks depth as
  "decided at planning."
- **Anti-abuse spend-cap threshold:** confirm BotID + rate-limit + geo (+1) + spend cap (Phase 2)
  cover the now-wider buyer+seller audience; revisit/adjust the spend-cap threshold given the larger
  surface. Confirm, don't rebuild.
- Exact banner/notice/toast copy, component styling with current tokens, sessionStorage key shape.

</decisions>

<specifics>
## Specific Ideas

- The sell flow should "preserve effort": all the fitment/taxonomy/year work a seller put in must
  come back after verifying — only photos are sacrificed (and that loss is communicated, not silent).
- The contact flow should feel continuous: verify, return, modal already open.
- Nav styled with current tokens; the v1.1 rebrand (CHRM, Phases 11–15) repositions/restyles these
  entries later — Phase 17 only makes them functional and discoverable.

</specifics>

<deferred>
## Deferred Ideas

- Final header visual design / repositioning — owned by the rebrand (CHRM, Phases 11–15).
- "Become a verified seller" CTA on the user's own public profile (Phase 17 ships it on /account
  only; profile surface can come later).
- Cross-session draft persistence (localStorage + expiry) — not needed for v1.1; revisit if drop-off
  data shows session-only loses too much.
- Payments, ratings/reputation — v2.

</deferred>

---

*Phase: 17-seller-activation-transaction-trust-gates*
*Context gathered: 2026-06-19*
