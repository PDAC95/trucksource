# Roadmap: Take-Off Parts — Truck Marketplace

## Overview

Take-Off Parts is a privacy-first, fitment-driven marketplace for North-American heavy-truck parts (~70% marketplace, ~30% specialized social network). The roadmap follows a strict, research-validated dependency chain: privacy/RLS scaffolding and the public/private profile split come first (nothing is safe to build until PII separation exists), then the verification trust signal, then the 8-level fitment taxonomy (the keystone every downstream feature needs), then listings with EXIF-safe photo storage, then Fitment Intelligence, search/feed/public profile, the social layer, the contact→private-chat trust spine, and finally the admin operations + analytics console. The journey ends with a complete experience where a buyer can find the right part by fitment/model/slang, interact publicly, and contact a seller privately — and the seller's real identity is never exposed.

### Cross-Cutting Gates (not phases)

Two guarantees are **constraints re-verified in every relevant phase**, never standalone phases:

1. **Privacy / RLS guarantee** — seller PII (name, phone, email, street address, postal code) must never be queryable or renderable on any public surface. RLS default-deny is enabled on every table at creation, the public/private profile split is enforced, and the service-role key stays server-only. Re-verified in **every phase that adds a table or a public surface** (P1, P3, P4, P5, P6, P7, P8, P9).
2. **Server-side EXIF/GPS stripping** — every uploaded photo is re-encoded server-side with all metadata stripped before storage or display. Established in **P4** and re-verified anywhere new image upload paths appear.

Event logging for analytics (search + listing-view events) is instrumented when listings/search ship (P4/P6), even though the Analytics dashboard lands in P9 — the data cannot be reconstructed later.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation & Privacy Model** - Supabase + SSR auth, RLS default-deny baseline, public/private profile split, registration with public username
- [ ] **Phase 2: Verified Seller & Phone OTP** - Email + phone OTP + terms acceptance → server-computed Verified badge
- [ ] **Phase 3: Fitment Taxonomy & Slang Library** - 8-level fitment library + The Barnyard + slang synonym table, many-to-many tagging, seed data
- [ ] **Phase 4: Listings, Photos & EXIF-Safe Storage** - Create/edit/sell listings, multi-photo upload with server-side EXIF strip, fitment tagging, shipping + contact preference
- [ ] **Phase 5: Fitment Intelligence** - Rules-based suggestion of applicable trucks/configs/categories; seller-confirmed, never auto-applied
- [ ] **Phase 6: Search, Feed & Public Profile** - FTS + trigram search, faceted filtering, slang-tolerant matching, browse feed, public profile, event logging
- [ ] **Phase 7: Social Layer** - Public username-attributed comments, save/bookmark listings, mark-as-sold
- [ ] **Phase 8: Contact → Private Chat** - Form-first contact (persist + admin copy before thread opens), private in-site chat, report/abuse logging
- [ ] **Phase 9: Admin Operations & Analytics** - Service-role-isolated ops console (users/listings/reports/messages/categories/fitment) + analytics dashboard

## Phase Details

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
**Plans**: TBD

### Phase 2: Verified Seller & Phone OTP
**Goal**: A seller can earn a Verified badge by confirming their email, confirming their phone via one-time code, and accepting marketplace terms — and the OTP send path is hardened against SMS-pumping abuse before it is ever exposed.
**Depends on**: Phase 1
**Requirements**: VERF-01, VERF-02, VERF-03, VERF-04
**Success Criteria** (what must be TRUE):
  1. A seller can verify their email address
  2. A seller can verify their phone number by entering a one-time code sent to it
  3. A seller can accept marketplace terms as part of becoming verified
  4. A Verified Seller badge appears on the profile only of sellers who completed email + phone verification + terms acceptance, with the verified state computed server-side
**Plans**: TBD

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
**Plans**: TBD

### Phase 4: Listings, Photos & EXIF-Safe Storage
**Goal**: A seller can create, edit, and sell a listing with the full public field set, tag it against the fitment library, and upload multiple photos that are stripped of all metadata server-side — so no photo can ever leak the seller's exact location.
**Depends on**: Phase 1 (seller_id), Phase 3 (fitment tags)
**Requirements**: LIST-01, LIST-02, LIST-03, LIST-04, LIST-05, LIST-07
**Cross-cutting gate**: Establishes the **server-side EXIF/GPS strip** guarantee — every upload re-encoded with `sharp`, no `.withMetadata()`; an automated no-GPS regression test gates the pipeline. Privacy/RLS re-verified on `listings` + `listing_*` join tables. Listing-view event logging instrumented from day one.
**Success Criteria** (what must be TRUE):
  1. A seller can create a listing with the full public field set (Part Title, Part Number, Make, Model, Fitment, Condition, Material, Asking Price, Damage Notes, Date Listed) and edit their own listings afterward
  2. A seller can upload multiple photos to a listing, and every stored/displayed photo has all metadata — including EXIF GPS — stripped server-side (verified by an automated no-GPS test)
  3. A seller can select a shipping option per listing: Shipping Available / Local Pickup Only / Shipping Assistance Requested
  4. A seller can set an account-level contact preference: Email Only / Email + Phone (optional display) / Marketplace Messaging Only
**Plans**: TBD

### Phase 5: Fitment Intelligence
**Goal**: When a seller creates a listing, the system suggests applicable trucks, configurations, and categories from the populated library; the seller confirms (never auto-applied), and a confirmed listing then surfaces in every applicable fitment search result. Tuned for precision over recall.
**Depends on**: Phase 3 (taxonomy), Phase 4 (listings)
**Requirements**: FINT-01, FINT-02, FINT-03
**Cross-cutting gate**: Privacy/RLS re-verified on the `fitment_rules` table and suggestion service.
**Success Criteria** (what must be TRUE):
  1. While creating a listing, the seller is shown suggested applicable trucks, configurations, and categories derived from the part details
  2. Suggested fitments are presented for explicit seller confirmation and are never applied automatically
  3. Once a seller confirms fitments, the listing appears in every applicable fitment search result and truck category
**Plans**: TBD

### Phase 6: Search, Feed & Public Profile
**Goal**: A buyer can discover parts as the differentiator's payoff — browsing a feed and searching by keyword, facets, and trucker slang with typo/synonym tolerance — and view a seller's public profile, with search and view events logged for analytics.
**Depends on**: Phase 4 (taggable listings), Phase 5 (confirmed fitments)
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05
**Cross-cutting gate**: Privacy/RLS re-verified — public search/feed/profile surfaces render no PII. Search FTS + `pg_trgm` use GIN indexes verified via `EXPLAIN ANALYZE`. Search-event logging instrumented from day one.
**Success Criteria** (what must be TRUE):
  1. A buyer can browse a feed of active listings without logging in
  2. A buyer can search by keyword (part title, part number) and filter by Make, Model, Configuration, Part Category, Material, Condition, and Special Filters
  3. A buyer can find parts using trucker slang / Common Search Terms, with typo- and synonym-tolerant matching
  4. Search and listing-view events are logged so analytics can later report most-searched and most-viewed items
**Plans**: TBD

### Phase 7: Social Layer
**Goal**: The 30% social experience comes alive — buyers can publicly comment on listings (attributed to username only), save listings to view later, and sellers can mark their listings as sold.
**Depends on**: Phase 4 (listings), Phase 6 (public surfaces)
**Requirements**: SOCL-01, SOCL-02, LIST-06
**Cross-cutting gate**: Privacy/RLS re-verified — comments display commenter by username only, never PII; saves are owner-scoped.
**Success Criteria** (what must be TRUE):
  1. A buyer can post a public comment on a listing, shown attributed to their username only
  2. A buyer can save (bookmark) a listing and view their list of saved listings
  3. A seller can mark their own listing as "Sold," which updates its public status
**Plans**: TBD

### Phase 8: Contact → Private Chat
**Goal**: The trust spine — a buyer contacts a seller through a form that persists the submission and copies admin BEFORE any chat thread opens, then exchanges messages in a private in-site chat that never exposes seller PII, with reporting and abuse logging throughout.
**Depends on**: Phase 4 (listings), Phase 1 (auth)
**Requirements**: MSG-01, MSG-02, MSG-03, MSG-04, MSG-05, MSG-06, MSG-07
**Cross-cutting gate**: Privacy/RLS re-verified — chat surfaces never expose seller PII; every contact persisted and admin-copied before the thread opens (anti-pattern: opening chat first). Rate limiting + report button on contact/chat paths.
**Success Criteria** (what must be TRUE):
  1. Each listing has a "Contact Seller About This Part" action that requires the buyer to complete a contact form (Name, Email, Phone optional, Message) before any thread opens
  2. On submission, the contact is persisted to the database and a copy is sent to marketplace administration before the private chat opens, and every buyer→seller communication is logged for abuse monitoring and dispute resolution
  3. After submitting, a private in-site chat thread opens and buyer and seller can exchange messages without the seller's PII being exposed
  4. A user can report a listing, comment, or message for abuse
**Plans**: TBD

### Phase 9: Admin Operations & Analytics
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
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Privacy Model | 0/TBD | Not started | - |
| 2. Verified Seller & Phone OTP | 0/TBD | Not started | - |
| 3. Fitment Taxonomy & Slang Library | 0/TBD | Not started | - |
| 4. Listings, Photos & EXIF-Safe Storage | 0/TBD | Not started | - |
| 5. Fitment Intelligence | 0/TBD | Not started | - |
| 6. Search, Feed & Public Profile | 0/TBD | Not started | - |
| 7. Social Layer | 0/TBD | Not started | - |
| 8. Contact → Private Chat | 0/TBD | Not started | - |
| 9. Admin Operations & Analytics | 0/TBD | Not started | - |

---
*Roadmap created: 2026-06-01*
*Depth: comprehensive (9 phases) — derived from the research dependency chain*
*Coverage: 58/58 v1 requirements mapped (the "49" in early notes was a stale count; the enumerated REQUIREMENTS.md list totals 58)*
