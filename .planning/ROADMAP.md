# Roadmap: Take-Off Parts — Truck Marketplace

## Overview

Take-Off Parts is a privacy-first, fitment-driven marketplace for North-American heavy-truck parts (~70% marketplace, ~30% specialized social network). The roadmap follows a strict, research-validated dependency chain: privacy/RLS scaffolding and the public/private profile split come first (nothing is safe to build until PII separation exists), then the verification trust signal, then the 8-level fitment taxonomy (the keystone every downstream feature needs), then My Garage (users save their trucks, reusing the taxonomy), then listings with EXIF-safe photo storage, then Fitment Intelligence, search/feed/public profile, the social layer, the contact→private-chat trust spine, and finally the admin operations + analytics console. The journey ends with a complete experience where a buyer can find the right part by fitment/model/slang (and filter to "fits my truck"), interact publicly, and contact a seller privately — and the seller's real identity is never exposed.

### Cross-Cutting Gates (not phases)

Two guarantees are **constraints re-verified in every relevant phase**, never standalone phases:

1. **Privacy / RLS guarantee** — seller PII (name, phone, email, street address, postal code) must never be queryable or renderable on any public surface. RLS default-deny is enabled on every table at creation, the public/private profile split is enforced, and the service-role key stays server-only. Re-verified in **every phase that adds a table or a public surface** (P1, P3, P4, P5, P6, P7, P8, P9, P10).
2. **Server-side EXIF/GPS stripping** — every uploaded photo is re-encoded server-side with all metadata stripped before storage or display. Established in **P5** and re-verified anywhere new image upload paths appear.

Event logging for analytics (search + listing-view events) is instrumented when listings/search ship (P5/P7), even though the Analytics dashboard lands in P10 — the data cannot be reconstructed later.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 0: Setup & Scaffolding** - Next.js 16 + React 19 + TS + Tailwind v4 + shadcn scaffold, route groups, dormant Supabase client skeletons, .env.example — no tables/RLS/auth yet
- [ ] **Phase 0.1: Wiring & Tooling** (INSERTED) - Connect Supabase Staging + Vercel; Prettier/ESLint, husky+lint-staged, Vitest+Playwright, GitHub Actions CI
- [x] **Phase 1: Foundation & Privacy Model** - Supabase + SSR auth, RLS default-deny baseline, public/private profile split, registration with public username (completed 2026-06-03, verified-partial — live email round-trip deferred to custom SMTP)
- [x] **Phase 2: Verified Seller & Phone OTP** - Email + phone OTP + terms acceptance → server-computed Verified badge (completed 2026-06-04, verified 12/12; live Twilio round-trip confirmed)
- [x] **Phase 3: Fitment Taxonomy & Slang Library** - 8-level fitment library + The Barnyard + slang synonym table, many-to-many tagging, seed data (completed 2026-06-04, verified 10/10 must-haves; seed applied to Staging, slang integrity gate green)
- [x] **Phase 4: My Garage** - Users save one or more trucks (make/model/config/**year**) to their profile; powers "fits my truck" filtering and accelerates seller fitment (completed 2026-06-04, live flow user-approved; required model year added)
- [x] **Phase 5: Listings, Photos & EXIF-Safe Storage** - Create/edit/sell listings, multi-photo upload with server-side EXIF strip, fitment tagging, shipping + contact preference (completed 2026-06-08, 5/5 plans; live seller listing flow user-approved at UAT; pre-launch blocker: photo upload needs signed-URL-direct-to-Storage for Vercel's 4.5MB body cap)
- [x] **Phase 5.1: Stakeholder Trust & Lifecycle** (INSERTED) - Seller-type informational badge, opt-in public display name (default anonymous), 90-day frictionless listing expiry/renewal, soft same-seller duplicate warning (from stakeholder check.md, 2026-06-08). LIST-08 (min 3 photos) handled separately as a Phase 5 gap. (completed 2026-06-09)
- [ ] **Phase 6: Fitment Intelligence** - Rules-based suggestion of applicable trucks/configs/categories; seller-confirmed, never auto-applied; garage pre-fill
- [ ] **Phase 7: Search, Feed & Public Profile** - FTS + trigram search, faceted filtering, slang-tolerant matching, browse feed, "fits my truck" personalization, public profile, event logging
- [x] **Phase 8: Social Layer** - Public username-attributed comments, save/bookmark listings, mark-as-sold (completed 2026-06-10, 6/6 plans; live comments/saves/sold flows user-approved at UAT; UI copy translated to English during UAT)
- [x] **Phase 9: Contact → Private Chat** - Form-first contact (persist + admin copy before thread opens), private in-site chat, report/abuse logging (completed 2026-06-11, 7/7 plans; full trust spine — contact form → contact_log + admin email → realtime private chat → block/report — user-approved at live two-browser UAT)
- [ ] **Phase 10: Admin Operations & Analytics** - Service-role-isolated ops console (users/listings/reports/messages/categories/fitment) + analytics dashboard

## Phase Details

### Phase 0: Setup & Scaffolding
**Goal**: A booting Next.js 16 project with the full route-group structure, pinned dependencies, and dormant Supabase client skeletons — no tables, RLS, or auth (those are Phase 1).
**Depends on**: Nothing (first phase)
**Requirements**: None (pure scaffolding; enables all later phases)
**Success Criteria** (what must be TRUE):
  1. The Next.js 16 + React 19 + TypeScript project boots locally (`npm run dev`) and builds (`npm run build`) with no errors
  2. The route-group structure (`(public)`/`(auth)`/`(app)`/`admin`) and `lib/supabase/{server,client,middleware,admin}.ts` exist per ARCHITECTURE.md, compiling but not connected to a database
  3. All decided dependencies are installed and pinned; the deprecated `@supabase/auth-helpers-nextjs` is absent
  4. `.env.example` documents every required variable (service-role key marked server-only) and the README explains how to create and connect Supabase later
  5. No table, RLS policy, or auth logic exists yet — those remain Phase 1
**Plans**: docs/superpowers/plans/2026-06-01-phase-0-setup-scaffolding.md

### Phase 0.1: Wiring & Tooling (INSERTED)
**Goal**: The merged scaffold is connected to Supabase Staging and Vercel, with a production-ready quality base (formatting, linting, pre-commit hooks, unit + E2E testing, CI) — so Phase 1 writes only features and migrations.
**Depends on**: Phase 0
**Requirements**: None (infrastructure/tooling)
**Success Criteria** (what must be TRUE):
  1. `format:check`, `lint`, `typecheck`, `test` pass and `build` exits 0 on the clean tree
  2. A pre-commit hook formats/lints staged files; CI gates PRs on lint + typecheck + test + build
  3. `npm run check:supabase` connects to Staging without creating any table
  4. `.env.local` holds Staging credentials, is untracked, and the service-role key is never `NEXT_PUBLIC_`-prefixed
  5. The scaffold deploys to a Vercel preview and serves the placeholder home; env vars set per environment (all → Staging for now)
  6. No table, RLS, or auth logic added
**Plans**: docs/superpowers/plans/2026-06-01-phase-0.1-wiring-tooling.md

### Phase 1: Foundation & Privacy Model
**Goal**: A user can register and log in, receives a public username, and gets a public profile that structurally cannot expose their private PII — privacy is guaranteed by the data model and RLS, not by app discipline.
**Depends on**: Nothing (first phase)
**Requirements**: ACCT-01, ACCT-02, ACCT-03, ACCT-04, ACCT-05, ACCT-06, PRIV-01, PRIV-02, PRIV-03, PRIV-04
**Cross-cutting gate**: Establishes the Privacy/RLS guarantee — `profiles_public` (world-readable) physically split from `profiles_private` (owner-only RLS), RLS default-deny on every table, service-role key server-only. A contract test asserts anonymous profile/listing fetches contain zero PII keys.
**Success Criteria** (what must be TRUE):
  1. A seller can register with private data (first/last name, email, phone, state/province, country) and log in, staying logged in across sessions, and can log out from any page
  2. A new account receives a public username — either a custom one the seller chooses or a system-generated one (e.g. PeterbiltParts483) if they don't
  3. Any visitor viewing a public profile sees only username, State/Province, Country, Member Since, and a live count of active listings — and the private name/phone/email/street/postal data is not present anywhere in the public response
  4. Location anywhere public renders only as general "State/Province, Country" (e.g. "Texas, USA"), never a street address or postal code
**Plans**: 5 plans
- [ ] 01-01-PLAN.md — Wave 0: env URL fix, Zod schemas, username generator, USA/Canada geo data, unit tests, shadcn primitives, Supabase dashboard config
- [ ] 01-02-PLAN.md — Foundation migration (profiles split + RLS + signup trigger + active_listing_count) + PII-keys contract & RLS tests
- [ ] 01-03-PLAN.md — Auth flows: register/login/logout/forgot/reset, /auth/confirm route, guarded (app) layout + header user menu
- [ ] 01-04-PLAN.md — Public profile /u/[username] (derived listings count, no PII) + route-level contract test
- [ ] 01-05-PLAN.md — E2E specs (auth + public profile) + human verification of the live happy path

### Phase 2: Verified Seller & Phone OTP
**Goal**: A seller can earn a Verified badge by confirming their email, confirming their phone via one-time code, and accepting marketplace terms — and the OTP send path is hardened against SMS-pumping abuse before it is ever exposed.
**Depends on**: Phase 1
**Requirements**: VERF-01, VERF-02, VERF-03, VERF-04
**Success Criteria** (what must be TRUE):
  1. A seller can verify their email address
  2. A seller can verify their phone number by entering a one-time code sent to it
  3. A seller can accept marketplace terms as part of becoming verified
  4. A Verified Seller badge appears on the profile only of sellers who completed email + phone verification + terms acceptance, with the verified state computed server-side
**Plans**: 5 plans
- [ ] 02-01-PLAN.md — Wave 1: 0002 migration (phone nullable + phone_verified_at + marketplace_terms_accepted_at + terms_version; otp_send_attempts + abuse_events RLS tables; is_verified_seller fn) + badge/RLS integration tests
- [ ] 02-02-PLAN.md — Wave 1: pure helpers — toE164Plus1 (+1-only E.164, TDD) + shared Zod schemas (phone/OTP/terms)
- [ ] 02-03-PLAN.md — Wave 2: hardened OTP pipeline — Twilio Verify client, Postgres rate-limit + spend-cap, Resend admin alert, BotID wiring, sendOtp/checkOtp/acceptTerms actions + guard-order unit tests
- [ ] 02-04-PLAN.md — Wave 3: resume-on-abandon verify wizard (phone → 6-box OTP w/ countdown + change-number → marketplace terms) + e2e + live human-verify checkpoint
- [ ] 02-05-PLAN.md — Wave 2: Verified badge render on /u/[username] via is_verified_seller RPC + privacy-contract extension

### Phase 3: Fitment Taxonomy & Slang Library
**Goal**: The 8-level fitment library exists as queryable reference data — Make → Model → Configuration → Common Search Terms → Part Categories → Materials → Condition → Special Filters, plus The Barnyard — with trucker slang modeled as a synonym table and a part able to map to many trucks/configs/terms/categories. Its schema quality caps everything downstream.
**Depends on**: Phase 1
**Requirements**: FITL-01, FITL-02, FITL-03, FITL-04, FITL-05, FITL-06, FITL-07, FITL-08, FITL-09, FITL-10
**Cross-cutting gate**: Privacy/RLS re-verified — new reference and join tables created RLS default-deny; public reference reads allowed, writes restricted.
**Success Criteria** (what must be TRUE):
  1. The library models all 8 levels — Make (L1), Model under Make (L2), Configuration (L3), Common Search Terms / slang (L4), Part Categories (L5), Materials (L6), Condition (L7), Special Filters (L8) — plus a "The Barnyard" anything-goes category
  2. Trucker slang and aliases (e.g. "359 Guys", "Flat Glass Kenworth", "Aerodyne") are stored as data in a synonym/alias table, not hardcoded into queries
  3. A single part record can be associated with many trucks, configurations, terms, and categories simultaneously (many-to-many tagging)
  4. The launch make/region taxonomy and slang dictionary are seeded and browsable
**Plans**: 3 plans
- [ ] 03-01-PLAN.md — Wave 1: migration 0003 (8 reference tables + model_configurations + search_term_targets exclusive arc, RLS default-deny + public-read on each) applied to Staging
- [ ] 03-02-PLAN.md — Wave 2: idempotent supabase/seed.sql (Peterbilt+KW models, shared configs, L5–L8, curated 20–40-term slang dictionary, seed-integrity do-block) + Phase-5 listing↔fitment/Barnyard spec + user-review checkpoint
- [ ] 03-03-PLAN.md — Wave 3: tests/integration/fitment.test.ts (anon read/write-deny gate + seed-presence + every-slang-term-resolves) + full-suite regression

### Phase 4: My Garage
**Goal**: A user can save one or more of their trucks (Make → Model → Configuration from the fitment library) to their profile — optionally, never forced at registration — so buyers can later filter to "fits my truck" and sellers get faster, pre-filled fitment when listing.
**Depends on**: Phase 1 (user account), Phase 3 (fitment library for make/model/config references)
**Requirements**: GRGE-01, GRGE-02, GRGE-03, GRGE-04
**Cross-cutting gate**: Privacy/RLS re-verified — the `garage_trucks` table is owner-scoped (a user can only read/write their own garage); garage data is never exposed on public surfaces.
**Success Criteria** (what must be TRUE):
  1. A user can add one or more trucks to their garage by selecting Make → Model → Configuration from the fitment library, as an optional step after registration
  2. A user can view, edit, and remove the trucks in their garage
  3. A buyer can filter the feed/search to parts that fit a selected garage truck with one click ("fits my truck") — the filtering hook is consumed by Phase 7 search
  4. A seller's garage trucks pre-fill / accelerate the fitment suggestions when they create a listing — consumed by Phase 6 Fitment Intelligence
**Plans**: 3 plans
- [ ] 04-01-PLAN.md — Wave 1: migration 0004 (garage_trucks owner-scoped, 4 RLS owner policies, coalesce(config_id,0) unique index) + shared truckSchema + listMyTrucks() P6/P7 contract + Wave-0 anon-RLS gate & schema unit tests
- [ ] 04-02-PLAN.md — Wave 2: addTruck/updateTruck/deleteTruck Server Actions (getClaims-scoped, shared-zod re-validate, model_configurations combo re-check, soft cap, 23505 duplicate)
- [ ] 04-03-PLAN.md — Wave 3: /profile/garage card list + empty state, Add/Edit cascade modal (Make→Model→Config), confirmed delete, skippable dashboard banner + live human-verify

### Phase 5: Listings, Photos & EXIF-Safe Storage
**Goal**: A seller can create, edit, and sell a listing with the full public field set, tag it against the fitment library, and upload multiple photos that are stripped of all metadata server-side — so no photo can ever leak the seller's exact location.
**Depends on**: Phase 1 (seller_id), Phase 3 (fitment tags)
**Requirements**: LIST-01, LIST-02, LIST-03, LIST-04, LIST-05, LIST-07
**Cross-cutting gate**: Establishes the **server-side EXIF/GPS strip** guarantee — every upload re-encoded with `sharp`, no `.withMetadata()`; an automated no-GPS regression test gates the pipeline. Privacy/RLS re-verified on `listings` + `listing_*` join tables. Listing-view event logging instrumented from day one.
**Success Criteria** (what must be TRUE):
  1. A seller can create a listing with the full public field set (Part Title, Part Number, Make, Model, Fitment, Condition, Material, Asking Price, Damage Notes, Date Listed) and edit their own listings afterward
  2. A seller can upload multiple photos to a listing, and every stored/displayed photo has all metadata — including EXIF GPS — stripped server-side (verified by an automated no-GPS test)
  3. A seller can select a shipping option per listing: Shipping Available / Local Pickup Only / Shipping Assistance Requested
  4. A seller can set an account-level contact preference: Email Only / Email + Phone (optional display) / Marketplace Messaging Only
**Plans**: 5 plans
- [x] 05-01-PLAN.md — Wave 1: 0006 listings/fitment/photos/view-events migration (RLS default-deny) + 0007 storage bucket/RLS + lib/images/strip.ts EXIF gate + P0 no-GPS test + listings RLS integration test + sharp/exifr/dnd-kit deps
- [x] 05-02-PLAN.md — Wave 1: listingSchema (client+server zod) + getConditions reader + 0008 active_listing_count rewrite (PRIV-03) + schema unit tests
- [ ] 05-03-PLAN.md — Wave 2: createListing/updateListing/uploadListingPhoto/removeListingPhoto Server Actions (getClaims, EXIF-strip wiring, photo-path ownership, combo re-check, owner RLS) + getListing/getMyListings read surface + actions unit test
- [ ] 05-04-PLAN.md — Wave 3: sectioned listing form (RHF+listingSchema) — multi-fit cascade + Barnyard toggle, dnd-kit photo uploader (immediate upload, first=cover), shipping radio, /sell + /sell/[id]/edit, live human-verify
- [ ] 05-05-PLAN.md — Wave 3: 0009 contact_preference on profiles_public (LIST-07) + /account control + public /listings/[id] detail page (zero PII) + listing-view event logging + next/image host whitelist

### Phase 5.1: Stakeholder Trust & Lifecycle (INSERTED)
**Goal**: Fold in the trust-and-lifecycle features the stakeholders requested (check.md, 2026-06-08) without reopening already-verified phases: sellers carry an informational type badge, they control their public identity (anonymous by default), listings keep inventory fresh via a frictionless 90-day expiry/renewal cycle, and same-seller duplicate posting is gently discouraged — none of it changing the privacy model or seller permissions.
**Depends on**: Phase 1 (profiles), Phase 2 (verified-seller signal), Phase 5 (listings + create form)
**Requirements**: ACCT-07, ACCT-08, LIST-09, LIST-10
**Cross-cutting gate**: Privacy/RLS re-verified — `seller_type` and the opt-in public display name live on `profiles_public` (non-PII, owner-written); the chosen display name is never auto-populated from `profiles_private`. The `expired` status and `expires_at` add no public PII. Same posture as the rest of the marketplace surfaces.
**Success Criteria** (what must be TRUE):
  1. A seller can declare a seller type (Dealer, Truck Dismantler, Manufacturer, Owner Operator, Fleet Mechanic, Repair Shop, Fleet Owner), shown as an informational badge on their public profile; it changes no permissions
  2. A seller's public name defaults to the anonymous system handle; the seller can opt in to show a real/business name (replacing the handle) through a deliberate action with a clear "this will be public" warning, and the legal private name is never exposed by it
  3. A listing automatically expires 90 days after listing/last renewal; the seller is notified near expiry and can renew in one click; an unrenewed listing becomes `expired` (hidden from search, not deleted, reactivable in one click)
  4. When the same seller creates a listing similar to one they already have, a soft non-blocking warning is shown but they can always publish
**Plans**: 5 plans
- [ ] 5.1-01-PLAN.md — Wave 1: migration 0010 (seller_type + display_name on profiles_public, status CHECK +expired, expires_at + backfill, partial + trigram indexes, notifications table, find_similar_own_listings fn) + badge contract + extended account schema + Wave-0 privacy/reveal-revert/flip tests
- [ ] 5.1-02-PLAN.md — Wave 2: ACCT-07/08 — updateSellerType/updateDisplayName actions, reusable SellerTypeBadge, reveal-confirmation display-name form + revert, /account controls, public profile shows coalesce(display_name, username) + badge
- [ ] 5.1-03-PLAN.md — Wave 2: LIST-09 lifecycle — renew/reactivate actions (active-only / expired-only, +90d), lifecycle-aware reads (owner expiringSoon/expired; buyer excludes expired), My Listings expiry/Reactivate states + detail-page owner Renew + guard-order test
- [ ] 5.1-04-PLAN.md — Wave 2: LIST-10 — findSimilarOwnListings advisory probe (pg_trgm RPC, never blocks), non-accusatory duplicate-warning dialog with links + Publish anyway, create-form wiring (createListing unchanged)
- [ ] 5.1-05-PLAN.md — Wave 3: LIST-09 automation — pg_cron daily active→expired flip (0011) + secret-guarded Vercel Cron near-expiry route (Resend email + in-app notification via service-role admin) + owner notifications reader

### Phase 6: Fitment Intelligence
**Goal**: When a seller creates a listing, the system suggests applicable trucks, configurations, and categories from the populated library (pre-filled by the seller's garage where relevant); the seller confirms (never auto-applied), and a confirmed listing then surfaces in every applicable fitment search result. Tuned for precision over recall.
**Depends on**: Phase 3 (taxonomy), Phase 5 (listings), Phase 4 (garage pre-fill)
**Requirements**: FINT-01, FINT-02, FINT-03
**Cross-cutting gate**: Privacy/RLS re-verified on the `fitment_rules` table and suggestion service.
**Success Criteria** (what must be TRUE):
  1. While creating a listing, the seller is shown suggested applicable trucks, configurations, and categories derived from the part details
  2. Suggested fitments are presented for explicit seller confirmation and are never applied automatically
  3. Once a seller confirms fitments, the listing appears in every applicable fitment search result and truck category
**Plans**: 4 plans
- [ ] 06-01-PLAN.md — Wave 1: migration 0012 (fitment_rules exclusive-arc FK rules + listing_categories + listing_search_terms join tables, RLS in-migration) + migration 0013 idempotent seed rules + extended listingSchema (categoryIds/searchTermIds) + Wave-0 RLS/seed integration gate & schema unit test
- [ ] 06-02-PLAN.md — Wave 2: getPartCategories reader + category/search-term persistence in createListing/updateListing + read-back on getListing/detail page + edit-mode id pre-fill + FINT-03 accept-equals-manual equivalence test
- [ ] 06-03-PLAN.md — Wave 2: lib/fitment/types.ts shared contract + lib/fitment/suggest.ts "use server" suggestion engine (FINT-01: category inference + garage→flat expansion from the SAME fitment_rules table; getClaims/RLS only, no service-role) + FINT-01 integration assertions
- [ ] 06-04-PLAN.md — Wave 3: vendor Skeleton + grouped-chips suggestions component (no useEffect auto-apply, FINT-02) + Part-Category trigger select + real-time debounced wiring into listing-form (accept/add-all/dismiss through the single setFitment path) + live human-verify checkpoint

### Phase 7: Search, Feed & Public Profile
**Goal**: A buyer can discover parts as the differentiator's payoff — browsing a feed and searching by keyword, facets, and trucker slang with typo/synonym tolerance, and filtering to "fits my truck" from their garage — and view a seller's public profile, with search and view events logged for analytics.
**Depends on**: Phase 5 (taggable listings), Phase 6 (confirmed fitments), Phase 4 (garage filter)
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05
**Cross-cutting gate**: Privacy/RLS re-verified — public search/feed/profile surfaces render no PII. Search FTS + `pg_trgm` use GIN indexes verified via `EXPLAIN ANALYZE`. Search-event logging instrumented from day one. Consumes the Phase 4 "fits my truck" garage filter.
**Success Criteria** (what must be TRUE):
  1. A buyer can browse a feed of active listings without logging in
  2. A buyer can search by keyword (part title, part number) and filter by Make, Model, Configuration, Part Category, Material, Condition, and Special Filters
  3. A buyer can find parts using trucker slang / Common Search Terms, with typo- and synonym-tolerant matching
  4. Search and listing-view events are logged so analytics can later report most-searched and most-viewed items
**Plans**: 4 plans
Plans:
- [x] 07-01-PLAN.md — Search DB foundation: 0014_search.sql (tsvector + GIN + search_events + search_listings RPC) + EXPLAIN-ANALYZE/no-PII integration gate
- [x] 07-02-PLAN.md — lib/search readers: params (URL↔SearchQuery), queries (searchListings/expandSlang/autocomplete), recordSearchEvent
- [x] 07-03-PLAN.md — Same-screen feed/search UI: cards, cascading facets, slang banner, fits-my-truck, infinite scroll (human-verify)
- [x] 07-04-PLAN.md — Public profile active-listings grid + sort + no-PII contract

### Phase 8: Social Layer
**Goal**: The 30% social experience comes alive — buyers can publicly comment on listings (attributed to username only), save listings to view later, and sellers can mark their listings as sold.
**Depends on**: Phase 5 (listings), Phase 7 (public surfaces)
**Requirements**: SOCL-01, SOCL-02, LIST-06
**Cross-cutting gate**: Privacy/RLS re-verified — comments display commenter by username only, never PII; saves are owner-scoped.
**Success Criteria** (what must be TRUE):
  1. A buyer can post a public comment on a listing, shown attributed to their username only
  2. A buyer can save (bookmark) a listing and view their list of saved listings
  3. A seller can mark their own listing as "Sold," which updates its public status
**Plans**: 6 plans
Plans:
- [x] 08-01-PLAN.md — Migration 0015_social.sql (comments + saves + deletion audit + save-count RPC + seen watermark, RLS in-migration) + live RLS/zero-PII gates
- [x] 08-02-PLAN.md — Comments backend: commentSchema, getListingComments (zero-PII thread reader), addComment/deleteComment/markCommentsSeen + unit tests
- [x] 08-03-PLAN.md — Saves + sold backend: toggleSave/getMySavedListings/getSavedIds, markSold/markAvailable, getMyListings save/comment counts, SaveButton
- [x] 08-04-PLAN.md — Listing-page surface: comment thread + composer UI, sold-renders-with-badge gate change, detail SaveButton + owner sold toggle
- [x] 08-05-PLAN.md — Feed save hearts (incl. infinite scroll), /saved page with sold/expired badges + nav, /sell/listings counts + sold toggle
- [x] 08-06-PLAN.md — Automated phase sweep + human-verify checkpoint of the live social flows (user-approved 2026-06-10; UAT i18n sweep `0a4356c`)

### Phase 9: Contact → Private Chat
**Goal**: The trust spine — a buyer contacts a seller through a form that persists the submission and copies admin BEFORE any chat thread opens, then exchanges messages in a private in-site chat that never exposes seller PII, with reporting and abuse logging throughout.
**Depends on**: Phase 5 (listings), Phase 1 (auth)
**Requirements**: MSG-01, MSG-02, MSG-03, MSG-04, MSG-05, MSG-06, MSG-07
**Cross-cutting gate**: Privacy/RLS re-verified — chat surfaces never expose seller PII; every contact persisted and admin-copied before the thread opens (anti-pattern: opening chat first). Rate limiting + report button on contact/chat paths.
**Success Criteria** (what must be TRUE):
  1. Each listing has a "Contact Seller About This Part" action that requires the buyer to complete a contact form (Name, Email, Phone optional, Message) before any thread opens
  2. On submission, the contact is persisted to the database and a copy is sent to marketplace administration before the private chat opens, and every buyer→seller communication is logged for abuse monitoring and dispute resolution
  3. After submitting, a private in-site chat thread opens and buyer and seller can exchange messages without the seller's PII being exposed
  4. A user can report a listing, comment, or message for abuse
**Plans**: 7 plans

Plans:
- [x] 09-01-PLAN.md — Migration 0016 (contact_log/threads/messages/blocks/reports, RLS, realtime publication) + zod schemas + server-only notify module (completed 2026-06-11)
- [ ] 09-02-PLAN.md — submitContact invariant-#5 spine + message/thread actions + zero-PII readers (+ guard-order unit tests)
- [x] 09-03-PLAN.md — Reporting vertical slice: submitReport action + reusable ReportMenu + comment mount (completed 2026-06-11)
- [ ] 09-04-PLAN.md — Live Staging integration tests: participant-only RLS, append-only log, block enforcement, zero-PII contract
- [ ] 09-05-PLAN.md — Contact Seller CTA + pre-filled modal form on the listing page (+ listing ReportMenu)
- [ ] 09-06-PLAN.md — Thread page + realtime ThreadView (optimistic composer, block, per-message report)
- [ ] 09-07-PLAN.md — Inbox split view + global unread badge + email opt-out toggle + end-to-end UAT checkpoint

### Phase 10: Admin Operations & Analytics
**Goal**: Operators can run and measure the marketplace — managing users, listings, reports (with enforcement), messages, categories, and the fitment library through a service-role-isolated console, and seeing analytics including most-searched makes/models. This also provides the bulk-onboarding tooling that mitigates two-sided cold start.
**Depends on**: All prior phases (needs data existing to manage and measure)
**Requirements**: ADMO-01, ADMO-02, ADMO-03, ADMO-04, ADMO-05, ADMO-06, ADMA-01, ADMA-02, ADMA-03, ADMA-04
**Cross-cutting gate**: Privacy/RLS re-verified — admin uses a dedicated service-role client isolated to one `server-only` module; the key never reaches the client bundle (CI scan).
**Success Criteria** (what must be TRUE):
  1. An admin can view and manage users and listings, manage part categories, and manage the full fitment library (makes, models, configs, terms, categories, materials, conditions, filters)
  2. An admin can view and act on abuse reports through a queue with enforcement actions, and can monitor messages/contact logs
  3. Analytics shows registered/active users, active and most-viewed listings, most-searched makes and models, messages sent, and monthly growth
**Plans**: 10 plans

Plans:
- [ ] 10-01-PLAN.md — Migration 0019 (enforcement/audit/queue/freeze/is_active schema + policy updates) + grant-admin script
- [ ] 10-02-PLAN.md — Admin shell: requireAdmin() gate, logAdminAction() audit writer, gated sidebar layout, CI service-role bundle scan
- [ ] 10-03-PLAN.md — Users management + full enforcement ladder (warn/suspend/ban/reactivate/rename, audited + emailed) + suspension UX (blocked page, lazy expiry, read-only chat)
- [ ] 10-04-PLAN.md — Listings moderation: filterable index, hide/restore, photo removal, draft bulk-publish + hidden/draft RLS regression test
- [ ] 10-05-PLAN.md — Fitment Library: generic 8-level taxonomy CRUD + slang editor + is_active picker filtering
- [ ] 10-06-PLAN.md — Analytics dashboard: live service-role aggregates, KPI cards, trend charts, rankings, 7/30/90/all presets
- [ ] 10-07-PLAN.md — Message monitoring: metadata threads list, report-justified audited content view, thread freeze, contact-log table
- [ ] 10-08-PLAN.md — Reports queue: grouped per target with counters, Pending→Resolved/Dismissed + notes, enforcement wiring
- [ ] 10-09-PLAN.md — CSV bulk import: Papa Parse + zod rows, real-seller ownership, photo URLs through the EXIF gate, results report
- [ ] 10-10-PLAN.md — Automated gate sweep + stakeholder UAT checkpoint (closes Phase 10 and v1)

## Progress

**Execution Order:**
Phases execute in numeric order: 0 → 0.1 → 1 → 2 → 3 → 4 → 5 → 5.1 → 6 → 7 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Setup & Scaffolding | 1/1 | Complete | 2026-06-01 |
| 0.1 Wiring & Tooling | 1/1 | In review | - |
| 1. Foundation & Privacy Model | 5/5 | Complete (verified-partial) | 2026-06-03 |
| 2. Verified Seller & Phone OTP | 5/5 | Complete | 2026-06-04 |
| 3. Fitment Taxonomy & Slang Library | 3/3 | Complete | 2026-06-04 |
| 4. My Garage | 3/3 | Complete | 2026-06-04 |
| 5. Listings, Photos & EXIF-Safe Storage | 5/5 | Complete (LIST-08 min-3-photos gap pending) | 2026-06-08 |
| 5.1 Stakeholder Trust & Lifecycle (INSERTED) | 5/5 | Complete   | 2026-06-09 |
| 6. Fitment Intelligence | 4/4 | Complete | 2026-06-09 |
| 7. Search, Feed & Public Profile | 4/4 | Complete | 2026-06-10 |
| 8. Social Layer | 6/6 | Complete | 2026-06-10 |
| 9. Contact → Private Chat | 7/7 | Complete | 2026-06-11 |
| 10. Admin Operations & Analytics | 7/10 | In Progress|  |

---
*Roadmap created: 2026-06-01*
*Depth: comprehensive — derived from the research dependency chain; My Garage added as Phase 4 on 2026-06-01; Phase 5.1 (Stakeholder Trust & Lifecycle) inserted 2026-06-08 from check.md*
*Coverage: 67/67 v1 requirements mapped (58 original + 4 GARAGE + 5 stakeholder additions)*
*Part-category catalog (~600 lines, check.md): pending stakeholder confirmation; will seed `part_categories` flat-provisional → mapped to the 8-level taxonomy. Ratings & reviews requested but kept v2 (REP-01/02).*
