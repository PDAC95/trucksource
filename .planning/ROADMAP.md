# Roadmap: OG Truck Parts (formerly Take-Off Parts) — Truck Marketplace

## Milestones

- ✅ **v1.0 MVP** — Phases 0–10 (shipped 2026-06-12) — [archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 OG Rebrand & UI Redesign** — Phases 11–15 (in progress)

## Overview (v1.1)

v1.1 rebrands the shipped marketplace to **OG Truck Parts** and applies the neon truck-stop visual identity across every surface — functionality unchanged except two scoped UAT fixes. The order is strict: the token/font/rename foundation lands atomically first (one file edit re-skins ~80% of the app), then the 18 shadcn primitives and shared chrome propagate the theme everywhere, then the public showcase surfaces (including the signature browse-as-signage grid), then the auth/app/admin surface passes, and finally the out-of-repo rebrand sweep, the two functional fixes, the accessibility audit, and the full-suite + 24-step UAT convergence gate.

## Phases

**Phase Numbering:** continuous across milestones — v1.0 ended at Phase 10, v1.1 starts at Phase 11.

<details>
<summary>✅ v1.0 MVP (Phases 0–10) — SHIPPED 2026-06-12</summary>

- [x] Phase 0: Setup & Scaffolding (1/1 plan) — completed 2026-06-01
- [x] Phase 0.1: Wiring & Tooling (INSERTED, 1/1 plan) — completed 2026-06-01
- [x] Phase 1: Foundation & Privacy Model (5/5 plans) — completed 2026-06-03
- [x] Phase 2: Verified Seller & Phone OTP (5/5 plans) — completed 2026-06-04
- [x] Phase 3: Fitment Taxonomy & Slang Library (3/3 plans) — completed 2026-06-04
- [x] Phase 4: My Garage (3/3 plans) — completed 2026-06-04
- [x] Phase 5: Listings, Photos & EXIF-Safe Storage (5/5 plans) — completed 2026-06-08
- [x] Phase 5.1: Stakeholder Trust & Lifecycle (INSERTED, 5/5 plans) — completed 2026-06-09
- [x] Phase 6: Fitment Intelligence (4/4 plans) — completed 2026-06-09
- [x] Phase 7: Search, Feed & Public Profile (4/4 plans) — completed 2026-06-10
- [x] Phase 8: Social Layer (6/6 plans) — completed 2026-06-10
- [x] Phase 9: Contact → Private Chat (7/7 plans) — completed 2026-06-11
- [x] Phase 10: Admin Operations & Analytics (10/10 plans) — completed 2026-06-12

Full phase details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

### 🚧 v1.1 OG Rebrand & UI Redesign

- [ ] **Phase 11: Brand Foundation & Token System** - OG Truck Parts name/assets/metadata everywhere + dark-only neon token and typography system
- [ ] **Phase 12: Shared Chrome** - 18 shadcn primitives restyled + redesigned header (with sell entry), footer, and branded error/loading surfaces
- [ ] **Phase 13: Public Surfaces & Signage Browse** - Feed, listing cards/detail, public profile reskinned + Make/Model/Category as neon sign grids
- [ ] **Phase 14: Auth, App & Admin Surface Passes** - Auth panels, seller steppers, logged-in surfaces, messaging, and admin Workbench tier — mobile/desktop parity
- [ ] **Phase 15: Rebrand Sweep, Fixes & Final QA** - Email/dashboard rebrand with evidence, freeze-notice + vitest-* fixes, WCAG AA audit, e2e green, 24-step UAT rerun

## Phase Details

### Phase 11: Brand Foundation & Token System
**Goal**: The app carries the OG Truck Parts identity at its base — name, logo/icon/OG assets, route metadata, and a dark-only neon token + typography system — before any surface is judged visually.
**Depends on**: Phase 10 (v1.0 complete)
**Requirements**: BRND-01, BRND-02, BRND-03, THEM-01, THEM-02, THEM-03, THEM-04
**Success Criteria** (what must be TRUE):
  1. User sees "OG Truck Parts" on every visible surface — UI copy, auth pages, suspended screen, header wordmark — with zero remaining "Take-Off Parts" or "Create Next App" strings, and e2e brand-string assertions updated in the same commits so the suite stays usable as a behavior oracle
  2. Every route's browser tab and link share preview shows correct OG Truck Parts metadata (title template, description, OpenGraph image) and the stakeholder favicon/icon set
  3. The app renders dark-only end to end: night-navy base, `color-scheme: dark` (CSS + meta) so native inputs/scrollbars/autofill render dark, light theme removed, no white flash on load
  4. Headings render in the condensed display face and body text in the readable body font via `next/font` (the broken `--font-sans` self-reference fixed, no layout shift on headings)
  5. Neon glow exists only as reusable tokens with dual decorative/AA-text variants per neon color (no hardcoded hex outside `globals.css`, grep-gated), and all glow/motion is static under `prefers-reduced-motion`
**Plans**: 4 plans
- [ ] 11-01-PLAN.md — Dark-only neon token system + glow tokens + contrast gate (THEM-01, THEM-03, THEM-04)
- [ ] 11-02-PLAN.md — next/font typography + root metadata/viewport + remove next-themes (THEM-02, THEM-04, BRND-03)
- [ ] 11-03-PLAN.md — Brand-string sweep + e2e assertion updates (atomic) (BRND-01)
- [ ] 11-04-PLAN.md — Logo/favicon/OG/manifest + header logo render (asset-contingent) (BRND-02, BRND-03)

### Phase 12: Shared Chrome
**Goal**: Every screen inherits the neon system automatically through restyled primitives and shared chrome — header, footer, and global error/loading surfaces set the visual quality bar.
**Depends on**: Phase 11
**Requirements**: CHRM-01, CHRM-02, CHRM-03, CHRM-04, CHRM-05
**Success Criteria** (what must be TRUE):
  1. Buttons, inputs, cards, badges, dialogs, selects, sheets, skeletons, toasts, and charts render in the navy/neon system on every page without per-page styling — all 18 owned shadcn primitives restyled in place, focus rings preserved
  2. User sees the redesigned persistent header on every page: logo, prominent search bar, labeled icon nav (search, sell, messages with unread badge, saved, account) — and no cart, phone, or alerts icons anywhere
  3. User can start a listing from the header sell entry point on every page (v1.0 UAT gap closed)
  4. Public pages show a branded footer with the wordmark and internal links (terms, key routes)
  5. Unknown routes, route errors, and loading states show branded dark surfaces (`not-found.tsx`, route-group `error.tsx`, themed `loading.tsx`) — never a white flash or unstyled error
**Plans**: TBD

### Phase 13: Public Surfaces & Signage Browse
**Goal**: The buyer-facing showcase surfaces wear the full brand, and Make → Model → Category browse becomes the signature neon-signage experience — over existing queries and URL params, no new routes or data.
**Depends on**: Phase 12
**Requirements**: SURF-01, SURF-02
**Success Criteria** (what must be TRUE):
  1. User browsing feed/search sees neon-themed facets, chips, and slang banner, and listing cards with photo, specs row, red price, and verification badges — with no animated glow on repeated card grids (static glow only)
  2. User browses Make → Model → Category as neon sign grids that filter via the existing URL params, legible at 360px with real taxonomy strings (e.g. "Western Star 4900EX")
  3. Listing detail renders fully themed (gallery, comments, contact entry) with the contact-form-before-chat behavior unchanged
  4. Public profile renders themed and remains PII-free — no seller name, phone, email, or address surfaces with the new skin
**Plans**: TBD

### Phase 14: Auth, App & Admin Surface Passes
**Goal**: Every authenticated, seller, messaging, and admin surface wears the theme — visual-only, flows and realtime logic untouched — with equal mobile and desktop care.
**Depends on**: Phase 13
**Requirements**: SURF-03, SURF-04, SURF-05, SURF-06, SURF-07, SURF-08
**Success Criteria** (what must be TRUE):
  1. User completes every auth flow (login, register, forgot/reset, check-email, error) on dark navy panels with neon borders — same fields, same validation, same redirects
  2. Seller creates/edits listings through numbered visual steppers and manages my-listings on the new skin, with zero flow or validation changes
  3. Logged-in surfaces (account, verify OTP, saved, garage, suspended screen) render fully themed
  4. User sends and receives messages on the reskinned thread list/view and contact-form modal, and messages still arrive in realtime without refresh (subscription logic untouched)
  5. Admin works in a quieter Workbench tier (dark, density-first, no signage flair, chart palette recalibrated for navy) — and every surface reskinned in this milestone works equally well at mobile and desktop widths (header collapse, facet sheet, steppers on small screens)
**Plans**: TBD

### Phase 15: Rebrand Sweep, Fixes & Final QA
**Goal**: The rebrand completes on every out-of-app surface (emails, dashboards), the two scoped functional fixes land as isolated commits, and the whole experience is verified accessible, regression-free, and stakeholder-approved.
**Depends on**: Phase 14
**Requirements**: BRND-04, BRND-05, FIX-01, FIX-02, A11Y-01, A11Y-02, A11Y-03, QA-01, QA-02
**Success Criteria** (what must be TRUE):
  1. Every transactional email arrives under the OG Truck Parts name with no stale brand strings or dead URLs — all 4 in-repo senders (enforcement, new-message, verify alert, near-expiry cron) plus Supabase Auth dashboard templates (confirm signup, reset password), evidenced by real triggered sends read on Staging
  2. A user whose account is frozen sees the freeze notice on a stale open tab without manual refresh (isolated functional commit)
  3. Admin analytics Top Search Terms shows zero vitest-* rows, and new test runs no longer pollute search events (purge + guard, isolated commit)
  4. The 5 key templates (home, listing detail, register, sell, messages) pass WCAG AA contrast (4.5:1 normal / 3:1 large + UI), every interactive element has a visible non-glow focus indicator, and all glow/flicker/motion honors `prefers-reduced-motion` with nothing flashing more than 3×/second
  5. The full Playwright e2e suite is green (PII/RLS/EXIF invariant tests untouched) and the v1.0 24-step UAT walkthrough passes on the new skin with stakeholder mockup-fidelity approval
**Plans**: TBD

## Cross-Cutting Gates (re-verified each v1.1 phase)

- **Behavior freeze:** no functional change outside FIX-01/FIX-02; any diff to contract/RLS/privacy test files in a visual commit is a regression signal
- **Token discipline:** `rg "#[0-9a-fA-F]{3,8}" app components --glob '!globals.css'` returns no new hits after Phase 11
- **Same-commit test updates:** e2e selector/brand-string updates land with the surface they cover; role/name selector failures are treated as a11y signals first
- **Per-surface e2e runs:** full suite executed after each surface phase, not only at Phase 15

## Progress

**Execution Order:** 11 → 12 → 13 → 14 → 15 (strict; Phase 14 surface groups parallelizable internally; FIX commits may float earlier as isolated commits but verify at Phase 15)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 0–10 (13 phases) | v1.0 | 57/57 | Complete | 2026-06-12 |
| 11. Brand Foundation & Token System | 3/4 | In Progress|  | - |
| 12. Shared Chrome | v1.1 | 0/TBD | Not started | - |
| 13. Public Surfaces & Signage Browse | v1.1 | 0/TBD | Not started | - |
| 14. Auth, App & Admin Surface Passes | v1.1 | 0/TBD | Not started | - |
| 15. Rebrand Sweep, Fixes & Final QA | v1.1 | 0/TBD | Not started | - |

### Phase 16: Part Taxonomy & Guided Cascade

**Goal:** A buyer can drill the stakeholder-approved 3-level part taxonomy (root category → subcategory → item) and have category search match a whole subtree. Seed the 20 root categories + the full "Fuel Tanks, Straps & Accessories" subtree (other 19 subtrees added later as data arrives); make `search_listings` match a category's whole descendant subtree (recursive CTE over `listing_categories`); add a `getChildCategories(parentId)` cascade reader; rework the welcome explorer cascade to Make → Model → (search now) → Category(root) → Advanced(subcategory → item + Condition); rework `/browse` filters to Category → Subcategory → Item dependent selects + Condition; reorganize/replace the existing app-seeded categories and re-tag/clear staging test listings. **YEAR is explicitly OUT of scope** (deferred to its own later phase: a from–to year range on listings + create-listing form + search RPC + a Year cascade step between Model and Category). NOT part of the v1.1 rebrand — new functional scope captured after a stakeholder taxonomy review. Full Fuel Tanks subtree + scope detail live in `.planning/phases/16-part-taxonomy-guided-cascade/16-CONTEXT.md`.
**Requirements**: FITL-05, SRCH-03, FINT-03 (extends shipped v1.0 — no new IDs; this phase materially changes how these behave)
**Depends on:** existing fitment taxonomy (v1.0 Phase 3) + search (v1.0 Phase 7); independent of the v1.1 rebrand phases
**Plans:** 7/7 plans complete

Plans:
- [ ] 16-01-PLAN.md — Migration 0025: recursive-CTE subtree match in search_listings (frozen signature) + re-seed roots + Fuel Tanks subtree + forward-migrate old tags + seed.sql swap (FITL-05, SRCH-03, FINT-03)
- [ ] 16-02-PLAN.md — getChildCategories + getRootCategories cascade readers (FITL-05, SRCH-03)
- [ ] 16-03-PLAN.md — Welcome explorer rework: Make → Model → Category(root) → Advanced(subcategory → item + Condition) (FITL-05, SRCH-03)
- [ ] 16-04-PLAN.md — /browse Category → Subcategory → Item dependent selects (desktop + mobile) + context-bearing chip (FITL-05, SRCH-03, FINT-03)

### Phase 17: Seller Activation & Transaction Trust Gates

**Goal:** Wire the just-in-time phone-verification trust gates that were designed in Phase 2 but never connected. Verification infra (`/verify` wizard, `is_verified_seller()`, badge) and the selling/contact flows already exist — this phase connects them: gate publishing a listing (phone + marketplace terms) and contacting a seller (phone only) at the server boundary, parameterize the `/verify` wizard with `next`/`require`, and add the functional navigation entries (Sell, My Listings, Account) plus the verify prompts, so selling and contacting actually require a real, contactable identity.

**Requirements**: Extends shipped v1.0 IDs (behavioral change, no new IDs) — VERF-02/03/04 (verification now actually gates), LIST-01 (publish gated), MSG-01/05 (contact gated). Anticipates CHRM-02/03 (nav entry points) without owning the final header design. Design doc: `docs/superpowers/specs/2026-06-18-seller-activation-trust-gates-design.md`.

**Depends on:** Phase 16

**Success criteria:**
- An unverified user who tries to publish a listing is routed to `/verify` (require=seller: phone + marketplace terms); their listing draft (text/selection fields) is preserved and rehydrated on return (photos re-attached).
- An unverified user who tries to contact a seller is routed to `/verify` (require=phone) before the contact modal opens; on return the modal opens normally.
- `createListing` rejects server-side when phone/terms flags are missing; `submitContact` rejects server-side when the phone flag is missing (the trust boundary holds even if the UI is bypassed).
- The `/verify` wizard honors `?next=` and `?require=phone|seller` (phone-level returns without forcing selling terms).
- Logged-in users have discoverable nav entries: Sell → `/sell`, My Listings → `/sell/listings`, Account → `/account`.
- OTP anti-abuse defenses (BotID + rate-limit + geo +1 + spend cap, Phase 2) are confirmed to cover the now-wider buyer+seller audience; spend-cap threshold reviewed.
- e2e covers: unverified→publish blocked→verify→publish; unverified→contact blocked→verify (phone only)→contact; verified-seller end-to-end.

**Plans:** 7/7 plans complete

Plans:
- [ ] 17-01-PLAN.md — Server-action trust-boundary gates (createListing phone+terms; submitContact phone) + lib/verify/gate.ts (LIST-01, MSG-05, VERF-02, VERF-04)
- [ ] 17-02-PLAN.md — Migration 0027: RLS WITH CHECK backstops (listings is_verified_seller; contact_log phone-only) (LIST-01, MSG-05, VERF-04)
- [x] 17-03-PLAN.md — Parameterize /verify with ?next/?require (level-aware completion + safe redirect) (VERF-02, VERF-03, VERF-04)
- [ ] 17-04-PLAN.md — Sell-gate UI: unverified banner + Publish interception + sessionStorage draft preserve/rehydrate (LIST-01, VERF-04)
- [ ] 17-05-PLAN.md — Contact-gate UI: unverified route to /verify(require=phone) + contact=1 auto-open on return (MSG-01, MSG-05, VERF-02)
- [ ] 17-06-PLAN.md — Functional nav entries (Sell/My Listings/Account) + Become-a-verified-seller CTA on /account (VERF-02/03/04)
- [ ] 17-07-PLAN.md — e2e trust-gate routing + nav presence; confirm OTP spend cap + Twilio alert + BotID (live checkpoint) (LIST-01, MSG-01/05, VERF-02/03/04)

---
*v1.0 archived 2026-06-12. v1.1 roadmap created 2026-06-12 — 29/29 requirements mapped across Phases 11–15.*
