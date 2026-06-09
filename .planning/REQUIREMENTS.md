# Requirements: Take-Off Parts — Truck Marketplace

**Defined:** 2026-06-01
**Core Value:** A buyer can find the right part (fitment/model/slang), interact publicly, and contact the seller privately — and the seller's personal identity (name, phone, email, address) is never exposed.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Accounts & Identity

- [x] **ACCT-01**: Seller can register an account with private data (First Name, Last Name, Email, Phone, State/Province, Country)
- [x] **ACCT-02**: Seller's private data (name, phone, email, street address, postal code) is never queryable or renderable on any public surface
- [x] **ACCT-03**: Seller can choose a custom public username (e.g. ChromeKing79)
- [x] **ACCT-04**: System can generate a public username automatically (e.g. PeterbiltParts483) if the seller does not choose one
- [x] **ACCT-05**: User can log in and stay logged in across sessions
- [x] **ACCT-06**: User can log out from any page
- [x] **ACCT-07**: Seller can declare a seller type (Dealer, Truck Dismantler, Manufacturer, Owner Operator, Fleet Mechanic, Repair Shop, Fleet Owner) shown as an informational badge — it does not change permissions or capabilities (stakeholder check.md, 2026-06-08)
- [x] **ACCT-08**: Seller's public name is a single chosen display name — default is the system-generated anonymous handle; the seller may opt in to show a real/business name (replacing the handle) via a deliberate action with a "this will be public" warning. The chosen public name is distinct from the private legal name and is never auto-populated from `profiles_private` (stakeholder check.md, 2026-06-08)

### Privacy & Public Profile

- [x] **PRIV-01**: Public seller profile displays only username, State/Province, Country, Member Since date, and number of active listings
- [x] **PRIV-02**: Location is displayed only as general "State/Province, Country" (e.g. "Texas, USA") — never street address or postal code
- [x] **PRIV-03**: Number of active listings on a profile is derived from current listings, not manually stored
- [x] **PRIV-04**: Buyer can view another user's public profile

### Verification

- [x] **VERF-01**: Seller can verify their email address
- [x] **VERF-02**: Seller can verify their phone number via one-time code
- [x] **VERF-03**: Seller must accept marketplace terms to become verified
- [x] **VERF-04**: A Verified Seller badge is shown on the profile of sellers who completed email + phone verification + accepted terms

### Fitment Library

- [x] **FITL-01**: Fitment library models Make as Level 1 (Peterbilt, Kenworth, Freightliner, Western Star, Volvo, Mack, International, and others)
- [x] **FITL-02**: Fitment library models Model as Level 2, scoped under each Make
- [x] **FITL-03**: Fitment library models Configuration as Level 3 (e.g. Standard/Extended Hood, Day Cab, Sleeper, Flat Top, Mid/High Roof, Glider)
- [x] **FITL-04**: Fitment library models Common Search Terms / trucker slang as Level 4 (e.g. "359 Guys", "Flat Glass Kenworth", "Aerodyne")
- [x] **FITL-05**: Fitment library models Part Categories as Level 5 (Bumpers, Grilles, Visors, Deck Plates, etc.)
- [x] **FITL-06**: Fitment library models Materials as Level 6 (Stainless Steel, Chrome, Aluminum, OEM, Aftermarket, etc.)
- [x] **FITL-07**: Fitment library models Condition as Level 7 (New, NOS, New Take-Off, Like New, Used, Refurbished, Damaged, Core)
- [x] **FITL-08**: Fitment library models Special Search Filters as Level 8 (Wide/Narrow Hood, Flat/Curved Glass, Day Cab, Sleeper, Heavy Haul, Universal Fit, etc.)
- [x] **FITL-09**: Fitment library includes "The Barnyard" anything-goes category (shop equipment, tools, collectibles, engines, transmissions, trailers, etc.)
- [x] **FITL-10**: A single part can be associated with many trucks/configurations/terms/categories (many-to-many fitment tagging)

### Listings

- [x] **LIST-01**: Seller can create a listing with public part info: Part Title, Part Number, Make, Model, Fitment, Condition, Material, Asking Price, Damage Notes, Date Listed
- [x] **LIST-02**: Seller can upload multiple photos with a listing
- [x] **LIST-03**: Uploaded photos have all metadata (including EXIF GPS) stripped server-side before they are stored or displayed
- [x] **LIST-04**: Seller can select a shipping option: Shipping Available / Local Pickup Only / Shipping Assistance Requested
- [x] **LIST-05**: Seller can edit their own listings
- [ ] **LIST-06**: Seller can mark their own listing as "Sold"
- [x] **LIST-07**: Seller can select a contact preference per account: Email Only / Email + Phone (optional display) / Marketplace Messaging Only
- [ ] **LIST-08**: A listing requires a minimum of 3 photos to publish (stakeholder check.md, 2026-06-08) — Phase 5 gap closure
- [x] **LIST-09**: A listing expires 90 days after listing/last renewal; expiry is frictionless — the seller is notified near expiry and renews with one click (another 90 days); an unrenewed listing becomes `expired` (hidden from search, NOT deleted; data + photos intact; reactivable in one click) (stakeholder check.md, 2026-06-08)
- [x] **LIST-10**: When the same seller creates a listing similar to one they already have (same seller + same/similar title), a soft non-blocking warning is shown ("you already have a similar listing"); the seller can always publish — a seller legitimately may have multiple similar parts (stakeholder check.md, 2026-06-08)

### My Garage

- [x] **GRGE-01**: User can add one or more trucks to their garage (Make → Model → Configuration from the fitment library), optionally — not required at registration
- [x] **GRGE-02**: User can view, edit, and remove trucks in their garage
- [x] **GRGE-03**: Buyer can filter the feed/search to parts that fit a selected garage truck ("Fits my truck"), with one click
- [x] **GRGE-04**: A seller's garage trucks pre-fill / accelerate Fitment Intelligence suggestions when they create a listing

### Fitment Intelligence

- [x] **FINT-01**: When a seller creates a listing, the system suggests applicable trucks, configurations, and categories based on the part details
- [x] **FINT-02**: Suggested fitments are presented for seller confirmation and are never auto-applied
- [x] **FINT-03**: A confirmed listing appears in every applicable fitment search result and truck category

### Search, Feed & Discovery

- [ ] **SRCH-01**: Buyer can browse a feed of active listings
- [ ] **SRCH-02**: Buyer can search parts by keyword (part title, part number)
- [ ] **SRCH-03**: Buyer can filter/search by Make, Model, Configuration, Part Category, Material, Condition, and Special Filters
- [ ] **SRCH-04**: Buyer can find parts using trucker slang / Common Search Terms (typo- and synonym-tolerant)
- [ ] **SRCH-05**: Search and listing-view events are logged so analytics can report most-searched and most-viewed items

### Social Layer

- [ ] **SOCL-01**: Buyer can post a public comment on a listing, attributed to their username only
- [ ] **SOCL-02**: Buyer can save (bookmark) a listing and view their saved listings

### Contact & Messaging

- [ ] **MSG-01**: Each listing has a "Contact Seller About This Part" action
- [ ] **MSG-02**: Buyer completes a contact form (Name, Email, Phone optional, Message) before any thread opens
- [ ] **MSG-03**: The contact form submission is persisted to the database, and a copy is sent to marketplace administration, before the chat opens
- [ ] **MSG-04**: Every buyer→seller communication is logged for abuse monitoring and dispute resolution
- [ ] **MSG-05**: After the contact form is submitted, a private in-site chat thread opens between buyer and seller
- [ ] **MSG-06**: Buyer and seller can exchange messages in the in-site chat without exposing seller PII
- [ ] **MSG-07**: User can report a listing, comment, or message for abuse

### Admin — Operations

- [ ] **ADMO-01**: Admin can view and manage users
- [ ] **ADMO-02**: Admin can view and manage listings
- [ ] **ADMO-03**: Admin can view and act on reports (abuse queue with enforcement actions)
- [ ] **ADMO-04**: Admin can monitor messages/contact logs
- [ ] **ADMO-05**: Admin can manage part categories
- [ ] **ADMO-06**: Admin can manage the fitment library (makes, models, configs, terms, categories, materials, conditions, filters)

### Admin — Analytics

- [ ] **ADMA-01**: Admin analytics shows registered users and active users
- [ ] **ADMA-02**: Admin analytics shows active listings and most-viewed listings
- [ ] **ADMA-03**: Admin analytics shows most-searched makes and most-searched models
- [ ] **ADMA-04**: Admin analytics shows messages sent and monthly growth

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Payments

- **PAY-01**: Buyer can pay for a part through the platform
- **PAY-02**: Escrow or direct seller payout handling

### Reputation

- **REP-01**: Buyer can rate a seller after a completed transaction (Communication, Accuracy, Packaging, Shipping Speed, Overall)
- **REP-02**: Seller rating is displayed on the public profile

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Payments / checkout / escrow | v2 — v1 connects buyer & seller; sale happens off-platform, seller marks "Sold" |
| Seller reputation / ratings | v2 future feature |
| Native mobile app | Web-first; responsive web covers v1 |
| Automated shipping / freight logistics | Shipping Assistance is human-assisted referral, not automated logistics |
| Any opt-in path that exposes seller PII publicly | Violates the core privacy guarantee |
| Radius / ZIP-based location search | Only general State/Province + Country is ever public |
| AI/ML content moderation | v1 uses report queue + human admin moderation |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ACCT-01 | Phase 1 | Complete |
| ACCT-02 | Phase 1 | Complete |
| ACCT-03 | Phase 1 | Complete |
| ACCT-04 | Phase 1 | Complete |
| ACCT-05 | Phase 1 | Complete |
| ACCT-06 | Phase 1 | Complete |
| ACCT-07 | Phase 5.1 | Complete |
| ACCT-08 | Phase 5.1 | Complete |
| PRIV-01 | Phase 1 | Complete |
| PRIV-02 | Phase 1 | Complete |
| PRIV-03 | Phase 1 | Complete |
| PRIV-04 | Phase 1 | Complete |
| VERF-01 | Phase 2 | Complete |
| VERF-02 | Phase 2 | Complete |
| VERF-03 | Phase 2 | Complete |
| VERF-04 | Phase 2 | Complete |
| FITL-01 | Phase 3 | Complete |
| FITL-02 | Phase 3 | Complete |
| FITL-03 | Phase 3 | Complete |
| FITL-04 | Phase 3 | Complete |
| FITL-05 | Phase 3 | Complete |
| FITL-06 | Phase 3 | Complete |
| FITL-07 | Phase 3 | Complete |
| FITL-08 | Phase 3 | Complete |
| FITL-09 | Phase 3 | Complete |
| FITL-10 | Phase 3 | Complete |
| GRGE-01 | Phase 4 | Complete |
| GRGE-02 | Phase 4 | Complete |
| GRGE-03 | Phase 4 | Complete |
| GRGE-04 | Phase 4 | Complete |
| LIST-01 | Phase 5 | Complete |
| LIST-02 | Phase 5 | Complete |
| LIST-03 | Phase 5 | Complete |
| LIST-04 | Phase 5 | Complete |
| LIST-05 | Phase 5 | Complete |
| LIST-07 | Phase 5 | Complete |
| LIST-08 | Phase 5 (gap) | Pending |
| LIST-09 | Phase 5.1 | Complete |
| LIST-10 | Phase 5.1 | Complete |
| FINT-01 | Phase 6 | Complete |
| FINT-02 | Phase 6 | Complete |
| FINT-03 | Phase 6 | Complete |
| SRCH-01 | Phase 7 | Pending |
| SRCH-02 | Phase 7 | Pending |
| SRCH-03 | Phase 7 | Pending |
| SRCH-04 | Phase 7 | Pending |
| SRCH-05 | Phase 7 | Pending |
| SOCL-01 | Phase 8 | Pending |
| SOCL-02 | Phase 8 | Pending |
| LIST-06 | Phase 8 | Pending |
| MSG-01 | Phase 9 | Pending |
| MSG-02 | Phase 9 | Pending |
| MSG-03 | Phase 9 | Pending |
| MSG-04 | Phase 9 | Pending |
| MSG-05 | Phase 9 | Pending |
| MSG-06 | Phase 9 | Pending |
| MSG-07 | Phase 9 | Pending |
| ADMO-01 | Phase 10 | Pending |
| ADMO-02 | Phase 10 | Pending |
| ADMO-03 | Phase 10 | Pending |
| ADMO-04 | Phase 10 | Pending |
| ADMO-05 | Phase 10 | Pending |
| ADMO-06 | Phase 10 | Pending |
| ADMA-01 | Phase 10 | Pending |
| ADMA-02 | Phase 10 | Pending |
| ADMA-03 | Phase 10 | Pending |
| ADMA-04 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 67 total (58 original + 4 GARAGE added 2026-06-01 + 5 stakeholder additions 2026-06-08)
- Mapped to phases: 67 ✓
- Unmapped: 0 ✓

Per-phase distribution: P1=10, P2=4, P3=10, P4=4 (Garage), P5=6 + LIST-08 gap, P5.1=4 (ACCT-07/08, LIST-09/10), P6=3, P7=5, P8=3, P9=7, P10=10.

**Stakeholder additions (check.md, 2026-06-08):** ACCT-07 (seller type badge), ACCT-08 (opt-in public display name), LIST-08 (min 3 photos), LIST-09 (90-day expiry/renewal), LIST-10 (soft duplicate warning). Ratings & reviews requested but kept v2 (REP-01/02). The large real part-category catalog (~600 lines) will be loaded as the `part_categories` seed once stakeholders confirm how literal it should be (flat-provisional first, then mapped to the 8-level taxonomy) — tracked as a data task, not a requirement.

---
*Requirements defined: 2026-06-01*
*Last updated: 2026-06-08 — added 5 stakeholder requirements (check.md) + Phase 5.1; My Garage (Phase 4) added 2026-06-01*
