# Take-Off Parts — Truck Marketplace

## What This Is

A privacy-first online marketplace for the North American trucking industry where sellers list take-off and aftermarket truck parts and buyers find them through a deep, multi-path fitment library. It blends a marketplace (70%) with a specialized social network (30%): buyers browse a feed, comment publicly on listings, and contact sellers privately — all without ever exposing the seller's real name, phone, email, or address. The goal is to make finding a truck part faster and easier than Facebook Marketplace, Craigslist, or dealer inventories.

## Core Value

A buyer can find the right part (through fitment, model, or trucker slang), interact publicly, and contact the seller privately — and the seller's personal identity (name, phone, email, address) is never exposed. The complete privacy-safe social-marketplace experience is the point; remove any of the three pillars (fitment search, public interaction, private privacy-protected contact) and it stops being this product.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Accounts & Privacy**
- [ ] Seller registers an account with private data (First Name, Last Name, Email, Phone, State/Province, Country) that is never publicly displayed
- [ ] Seller gets a public username: either custom (e.g. ChromeKing79) or system-generated (e.g. PeterbiltParts483)
- [ ] Public profile shows only: username, State/Province, Country, Member Since date, # of active listings
- [ ] Location is displayed only as general "State/Province, Country" (e.g. "Texas, USA") — never street address or postal code
- [ ] Verified Seller flow in v1: verified email + verified phone + accepted terms → Verified badge on profile

**Listings**
- [ ] Seller creates a listing with public part info: Part Title, Part Number, Make, Model, Fitment, Condition, Material, Asking Price, Shipping Availability, Photos, Damage Notes, Date Listed
- [ ] Seller selects shipping option: Shipping Available / Local Pickup Only / Shipping Assistance Requested
- [ ] Seller can mark a listing as "Sold"
- [ ] Buyer can save (bookmark) a listing

**My Garage**
- [ ] User can optionally save one or more of their trucks (Make → Model → Configuration) to their profile — never forced at registration
- [ ] Buyer can filter the feed/search to "fits my truck" from a saved garage truck
- [ ] Seller's garage trucks pre-fill / accelerate fitment suggestions when listing

**Fitment Library & Search**
- [ ] 8-level fitment library: Make → Model → Configuration → Common Search Terms → Part Categories → Materials → Condition → Special Search Filters, plus "The Barnyard" (anything-goes) category
- [ ] Buyer can browse and search parts by make, model, configuration, trucker slang ("359 Guys", "Flat Glass Kenworth", "Aerodyne"), category, material, condition, and special filters
- [ ] Fitment Intelligence: when a seller lists a part, the system suggests applicable trucks/categories so the listing appears in every relevant search result
- [ ] Buyer browses a feed of listings

**Social & Contact**
- [ ] Buyer can comment publicly on a listing ("¿Todavía disponible?", "¿Le queda a un W900L 2018?")
- [ ] Contact Seller: buyer fills a contact form (Name, Email, Phone optional, Message); the form submission is saved to the database first, then opens a private in-site chat thread between buyer and seller
- [ ] Every contact sends a copy to marketplace administration and logs the communication for abuse monitoring / dispute resolution
- [ ] Seller contact preference: Email Only / Email + Phone (optional display) / Marketplace Messaging Only (recommended)

**Admin**
- [ ] Operations area: manage Users, Listings, Reports, Messages (optional monitoring), Categories, Fitment Library
- [ ] Analytics area: registered users, active users, active listings, most-viewed listings, most-searched makes, most-searched models, messages sent, monthly growth

### Out of Scope

- Payments / checkout / escrow — v2. v1 connects buyer and seller; the sale happens off-platform and the seller marks "Sold".
- Seller reputation / ratings system (Communication, Accuracy, Packaging, Shipping Speed, Overall) — v2 future feature.
- Native mobile app — web-first.
- The platform is not a payment processor or shipping carrier; Shipping Assistance is human-assisted referral (freight quotes, LTL, cross-border), not automated logistics.

## Context

- **Domain:** North American heavy-truck aftermarket and take-off parts (Peterbilt, Kenworth, Freightliner, Western Star, Volvo, Mack, International, and more). Buyers and sellers are truckers, shops, and enthusiasts who use specific slang and care deeply about exact fitment.
- **Differentiator vs. Facebook/Craigslist:** the multi-path fitment library + Fitment Intelligence means one part surfaces across every applicable truck model, configuration, body style, and trucker term — finding parts is dramatically faster.
- **Privacy is a feature, not a setting:** the entire data model must separate private seller PII from the public profile by design.
- **Shape:** ~70% marketplace, ~30% specialized social network (public feed + public comments on listings).

## Constraints

- **Tech stack**: Next.js 15 (App Router) + Supabase (Postgres, Auth, Realtime, Storage) + Tailwind + shadcn/ui — new standalone app, not built on the existing 12GA Customs stack. Why: relational fitment data + search + realtime chat + photo storage are well-served by this stack with minimal custom backend.
- **No payments in v1**: keep scope shippable; money is handled off-platform.
- **Privacy guarantee**: seller PII (name, phone, personal email, street address, postal code, payment info) must never be queryable or renderable on any public surface.
- **Communication logging**: every buyer→seller contact must be persisted and copied to admin for abuse/scam/dispute handling.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js + Supabase | Realtime chat, managed Postgres for fitment, Auth, and photo Storage out of the box; minimal backend to build | — Pending |
| New standalone app (not on 12GA Customs) | Different product and stack; clean separation | — Pending |
| No payments in v1 | Ship faster; sale completes off-platform, seller marks "Sold" | — Pending |
| Contact = form first → then chat | Form submission persists to DB (abuse base + admin copy) before a private in-site chat thread opens | — Pending |
| Public comments in v1 | Drives the 30% social experience (Facebook-Marketplace-style Q&A on listings) | — Pending |
| Verified Seller in v1 | Trust signal at launch (email + phone verified + terms) | — Pending |
| Comprehensive planning depth | Complex fitment library + search + chat + admin warrants thorough phase coverage | — Pending |
| My Garage in v1 (own phase) | Users save their trucks (optional, post-registration) to power "fits my truck" filtering + faster seller fitment; reuses the fitment library, so it slots in after taxonomy as Phase 4 | — Pending |

---
*Last updated: 2026-06-01 after adding My Garage (Phase 4)*
