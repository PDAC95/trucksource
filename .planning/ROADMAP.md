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
- [ ] **Phase 5: Listings, Photos & EXIF-Safe Storage** - Create/edit/sell listings, multi-photo upload with server-side EXIF strip, fitment tagging, shipping + contact preference
- [ ] **Phase 6: Fitment Intelligence** - Rules-based suggestion of applicable trucks/configs/categories; seller-confirmed, never auto-applied; garage pre-fill
- [ ] **Phase 7: Search, Feed & Public Profile** - FTS + trigram search, faceted filtering, slang-tolerant matching, browse feed, "fits my truck" personalization, public profile, event logging
- [ ] **Phase 8: Social Layer** - Public username-attributed comments, save/bookmark listings, mark-as-sold
- [ ] **Phase 9: Contact → Private Chat** - Form-first contact (persist + admin copy before thread opens), private in-site chat, report/abuse logging
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

### Phase 6: Fitment Intelligence
**Goal**: When a seller creates a listing, the system suggests applicable trucks, configurations, and categories from the populated library (pre-filled by the seller's garage where relevant); the seller confirms (never auto-applied), and a confirmed listing then surfaces in every applicable fitment search result. Tuned for precision over recall.
**Depends on**: Phase 3 (taxonomy), Phase 5 (listings), Phase 4 (garage pre-fill)
**Requirements**: FINT-01, FINT-02, FINT-03
**Cross-cutting gate**: Privacy/RLS re-verified on the `fitment_rules` table and suggestion service.
**Success Criteria** (what must be TRUE):
  1. While creating a listing, the seller is shown suggested applicable trucks, configurations, and categories derived from the part details
  2. Suggested fitments are presented for explicit seller confirmation and are never applied automatically
  3. Once a seller confirms fitments, the listing appears in every applicable fitment search result and truck category
**Plans**: TBD

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
**Plans**: TBD

### Phase 8: Social Layer
**Goal**: The 30% social experience comes alive — buyers can publicly comment on listings (attributed to username only), save listings to view later, and sellers can mark their listings as sold.
**Depends on**: Phase 5 (listings), Phase 7 (public surfaces)
**Requirements**: SOCL-01, SOCL-02, LIST-06
**Cross-cutting gate**: Privacy/RLS re-verified — comments display commenter by username only, never PII; saves are owner-scoped.
**Success Criteria** (what must be TRUE):
  1. A buyer can post a public comment on a listing, shown attributed to their username only
  2. A buyer can save (bookmark) a listing and view their list of saved listings
  3. A seller can mark their own listing as "Sold," which updates its public status
**Plans**: TBD

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
**Plans**: TBD

### Phase 10: Admin Operations & Analytics
**Goal**: Operators can run and measure the marketplace — managing users, listings, reports (with enforcement), messages, categories, and the fitment library through a service-role-isolated console, and seeing analytics including most-searched makes/models. This also provides the bulk-onboarding tooling that mitigates two-sided cold start.
**Depends on**: All prior phases (needs data existing to manage and measure)
**Requirements**: ADMO-01, ADMO-02, ADMO-03, ADMO-04, ADMO-05, ADMO-06, ADMA-01, ADMA-02, ADMA-03, ADMA-04
**Cross-cutting gate**: Privacy/RLS re-verified — admin uses a dedicated service-role client isolated to one `server-only` module; the key never reaches the client bundle (CI scan).
**Success Criteria** (what must be TRUE):
  1. An admin can view and manage users and listings, manage part categories, and manage the full fitment library (makes, models, configs, terms, categories, materials, conditions, filters)
  2. An admin can view and act on abuse reports through a queue with enforcement actions, and can monitor messages/contact logs
  3. Analytics shows registered/active users, active and most-viewed listings, most-searched makes and models, messages sent, and monthly growth
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 0 → 0.1 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Setup & Scaffolding | 1/1 | Complete | 2026-06-01 |
| 0.1 Wiring & Tooling | 1/1 | In review | - |
| 1. Foundation & Privacy Model | 5/5 | Complete (verified-partial) | 2026-06-03 |
| 2. Verified Seller & Phone OTP | 5/5 | Complete | 2026-06-04 |
| 3. Fitment Taxonomy & Slang Library | 3/3 | Complete | 2026-06-04 |
| 4. My Garage | 3/3 | Complete | 2026-06-04 |
| 5. Listings, Photos & EXIF-Safe Storage | 1/5 | In Progress|  |
| 6. Fitment Intelligence | 0/TBD | Not started | - |
| 7. Search, Feed & Public Profile | 0/TBD | Not started | - |
| 8. Social Layer | 0/TBD | Not started | - |
| 9. Contact → Private Chat | 0/TBD | Not started | - |
| 10. Admin Operations & Analytics | 0/TBD | Not started | - |

---
*Roadmap created: 2026-06-01*
*Depth: comprehensive (10 phases) — derived from the research dependency chain; My Garage added as Phase 4 on 2026-06-01*
*Coverage: 62/62 v1 requirements mapped (58 original + 4 GARAGE)*
