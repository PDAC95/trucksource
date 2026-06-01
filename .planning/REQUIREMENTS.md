# Requirements: Take-Off Parts — Truck Marketplace

**Defined:** 2026-06-01
**Core Value:** A buyer can find the right part (fitment/model/slang), interact publicly, and contact the seller privately — and the seller's personal identity (name, phone, email, address) is never exposed.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Accounts & Identity

- [ ] **ACCT-01**: Seller can register an account with private data (First Name, Last Name, Email, Phone, State/Province, Country)
- [ ] **ACCT-02**: Seller's private data (name, phone, email, street address, postal code) is never queryable or renderable on any public surface
- [ ] **ACCT-03**: Seller can choose a custom public username (e.g. ChromeKing79)
- [ ] **ACCT-04**: System can generate a public username automatically (e.g. PeterbiltParts483) if the seller does not choose one
- [ ] **ACCT-05**: User can log in and stay logged in across sessions
- [ ] **ACCT-06**: User can log out from any page

### Privacy & Public Profile

- [ ] **PRIV-01**: Public seller profile displays only username, State/Province, Country, Member Since date, and number of active listings
- [ ] **PRIV-02**: Location is displayed only as general "State/Province, Country" (e.g. "Texas, USA") — never street address or postal code
- [ ] **PRIV-03**: Number of active listings on a profile is derived from current listings, not manually stored
- [ ] **PRIV-04**: Buyer can view another user's public profile

### Verification

- [ ] **VERF-01**: Seller can verify their email address
- [ ] **VERF-02**: Seller can verify their phone number via one-time code
- [ ] **VERF-03**: Seller must accept marketplace terms to become verified
- [ ] **VERF-04**: A Verified Seller badge is shown on the profile of sellers who completed email + phone verification + accepted terms

### Fitment Library

- [ ] **FITL-01**: Fitment library models Make as Level 1 (Peterbilt, Kenworth, Freightliner, Western Star, Volvo, Mack, International, and others)
- [ ] **FITL-02**: Fitment library models Model as Level 2, scoped under each Make
- [ ] **FITL-03**: Fitment library models Configuration as Level 3 (e.g. Standard/Extended Hood, Day Cab, Sleeper, Flat Top, Mid/High Roof, Glider)
- [ ] **FITL-04**: Fitment library models Common Search Terms / trucker slang as Level 4 (e.g. "359 Guys", "Flat Glass Kenworth", "Aerodyne")
- [ ] **FITL-05**: Fitment library models Part Categories as Level 5 (Bumpers, Grilles, Visors, Deck Plates, etc.)
- [ ] **FITL-06**: Fitment library models Materials as Level 6 (Stainless Steel, Chrome, Aluminum, OEM, Aftermarket, etc.)
- [ ] **FITL-07**: Fitment library models Condition as Level 7 (New, NOS, New Take-Off, Like New, Used, Refurbished, Damaged, Core)
- [ ] **FITL-08**: Fitment library models Special Search Filters as Level 8 (Wide/Narrow Hood, Flat/Curved Glass, Day Cab, Sleeper, Heavy Haul, Universal Fit, etc.)
- [ ] **FITL-09**: Fitment library includes "The Barnyard" anything-goes category (shop equipment, tools, collectibles, engines, transmissions, trailers, etc.)
- [ ] **FITL-10**: A single part can be associated with many trucks/configurations/terms/categories (many-to-many fitment tagging)

### Listings

- [ ] **LIST-01**: Seller can create a listing with public part info: Part Title, Part Number, Make, Model, Fitment, Condition, Material, Asking Price, Damage Notes, Date Listed
- [ ] **LIST-02**: Seller can upload multiple photos with a listing
- [ ] **LIST-03**: Uploaded photos have all metadata (including EXIF GPS) stripped server-side before they are stored or displayed
- [ ] **LIST-04**: Seller can select a shipping option: Shipping Available / Local Pickup Only / Shipping Assistance Requested
- [ ] **LIST-05**: Seller can edit their own listings
- [ ] **LIST-06**: Seller can mark their own listing as "Sold"
- [ ] **LIST-07**: Seller can select a contact preference per account: Email Only / Email + Phone (optional display) / Marketplace Messaging Only

### Fitment Intelligence

- [ ] **FINT-01**: When a seller creates a listing, the system suggests applicable trucks, configurations, and categories based on the part details
- [ ] **FINT-02**: Suggested fitments are presented for seller confirmation and are never auto-applied
- [ ] **FINT-03**: A confirmed listing appears in every applicable fitment search result and truck category

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
| (populated by roadmapper) | | |

**Coverage:**
- v1 requirements: 49 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 49 ⚠️

---
*Requirements defined: 2026-06-01*
*Last updated: 2026-06-01 after initial definition*
