# Feature Research

**Domain:** Privacy-first truck-parts online marketplace (~70% marketplace, ~30% specialized social network)
**Researched:** 2026-06-01
**Confidence:** MEDIUM-HIGH (competitor feature sets verified across multiple sources; fitment standards verified against eBay/ACES docs; privacy-model specifics are product-novel and reasoned from first principles + analogous patterns)

## Feature Landscape

This product sits at the intersection of three established categories, each with its own table-stakes expectations:
1. **P2P classifieds** (Facebook Marketplace, Craigslist, OfferUp) — listings, search, contact, save.
2. **Auto/truck parts e-commerce** (eBay Motors, FinditParts, TruckPartsMart, Class8TruckParts) — fitment/compatibility search, part numbers, condition.
3. **Social commerce** (FB Marketplace comments, in-app messaging) — public Q&A, private chat.

The product's deliberate edge is the **combination**: deep multi-path fitment + Fitment Intelligence auto-tagging + hard PII separation + form-first private chat + public comments. None of the three category leaders does all of these; each leader is weak on at least two of the five.

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Account registration / auth (email + password, email verify) | Can't list or contact without identity; every competitor has it | LOW | Supabase Auth handles this. Email verification is also an input to the Verified Seller flow. |
| Create listing (title, photos, price, condition, description) | Core of any classifieds/marketplace | MEDIUM | Truck-specific public fields (Part Number, Make, Model, Fitment, Material, Damage Notes, Shipping Availability) raise complexity vs generic classifieds. Photo upload → Supabase Storage. |
| Multiple photos per listing | Buyers won't trust a used part without several photos; universal on FB/eBay/OfferUp | MEDIUM | Need ordering, a primary/cover image, mobile-friendly upload, image optimization. Used-part buyers specifically want photos of wear/damage. |
| Browse / feed of listings | Default landing experience on every marketplace | MEDIUM | The 30% "social" framing leans on this being a scrollable feed, not just a search grid. Needs pagination/infinite scroll + sane default sort (recency). |
| Keyword + faceted search | Buyers arrive with intent; non-negotiable | MEDIUM-HIGH | This is where the fitment library plugs in (see Differentiators). Basic keyword search is table stakes; multi-path fitment is the differentiator. |
| Filter & sort (price, condition, location, recency) | Standard on all three classifieds leaders | MEDIUM | Location filter is "State/Province, Country" granularity only (privacy constraint), not radius/zip like OfferUp/FB. |
| Listing detail page | Where the buy decision happens | LOW-MEDIUM | Must render only public fields; PII must be structurally absent, not hidden. |
| Contact the seller | The entire point of a connect-only (no-checkout) marketplace | MEDIUM-HIGH | Here it's the form-first→chat flow (see Social & Contact deep-dive). More complex than competitors' one-tap message. |
| In-app / in-site messaging | Buyers and safety guides expect to stay on-platform; FB/OfferUp both push this hard ("never communicate outside the platform") | HIGH | Realtime threads (Supabase Realtime). This is the trust spine — keeping comms on-platform is both a UX and a safety/logging requirement. |
| Save / bookmark a listing | "Saved" / "watchlist" is standard (FB Saved, eBay Watch) | LOW | Per-user saved list; requires auth. |
| Mark listing as "Sold" | Connect-only model needs a lifecycle end-state; competitors all have sold/closed | LOW | Drives accurate "# active listings" on profile and analytics. |
| Public seller profile | Buyers vet sellers before contacting | MEDIUM | Privacy-constrained: username, State/Province, Country, Member Since, # active listings ONLY. This is a table-stakes feature delivered in a differentiated (privacy-first) way. |
| Basic admin: manage users & listings | Operator must remove scams/spam or the marketplace rots (12-15% fraud rates in high-value categories per industry data) | MEDIUM | Operations area. Without takedown ability, fraud kills trust fast. |
| Report a listing / user | User reports are the primary moderation signal at small scale (industry standard before AI moderation pays off) | LOW-MEDIUM | Feeds the admin Reports queue. Cheap, high-leverage trust feature. |
| Mobile-responsive web | Truckers shop from phones; web-first per constraints | MEDIUM | Responsive, not native. Photo upload + chat must work well on mobile browsers. |
| Not-financial/safety disclaimers & terms | Liability + sets connect-only expectation | LOW | Terms acceptance is also a gate in the Verified Seller flow. |

### Differentiators (Competitive Advantage)

Features that set the product apart. These map directly to the three Core-Value pillars in PROJECT.md.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **8-level fitment library** (Make → Model → Configuration → Common Search Terms → Part Categories → Materials → Condition → Special Filters + "The Barnyard") | One part surfaces across every applicable truck, body style, configuration, and trucker term — dramatically faster than FB/Craigslist free-text. Deeper than eBay's Year/Make/Model/Trim/Engine. | **HIGH** | This is the #1 differentiator and the hardest data-modeling task. Heavy-truck fitment is messier than passenger-car ACES data (no clean universal catalog for take-off parts), so the taxonomy must be built/curated in-house. "Common Search Terms" (slang) and "The Barnyard" (anything-goes) are uniquely valuable and have no competitor analog. Foundational: most other features depend on this schema existing. |
| **Trucker-slang / Common Search Terms search** ("359 Guys", "Flat Glass Kenworth", "Aerodyne") | Buyers search how truckers actually talk; competitors force formal Year/Make/Model and miss intent | MEDIUM (given library exists) | A synonym/alias layer mapping slang → canonical fitment nodes. High emotional resonance with the target user; cheap once the library schema supports alias terms. Depends on fitment library. |
| **Fitment Intelligence (auto-suggest applicable trucks/categories at list time)** | Seller lists once; system suggests every truck/config/category the part fits so the listing appears in all relevant searches without manual tagging. Mirrors eBay "Fitment Plus Auto" (cross-references part data against a compatibility DB) but tuned to heavy-truck slang taxonomy. | **HIGH** | The "intelligence" can be rules/lookup-based in v1 (Part Number + Make/Model → suggested fitment nodes from the library), not necessarily ML. Quality of suggestions is gated entirely by library completeness. Reduces lister effort AND improves searchability — the flywheel of the whole product. Depends on fitment library. |
| **Privacy model: hard PII separation** (name, phone, personal email, street address, postal code never queryable/renderable on any public surface) | Privacy is a *feature, not a setting*. FB requires real names; Amazon forces seller identity disclosure; Craigslist offers anonymity only by user choice/omission. Here it's guaranteed by data architecture. | **HIGH** | This is an architectural differentiator more than a UI feature — private PII and public profile must be separate tables/columns with RLS/policies so PII can't leak via API or search. Touches every surface (listing, profile, comments, chat, admin). Get it wrong once and the core promise breaks. |
| **Form-first → private in-site chat contact flow** | Contact form (Name, Email, Phone optional, Message) persists to DB *first* (abuse baseline + admin copy), *then* opens a private realtime chat thread. Connects buyer↔seller without exposing seller PII; every contact is logged. | **HIGH** | More deliberate than competitors' instant DM. The persisted form submission is the legal/abuse record; the chat is the ongoing channel. Couples to messaging + admin logging. See deep-dive below. |
| **Public comments on listings** (the 30% social layer) | Facebook-Marketplace-style public Q&A ("¿Todavía disponible?", "¿Le queda a un W900L 2018?") builds community and surfaces fitment answers for all buyers, not just one | MEDIUM | Comments are public + attributed to usernames only (PII constraint). Needs its own moderation hooks (report/remove). Distinct from private chat — public knowledge vs private negotiation. |
| **Verified Seller badge** (email verified + phone verified + terms accepted) | Trust signal at launch in a category with 34% scam-exposure rates; analogous to OfferUp's TruYou but lighter-weight and privacy-preserving (verification status shown, verified data never shown) | MEDIUM | v1 is "soft" verification (control of email+phone + terms), not government ID. Phone verification (OTP) is the only new infra vs auth. Badge renders on public profile; the verified phone/email themselves stay private. |
| **Shipping Availability as a first-class listing attribute** (Shipping Available / Local Pickup Only / Shipping Assistance Requested) | Heavy truck parts are bulky/freight-class; "Shipping Assistance Requested" enables human-assisted LTL/cross-border referral — a real pain point competitors ignore | LOW (as a field) / the assistance itself is manual ops | The field is trivial; "Shipping Assistance" is a human referral workflow, NOT automated logistics (explicitly out of scope). Surfaces as a filter and a contact context. |
| **Admin Analytics area** (registered/active users, active listings, most-viewed listings, most-searched makes/models, messages sent, monthly growth) | Operator visibility into the fitment flywheel — "most-searched makes/models" directly informs which fitment library nodes to deepen | MEDIUM | Most-searched-makes/models analytics is a differentiator because it closes the loop on library curation. Requires event logging (search queries, listing views) from day one or the data won't exist retroactively. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems or violate the product thesis. Explicitly NOT for v1.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Payments / checkout / escrow** | "A real marketplace takes payment" | Massive scope (PCI, fraud, chargebacks, payouts, tax, disputes); turns you into a regulated payment processor; not needed to validate the connect-only thesis | v1 connects buyer↔seller; sale happens off-platform; seller marks "Sold." Revisit in v2 once liquidity is proven. (Explicitly out of scope in PROJECT.md.) |
| **Seller reputation / star ratings** (Communication, Accuracy, Packaging, Shipping Speed, Overall) | "Buyers need trust signals" | Ratings need transaction volume to be meaningful; cold-start problem; invites retaliation/review fraud; can't verify off-platform sales happened. Premature at launch. | v1 trust comes from Verified Seller badge + on-platform logging + admin moderation. Add multi-axis ratings in v2 once sales volume exists. (Out of scope in PROJECT.md.) |
| **Native mobile app (iOS/Android)** | "Truckers live on phones" | Doubles platform surface, app-store friction/review cycles, separate codebase; web-first validates the concept far cheaper | Mobile-responsive web (PWA-ready). Build native only after web product-market fit. (Out of scope in PROJECT.md.) |
| **Automated shipping/logistics, freight quoting, label printing** | "Help truckers ship heavy parts" | Becoming a carrier/3PL is a separate business; LTL/cross-border quoting automation is deep integration work | "Shipping Assistance Requested" is a human-assisted referral workflow (manual freight/LTL/cross-border help), not automated logistics. (Constraint in PROJECT.md.) |
| **Exposing seller phone/email/name anywhere** (even opt-in "show my number") | "Let sellers share contact if they want" | A single opt-in leak path erodes the entire privacy guarantee and the product's reason to exist; also a magnet for off-platform scam funneling | Seller contact *preference* (Email Only / Email+Phone optional display / Marketplace Messaging Only — recommended) is allowed per PROJECT.md, but PII must remain non-queryable; "phone display" if ever enabled must be an explicit per-seller choice surfaced only inside an authenticated contact context, never on public search/profile surfaces. Default and recommended path = Marketplace Messaging Only. |
| **Radius / zip-code / map-based local search** | OfferUp/FB Marketplace norm | Requires precise seller location, which violates the State/Province-only privacy rule | Location facet at State/Province + Country granularity only. |
| **AI/ML moderation pipeline at launch** | "Scale moderation" | Automated moderation only pays off at upload volume the product won't have at launch; over-engineering | Start with user reports + admin queue + velocity/rate limits. Add automated moderation when volume justifies it (industry pattern: reactive→proactive as marketplace grows). |
| **Open-ended seller "About me" / free social profile** | "Make it more social" | Free-text profile fields are a PII-leak and off-platform-funnel vector (sellers paste phone numbers/WhatsApp) | Constrain public profile to the defined fields (username, location, member-since, # listings, verified badge). Social-ness lives in public comments, not profile bios. |
| **3D/AR part visualization** (seen in 2026 parts e-commerce trends) | Conversion-boosting trend in new-parts retail | Built for new-parts catalogs with CAD models; take-off/used parts are one-off physical items with no model data | Multiple real photos (incl. damage shots) is the right fidelity for used parts. |

## Feature Dependencies

```
[Auth / Accounts]
    ├──requires──> [PII / Public-Profile data separation]   (privacy model is architectural, must exist before any profile/listing)
    │                   └──enables──> [Public Seller Profile]
    │                   └──enables──> [Verified Seller badge]  (also requires phone OTP verification)
    │
    └──enables──> [Create Listing]
                      └──requires──> [Fitment Library schema]      (listing's Make/Model/Fitment fields bind to it)
                      └──enables───> [Fitment Intelligence auto-tagging]  (requires Fitment Library populated)
                      └──enables───> [Photos / Storage]

[Fitment Library schema]
    └──enables──> [Fitment search + faceted filters]
                      └──enhanced-by──> [Trucker-slang / Common Search Terms]  (alias layer on the library)
    └──enables──> [Fitment Intelligence]
    └──feeds─────> [Admin Analytics: most-searched makes/models]   (requires search-event logging)

[Listing] ──enables──> [Browse Feed]
[Listing] ──enables──> [Save / Bookmark]
[Listing] ──enables──> [Public Comments]
[Listing] ──enables──> [Mark as Sold]
[Listing] ──enables──> [Contact Seller (form-first)]

[Contact Seller form]
    └──persists-to──> [DB record + admin copy]   (abuse/dispute baseline; MUST happen before chat)
        └──then-opens──> [Private in-site Chat thread]  (requires Realtime messaging)
            └──requires──> [PII separation]  (chat connects parties without exposing identity)

[User Reports] ──feeds──> [Admin Operations / Reports queue]
[All public surfaces] ──must-respect──> [PII separation]   (cross-cutting; not a phase, a constraint)
[Search-event + listing-view logging] ──feeds──> [Admin Analytics]   (must start at launch or data is lost)
```

### Dependency Notes

- **PII/Public-profile separation is foundational and cross-cutting:** it must be designed into the schema before profiles, listings, comments, chat, or admin are built. Retrofitting privacy onto an existing model is the #1 way this product breaks its core promise. It is a constraint on every other feature, not a standalone phase.
- **Fitment library is the keystone dependency:** listings, search, slang search, Fitment Intelligence, and the "most-searched makes/models" analytic all require it. It should be one of the earliest phases. Its schema design quality caps the quality of everything downstream.
- **Fitment Intelligence requires a populated library:** auto-suggestion quality is a direct function of library completeness — a thin library yields useless suggestions. Sequence library curation before/with Intelligence.
- **Contact form must persist before chat opens:** the DB record (+ admin copy) is the abuse/dispute baseline and is a hard requirement; the chat thread is opened *from* that record. Don't build "instant DM" that skips the persisted form.
- **Analytics requires event logging from day one:** most-viewed listings, most-searched makes/models, and messages-sent can't be reconstructed retroactively. Instrument search and view events when those features ship, even if the Analytics dashboard comes later.
- **Verified Seller depends on phone OTP:** the only net-new infrastructure vs. basic auth is phone verification (OTP/SMS). Email verification is shared with auth.
- **Public comments and private chat are separate systems:** public comments = attributed-to-username, moderated, broadcast knowledge. Private chat = realtime, two-party, logged. Don't conflate them.

## MVP Definition

### Launch With (v1)

Minimum to validate the three-pillar thesis (fitment search + public interaction + privacy-protected private contact). Per PROJECT.md, all "Active" requirements are v1.

- [ ] Auth + accounts with **PII/public-profile separation** — the privacy guarantee is the product; cannot ship without it
- [ ] Public seller profile (username, State/Province, Country, Member Since, # active listings) — privacy-constrained
- [ ] Verified Seller flow (email + phone verified + terms → badge) — launch trust signal
- [ ] Create listing with full public truck-parts field set + multi-photo upload
- [ ] Shipping Availability options (incl. "Shipping Assistance Requested" as a flag/referral)
- [ ] **8-level fitment library** + "The Barnyard" — keystone differentiator
- [ ] Fitment + slang search, faceted filters, browse feed
- [ ] **Fitment Intelligence** auto-suggest at list time (rules/lookup-based is fine for v1)
- [ ] Save / bookmark; mark as Sold
- [ ] Public comments on listings
- [ ] **Contact = form-first (persist + admin copy) → private in-site chat** with seller-contact-preference options
- [ ] Communication logging (every contact persisted + copied to admin)
- [ ] Admin Operations (Users, Listings, Reports, Messages monitoring, Categories, Fitment Library)
- [ ] Admin Analytics (with search/view event logging instrumented)
- [ ] Report listing/user; not-financial-advice + safety disclaimers

### Add After Validation (v1.x)

Refinements once the core loop works and there's traffic.

- [ ] Custom-username availability/abuse handling and system-generated fallback polish
- [ ] Library expansion driven by "most-searched makes/models" analytics (the curation flywheel)
- [ ] Richer slang/alias dictionary as real buyer search logs accumulate
- [ ] Saved-search / alert ("notify me when a 359 grille is listed")
- [ ] Lightweight automated spam/velocity controls once report volume justifies it

### Future Consideration (v2+)

Deferred until product-market fit (most are explicit out-of-scope items).

- [ ] Payments / checkout / escrow — once liquidity is proven
- [ ] Multi-axis seller reputation/ratings — once transaction volume makes ratings meaningful
- [ ] Native mobile app — after web PMF
- [ ] AI/ML content moderation — at moderation-volume scale
- [ ] Deeper Shipping Assistance tooling (freight-quote integrations) — still referral, just better tooling

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| PII/public-profile separation (privacy model) | HIGH | HIGH | P1 |
| Auth / accounts | HIGH | LOW | P1 |
| 8-level fitment library | HIGH | HIGH | P1 |
| Create listing + photos | HIGH | MEDIUM | P1 |
| Fitment + slang search / feed / filters | HIGH | HIGH | P1 |
| Fitment Intelligence (rules-based v1) | HIGH | HIGH | P1 |
| Contact form-first → private chat | HIGH | HIGH | P1 |
| Communication logging + admin copy | HIGH | MEDIUM | P1 |
| Public comments | MEDIUM-HIGH | MEDIUM | P1 |
| Public seller profile | MEDIUM | MEDIUM | P1 |
| Verified Seller badge (+ phone OTP) | MEDIUM-HIGH | MEDIUM | P1 |
| Save / bookmark | MEDIUM | LOW | P1 |
| Mark as Sold | MEDIUM | LOW | P1 |
| Report listing/user | MEDIUM-HIGH | LOW | P1 |
| Admin Operations | HIGH (operator) | MEDIUM | P1 |
| Admin Analytics (+ event logging) | MEDIUM (operator) | MEDIUM | P1 |
| Saved-search / alerts | MEDIUM | MEDIUM | P2 |
| Automated moderation / velocity limits | MEDIUM | MEDIUM | P2 |
| Payments / ratings / native app / auto-logistics | (varies) | HIGH | P3 |

**Priority key:** P1 = must-have for launch · P2 = should-have, add when possible · P3 = future.

> Note: per PROJECT.md the entire "Active" set is v1, so nearly everything is P1. Within P1, the build *order* should follow dependencies: privacy schema → fitment library → listings → search/intelligence → social/contact → admin/analytics.

## Competitor Feature Analysis

| Feature | Facebook Marketplace | Craigslist | OfferUp | eBay Motors | Dedicated truck-parts (TruckPartsMart / FinditParts / Class8) | Our Approach |
|---------|----------------------|------------|---------|-------------|---------------------------------------------------------------|--------------|
| Fitment/compatibility search | None (free-text) | None | None | Year/Make/Model/Trim/Engine via My Garage + Fitment Plus Auto | Dropdown filters, some YMM | **8-level + slang + "Barnyard" — deepest, heavy-truck-tuned** |
| Auto-tag part to all fitting vehicles | No | No | No | Fitment Plus Auto (cross-references compatibility DB) | Partial/manual | **Fitment Intelligence (rules-based, slang-aware)** |
| Seller PII privacy | Real name required; commerce profile | User-controlled anonymity (omission) | TruYou pushes real identity | Real seller identity | Business sellers, public | **Guaranteed by architecture; PII never queryable** |
| Public comments / Q&A on listing | Yes (comments) | No | Limited | Q&A on some listings | Mostly no | **Yes — core 30% social layer, username-attributed** |
| Private messaging | Messenger | Email relay / phone | In-app chat | eBay messaging | Contact forms / phone | **Form-first (logged) → private realtime chat** |
| Identity verification | Profile social proof | None | TruYou ID verify | Account-level | Business KYC | **Verified Seller (email+phone+terms), privacy-preserving** |
| Save / watch | Saved | No | Saved | Watch | Cart/wishlist | **Save / bookmark** |
| Payments | Optional shipped checkout | No (off-platform) | In-app pay option | Full checkout | Full checkout | **None in v1 — connect-only, mark "Sold"** |
| Ratings/reputation | Profile ratings | No | Seller ratings | Detailed seller ratings | Reviews | **None in v1 — trust via Verified + logging + moderation** |
| Communication logging for admin | Internal | No | Internal | Internal | Varies | **Every contact persisted + copied to admin (explicit feature)** |

**Key insight:** the classifieds leaders (FB/Craigslist/OfferUp) own *liquidity and social* but have *zero fitment intelligence* and *weak/forced-identity privacy*. The parts e-commerce leaders (eBay/FinditParts) own *fitment* but are *transactional storefronts with no social layer and full identity exposure*. No competitor combines deep fitment + privacy + social. That gap is the entire product thesis, and it's defensible because the fitment library + slang taxonomy is a curation moat that's hard to copy.

## Sources

- Facebook Marketplace vs Craigslist vs OfferUp comparison — https://www.funlovingfamilies.com/facebook-marketplace-vs-craigslist-vs-offerup/ (MEDIUM)
- OfferUp vs Facebook Marketplace (TruYou, MeetUp spots, safety) — https://www.topbubbleindex.com/blog/offerup-vs-facebook-marketplace/ (MEDIUM)
- eBay vehicle compatibility (fitment) seller guide — https://export.ebay.com/en/growth/pa/vehicle-compatibility-fitment-guide-for-ebay-sellers/ (HIGH — official eBay)
- eBay Fitment Plus Auto guide — https://www.3dsellers.com/blog/ebay-fitment-plus-auto (MEDIUM)
- Automotive parts marketplace fitment / ACES-PIES standards — https://flxpoint.com/blog/automotive-parts-marketplace-fitment-supplier-networks (MEDIUM)
- Fitment intelligence + ACES 5.0/PIES 8.0 (Mar 2026) — https://pcfitment.com/blog/how-to-future-proof-your-auto-parts-store-with-fitment-intelligence/ (MEDIUM)
- Auto parts fitment specificity & returns — https://www.efulfillmentservice.com/2026/05/auto-parts-product-descriptions-2026/ (MEDIUM)
- Selling anonymously on Facebook Marketplace (real-name requirement) — https://softhandtech.com/can-i-sell-anonymously-on-facebook-marketplace/ (MEDIUM)
- Amazon US marketplace seller identity disclosure — https://sellerengine.com/why-is-amazon-us-marketplace-anonymous-no-more/ (MEDIUM)
- Never communicate outside the platform (on-platform messaging norm) — https://www.howtogeek.com/never-communicate-with-a-seller-outside-of-facebook-marketplace/ (MEDIUM)
- Dedicated truck-parts marketplaces (TruckPartsMart, Class8, FinditParts, TPI) — https://resources.truckpartsmart.com/blogs/online-marketplace-for-truck-parts , https://class8truckparts.com/ , https://www.finditparts.com/ , https://truckpartsinventory.com/ (MEDIUM)
- Marketplace content moderation / trust & safety patterns — https://getstream.io/blog/marketplace-content-moderation/ , https://www.sharetribe.com/academy/most-common-marketplace-attacks/ (MEDIUM)
- Classifieds fraud rates (34% scam exposure, 12-15% fraud in high-value) — https://www.intelmarketresearch.com/classifieds-marketplace-market-35734 (LOW-MEDIUM)

---
*Feature research for: privacy-first truck-parts marketplace with deep fitment + social layer*
*Researched: 2026-06-01*
