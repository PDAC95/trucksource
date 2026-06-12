# OG Truck Parts (formerly Take-Off Parts) — Truck Marketplace

## What This Is

A privacy-first online marketplace for the North American trucking industry where sellers list take-off and aftermarket truck parts and buyers find them through a deep, multi-path fitment library. It blends a marketplace (70%) with a specialized social network (30%): buyers browse a feed, comment publicly on listings, and contact sellers privately — all without ever exposing the seller's real name, phone, email, or address. v1.0 shipped 2026-06-12 on Supabase Staging with the full loop working: register → verify → garage → list (EXIF-safe photos) → slang-tolerant search → comment/save → contact-form → private realtime chat → admin ops/analytics.

## Current State

**Shipped:** v1.0 MVP (2026-06-12) — 11 phases, 57 plans, 67/67 v1 requirements, stakeholder-approved final UAT (24/24 walkthrough steps live on Staging).
**Codebase:** ~33.7k LOC TypeScript/TSX + ~3.4k LOC SQL (24 migrations). Next.js 16 + React 19 + Supabase (Postgres 17, Auth, Realtime, Storage) + Tailwind v4 + shadcn/ui, hosted on Vercel (all envs → Supabase Staging).
**Not yet launched:** runs entirely against Staging; pre-launch blockers are tracked in MILESTONES.md → Known gaps.

## Current Milestone: v1.1 OG Rebrand & UI Redesign

**Goal:** Rebrand the product to **OG Truck Parts** and apply a complete neon truck-stop visual identity across the entire app — functionality unchanged — plus close the three small UX fixes from v1.0 UAT.

**Target features:**
- Full rebrand: name "OG Truck Parts" everywhere (UI copy, titles, metadata, emails), new logo + icon assets (provided by stakeholder)
- New visual identity applied app-wide: neon roadside/truck-stop aesthetic — dark night base, neon red/cyan signage, retro display typography, navy panels with neon borders, red neon CTAs (per stakeholder mockups)
- Redesigned persistent header: logo, prominent search bar, icon nav (search, sell, messages, saved, alerts, account) — no cart/payments elements from mockups (out of scope)
- Browse-as-signage: Make → Model → Category browse styled as neon sign grids
- Equal mobile/desktop care (no breakpoint bias)
- UAT fixes: sell entry point in header, freeze-notice realtime refresh, Staging data hygiene (vitest-* search terms)

## Core Value

A buyer can find the right part (through fitment, model, or trucker slang), interact publicly, and contact the seller privately — and the seller's personal identity (name, phone, email, address) is never exposed. The complete privacy-safe social-marketplace experience is the point; remove any of the three pillars (fitment search, public interaction, private privacy-protected contact) and it stops being this product.

## Requirements

### Validated

- ✓ Accounts & privacy: registration with private PII, public username (custom or generated), PII-free public profile, general-location-only display — v1.0
- ✓ Verified Seller: email + phone OTP (Twilio Verify, SMS-pumping hardened) + terms → server-computed badge — v1.0
- ✓ Seller type badge (informational) + opt-in public display name (anonymous by default) — v1.0
- ✓ Listings: full public field set, edit, sold/available, 3–8 EXIF-stripped photos, shipping options, contact preference, 90-day expiry with one-click renew/reactivate, soft duplicate warning — v1.0
- ✓ My Garage: save trucks (make/model/config/year), "fits my truck" filtering, seller fitment pre-fill — v1.0
- ✓ 8-level fitment library + The Barnyard + slang synonym table, seeded and browsable; multi-fit tagging — v1.0
- ✓ Fitment Intelligence: rules-based suggestions, seller-confirmed only — v1.0
- ✓ Search & feed: FTS + pg_trgm, slang/typo tolerant, faceted, fits-my-truck, anonymous browse; search/view event logging — v1.0
- ✓ Social: public username-attributed comments, saves, sold states — v1.0
- ✓ Contact→chat trust spine: form persists + admin copy BEFORE private realtime chat opens; block/report; abuse logging — v1.0
- ✓ Admin: enforcement ladder, listing moderation, grouped report queue, audited message monitoring, fitment CRUD, CSV bulk import, analytics dashboard — v1.0

### Active (v1.1 — OG Rebrand & UI Redesign)

- [ ] Rebrand to OG Truck Parts: name, logo/icon assets, all UI copy/titles/metadata/emails
- [ ] Neon truck-stop visual identity applied across every surface (public, auth, app, admin) — visual-only, functionality unchanged
- [ ] Redesigned header with sell entry point + icon nav (no cart/payments)
- [ ] Browse-as-neon-signage for Make/Model/Category
- [ ] Freeze-notice realtime refresh on stale tabs
- [ ] Staging data hygiene: purge vitest-* search terms from analytics

### Deferred (next milestones)

**Pre-launch blockers**
- Photo upload: signed-URL-direct-to-Storage (Vercel ~4.5MB prod body cap breaks the Server Action path) + staging-path orphan cleanup
- Enable pg_cron on Supabase (LIST-09 auto-expiry flip) + CRON_SECRET on Vercel for the near-expiry notifier
- Production Supabase project + per-env credentials; own-domain Resend SMTP; Twilio upgrade + Geo US/CA allowlist

**Stakeholder-requested**
- Part-category catalog (~600 lines, check.md) — pending stakeholder confirmation, seeds `part_categories`

### Out of Scope

- Payments / checkout / escrow — v2. v1 connects buyer and seller; the sale happens off-platform and the seller marks "Sold".
- Seller reputation / ratings system (REP-01/02) — requested, kept v2.
- Native mobile app — web-first.
- The platform is not a payment processor or shipping carrier; Shipping Assistance is human-assisted referral, not automated logistics.

## Context

- **Domain:** North American heavy-truck aftermarket and take-off parts (Peterbilt, Kenworth, Freightliner, Western Star, Volvo, Mack, International, and more). Buyers and sellers are truckers, shops, and enthusiasts who use specific slang and care deeply about exact fitment.
- **Differentiator vs. Facebook/Craigslist:** the multi-path fitment library + Fitment Intelligence means one part surfaces across every applicable truck model, configuration, body style, and trucker term.
- **Privacy is a feature, not a setting:** enforced structurally — `profiles_public` / `profiles_private` split, RLS default-deny, server-only service-role key, server-side EXIF/GPS strip.
- **Shape:** ~70% marketplace, ~30% specialized social network.
- **UI language:** all user-facing copy in English (NA market); stakeholder conversation in Spanish.

## Constraints

- **Tech stack**: Next.js 16 (App Router) + React 19 + Supabase (Postgres 17, Auth, Realtime, Storage) + Tailwind v4 + shadcn/ui — new standalone app, not built on the existing 12GA Customs stack.
- **No payments in v1**: money is handled off-platform.
- **Privacy guarantee**: seller PII must never be queryable or renderable on any public surface (architectural invariant, re-verified per phase).
- **Communication logging**: every buyer→seller contact persisted and admin-copied before chat opens.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js + Supabase | Realtime chat, managed Postgres, Auth, Storage out of the box | ✓ Good — entire v1 shipped with zero custom backend infra |
| New standalone app (not on 12GA Customs) | Different product and stack; clean separation | ✓ Good |
| No payments in v1 | Ship faster; sale completes off-platform | ✓ Good — v1 shipped in 12 days |
| Contact = form first → then chat | Persist + admin copy before thread opens (abuse base) | ✓ Good — invariant #5 held through UAT |
| Public comments in v1 | Drives the 30% social experience | ✓ Good |
| Verified Seller in v1 | Trust signal at launch | ✓ Good — Twilio Verify; trial limits remain pre-launch item |
| Comprehensive planning depth | Complex domain warranted it | ✓ Good — 57 plans, 1 inserted phase, no rework-driven rollbacks |
| My Garage in v1 (own phase) | Powers fits-my-truck + seller pre-fill | ✓ Good |
| Privacy by table split + RLS default-deny | Structural, not disciplinary | ✓ Good — PII contract tests green every phase |
| Postgres FTS + pg_trgm (no external search) | One less system; slang via `search_synonyms` data | ✓ Good — required definer-izing search RPCs under RLS (migration 0023) |
| Server Action photo upload | Simple v1 path | ⚠️ Revisit — Vercel ~4.5MB prod cap; pre-launch switch to signed-URL-direct |
| Supabase Realtime Postgres Changes for chat | RLS-applied per-row; Broadcast-compatible schema | ✓ Good — realtime regression green at final UAT |
| seller_type informational-only; username = opt-in display name | Stakeholder check.md review | ✓ Good |
| Rebrand to "OG Truck Parts" | Stakeholder-provided brand identity (neon truck-stop logo + mockups) | — Pending |
| v1.1 redesign is visual-only | Same functionality, new skin; mockup-only elements (cart, payments, phone) excluded | — Pending |

---
*Last updated: 2026-06-12 after starting milestone v1.1*
