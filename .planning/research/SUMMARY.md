# Project Research Summary

**Project:** Take-Off Parts (privacy-first truck-parts marketplace)
**Domain:** Privacy-first, fitment-driven truck-parts online marketplace (~70% marketplace, ~30% specialized social network)
**Researched:** 2026-06-01
**Confidence:** HIGH

## Executive Summary

This is a **server-first Next.js (App Router) + Supabase marketplace** for take-off heavy-truck parts, sitting at the intersection of three established categories — P2P classifieds (FB Marketplace/Craigslist/OfferUp), auto-parts e-commerce (eBay Motors/FinditParts), and social commerce (public Q&A + private chat). Experts build this exact shape as a monolith with **no separate API server**: Supabase provides Postgres, Auth, Realtime, and Storage; Next.js Server Components read through RLS, Server Actions handle mutations, and `middleware.ts` refreshes the session. The defining architectural decision is that **Postgres Row Level Security is the security boundary** — the database protects itself, so privacy holds even when app code has a bug.

The product's defensible edge is a **combination no competitor offers**: a deep 8-level fitment library (Make → Model → Configuration → Common Search Terms → Part Categories → Materials → Condition → Special Filters, plus "The Barnyard"), trucker-slang search, rules-based Fitment Intelligence auto-suggest, hard PII separation, and a form-first → private-chat contact flow. The fitment taxonomy + slang dictionary is a curation moat that's hard to copy. The recommended stack is mature and prescriptive: Next.js 16 (App Router; treat "Next 15" in PROJECT.md as "latest stable"), React 19, TypeScript, `@supabase/ssr` (NOT the deprecated auth-helpers), Tailwind v4 + shadcn/ui, react-hook-form + Zod 4, and **Postgres FTS + `pg_trgm`** for search (no Algolia/Elastic at this scale).

The central risk is **PII leakage**, which is existential rather than incidental here — the whole value proposition is "the seller's real identity is never exposed." Mitigation is structural, not disciplinary: physically split `profiles_public` (world-readable) from `profiles_private` (owner-only RLS) so PII *cannot* be reached from public surfaces, enable RLS default-deny on every table, keep the service-role key server-only, use `getUser()`/`getClaims()` (never `getSession()`) in server code, and **strip EXIF/GPS from every uploaded photo server-side**. Secondary risks — fitment false positives, contact/chat abuse, SMS-pumping on phone OTP, and two-sided cold start — each have known, documented mitigations that must be designed in from the relevant phase, not bolted on later.

## Key Findings

### Recommended Stack

The stack is already decided and the research makes it exact: a Next.js App Router monolith on Supabase, with one library per concern and explicit "do not use" calls. Postgres does double duty as both the relational fitment store and the search engine (FTS + trigram), eliminating an external search service. The single open decision is Next.js 15 vs 16 — research recommends **16 (latest stable)** since the App Router API is identical and there's no architectural reason to pin to 15. See `STACK.md` for pinned versions and full rationale.

**Core technologies:**
- **Next.js 16 (App Router) + React 19** — Server Components keep PII server-side by default; Server Actions handle mutations without a separate API; middleware is where Supabase session refresh belongs.
- **Supabase (Postgres 17 + Auth + Realtime + Storage)** — one managed backend covers all four hard requirements (relational fitment, RLS privacy, realtime chat, photo storage).
- **`@supabase/ssr` + `@supabase/supabase-js`** — the *only* supported SSR auth path; authenticate server-side with `getClaims()`/`getUser()`, never `getSession()`.
- **Postgres FTS (`tsvector`/GIN) + `pg_trgm` + `unaccent`** — ranked full-text plus typo/slang-tolerant fuzzy matching, no external search engine.
- **Tailwind v4 + shadcn/ui + react-hook-form + Zod 4** — CSS-first theming, owned components, and one Zod schema validated on both client (UX) and server (trust boundary).

### Expected Features

The product is ~70% marketplace, ~30% specialized social network. Per PROJECT.md the entire "Active" set is v1, so nearly everything is P1 — the differentiation is in *build order* (dependency-driven), not in cutting scope. See `FEATURES.md` for the full matrix.

**Must have (table stakes):**
- Auth (email + verification), create listing with multi-photo upload, browse feed, keyword + faceted search
- Listing detail, contact seller, in-site messaging, save/bookmark, mark-as-sold, public seller profile
- Basic admin (manage users/listings), report listing/user, mobile-responsive web, disclaimers/terms

**Should have (competitive differentiators):**
- **8-level fitment library + "The Barnyard"** — the keystone differentiator and hardest data-modeling task
- **Trucker-slang / Common Search Terms search** — synonym/alias layer over the library
- **Fitment Intelligence auto-suggest** (rules/lookup-based in v1, not ML)
- **Hard PII-separation privacy model** — a feature guaranteed by architecture, not a setting
- **Form-first → private in-site chat** (persist contact + admin copy *before* opening the thread)
- **Public comments**, **Verified Seller badge** (email + phone + terms), **Shipping Availability** field, **Admin Analytics** (most-searched makes/models closes the curation loop)

**Defer (v2+):**
- Payments/checkout/escrow, multi-axis seller ratings, native mobile app, AI/ML moderation, automated logistics/freight quoting — all explicit out-of-scope; reporting/moderation is **NOT** deferrable.

### Architecture Approach

A server-first App Router app with Supabase as the entire backend; RLS is the privacy boundary. Route groups physically separate `(public)` / `(app)` / `admin` surfaces by trust level so public components literally cannot import PII queries. The service-role client is isolated to one `server-only` module used solely by admin/trusted webhooks. See `ARCHITECTURE.md` for the data model, RLS policies, and data flows.

**Major components:**
1. **Public surfaces** (feed, search, listing detail, public profile) — Server Components reading `profiles_public`/`listings` through RLS; PII tables return nothing.
2. **Privacy split** (`profiles_public` world-readable vs `profiles_private` owner-only) — two tables keyed on `auth.users.id`; the load-bearing design decision.
3. **Fitment taxonomy + join tables** — 8 reference dimensions, many-to-many `listing_*` joins, one `search_listings` RPC (FTS + trigram).
4. **Fitment Intelligence** — a data-driven `fitment_rules` table + suggestion service (seller confirms, never auto-applies).
5. **Contact → chat + social** — `contact_log` (persist + admin copy) → `message_threads`/`messages` via Realtime **Broadcast**; `comments` + `saved_listings` for the social layer.
6. **Admin console** — Ops + Analytics, service-role-isolated, pre-aggregated via `pg_cron`/materialized views.

### Critical Pitfalls

Ordered most-product-fatal first; PII leakage is existential here. See `PITFALLS.md` for warning signs, recovery, and the "Looks Done But Isn't" checklist.

1. **PII leaks via `select('*')` / nested `profiles(*)` joins** — physically split public/private tables, ban `select('*')` on user data, REVOKE PII columns from anon/authenticated, and contract-test that anon listing fetches contain no PII keys.
2. **RLS disabled/too permissive (CVE-2025-48757 class)** — enable RLS default-deny on *every* table at creation (the anon key is public, RLS is the only guard); scope every authenticated policy with `(select auth.uid()) = user_id`; add a CI assertion over `pg_policies`.
3. **Service-role key reaches the client** — name it `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_`), use a dedicated `supabase-js` admin client in a `server-only` module, scan the built bundle in CI.
4. **EXIF GPS in listing photos leaks exact location** — strip ALL metadata server-side by re-encoding every upload with `sharp` (no `.withMetadata()`); automated no-GPS regression test. The single most important "looks done but isn't" check.
5. **Fitment search slow/wrong + Intelligence false positives** — model slang as a synonym table (not query hacks), use GIN-indexed FTS + trigram (verify with `EXPLAIN ANALYZE`), and make Fitment Intelligence a seller-confirmed suggestion tuned for precision over recall, with "report wrong fitment."

Also significant: Next.js caching serving one user's private data to another (use `getUser()`, mark personalized routes dynamic); contact/chat abuse (rate limits + report button + admin moderation queue in v1); SMS-pumping on phone OTP (rate limit + CAPTCHA + geo allowlist + spend cap); two-sided cold start (seed supply first, concentrate on one make/region).

## Implications for Roadmap

Based on combined research, the dependency chain is strict and dictates the phase order: **RLS scaffolding → privacy split → fitment taxonomy** must precede listings; **listings** must precede search, social, and contact/chat; **admin** comes last. Cross-cutting constraints (PII separation, RLS-on-every-table, EXIF strip, event logging) are gates re-verified in each phase, not standalone phases.

### Phase 1: Foundation & Privacy Model
**Rationale:** Nothing is safe to build until session + RLS scaffolding and the public/private table split exist; retrofitting privacy is the #1 way this product breaks its promise.
**Delivers:** Supabase project, `@supabase/ssr` clients + `middleware.ts`, RLS-default-deny baseline, `profiles_public`/`profiles_private` split, registration (custom/system username).
**Addresses:** Auth + accounts, public seller profile, PII separation.
**Avoids:** Pitfalls 1, 2, 3, 6 (PII over-fetch, RLS gaps, service-role exposure, cross-user caching).

### Phase 2: Verified Seller & Phone OTP
**Rationale:** Verification is the launch trust signal and the only net-new infra vs basic auth; the OTP send endpoint is an abuse target that must be hardened before exposure.
**Delivers:** Email + phone OTP (Twilio Verify) + terms acceptance → `is_verified` badge computed server-side.
**Uses:** Supabase Auth phone login, Twilio Verify (Fraud Guard).
**Avoids:** Pitfall 10 (SMS pumping — rate limit + CAPTCHA + geo allowlist + spend cap).

### Phase 3: Fitment Taxonomy & Slang Library
**Rationale:** The keystone dependency — listings, search, slang, Intelligence, and analytics all require it. Its schema quality caps everything downstream.
**Delivers:** 8 reference tables + Barnyard + `search_synonyms` alias table; seed data for the launch make/region.
**Implements:** Fitment taxonomy component (many-to-many model mirroring simplified ACES).
**Avoids:** Pitfall 7a/7b (slang modeled as data, not query hacks).

### Phase 4: Listings, Photos & EXIF-Safe Storage
**Rationale:** Depends on auth (seller_id) and taxonomy (tags); the central marketplace object.
**Delivers:** Create/edit/sell listings, full public field set, multi-photo upload with server-side EXIF strip + re-encode, `listing_*` join tables, Shipping Availability field.
**Implements:** Listing service + Storage.
**Avoids:** Pitfall 4 (EXIF GPS — server-side `sharp` re-encode + no-GPS test), Pitfall 5 (Server/Client boundary — narrow shapes).

### Phase 5: Fitment Intelligence
**Rationale:** Requires a populated library and listings; quality is a direct function of library completeness.
**Delivers:** `fitment_rules` table + suggestion service; seller-confirmed (never auto-applied) suggestions with confirmed-vs-inferred labeling.
**Avoids:** Pitfall 7 (false positives — precision over recall, seller confirm, report-wrong-fitment).

### Phase 6: Search, Feed & Public Profile
**Rationale:** Depends on listings being taggable; the primary buyer entry point and the differentiator's payoff.
**Delivers:** `search_listings` RPC (FTS + `pg_trgm`), facet UI, browse feed, public profile rendering, search/view event logging instrumented from day one.
**Avoids:** Pitfall 7 perf (GIN indexes, `EXPLAIN ANALYZE` confirms index use), Pitfall 1 (no PII on public surfaces).

### Phase 7: Social Layer (Comments & Saves)
**Rationale:** Depends on listings; the 30% social framing, lighter than the contact flow.
**Delivers:** Public username-attributed comments (with report/remove hooks), save/bookmark, mark-as-sold.
**Avoids:** Pitfall 1 (commenter shown by username only).

### Phase 8: Contact → Private Chat
**Rationale:** Depends on listings + auth; the trust spine. `contact_log` + admin copy MUST persist before the thread opens.
**Delivers:** Form-first contact (persist + admin copy), `message_threads`/`messages`, Realtime Broadcast delivery + Presence, rate limiting, block/report.
**Avoids:** Pitfall 8 (abuse — rate limits, report button, behavior-aware filtering), Anti-pattern: opening chat before persisting contact.

### Phase 9: Admin Operations & Analytics
**Rationale:** Comes last — needs all data existing to manage and measure; also provides the bulk-onboarding tooling that mitigates cold start.
**Delivers:** Ops console (users, listings, reports queue + enforcement, messages monitoring, categories, fitment) using the isolated service-role client; Analytics (pre-aggregated via `pg_cron`, including most-searched makes/models).
**Avoids:** Pitfall 3 (service-role isolation), Pitfall 8 (moderation queue + enforcement actions), Pitfall 9 (cold-start seeding tools).

### Phase Ordering Rationale

- **Strict dependency chain** discovered across all four files: privacy/RLS scaffolding → taxonomy → listings → (intelligence, search, social, contact) → admin. Each layer is unusable without the prior one.
- **Privacy and RLS are cross-cutting constraints, not phases** — verified as a gate in every phase that adds a table or public surface.
- **Event logging must start when search/listings ship** (Phases 4/6), even though the Analytics dashboard (Phase 9) comes later, or the data can't be reconstructed.
- **Cold-start mitigation pulls admin bulk-onboarding tooling earlier** within Phase 9 (or a slice of it) so supply can be seeded before buyer marketing.

### Research Flags

Phases likely needing deeper research (`/gsd:research-phase`) during planning:
- **Phase 3 (Fitment Taxonomy):** The heavy-truck taxonomy is novel (no clean ACES catalog for take-off parts); the hierarchical-vs-flat-tag modeling and slang curation need careful design. *(Architecture confidence MEDIUM here.)*
- **Phase 4 (EXIF-safe Storage):** Explicitly flagged by Pitfalls research as a priority — the strip-and-re-encode pipeline + automated GPS-tag verification is a "looks done but isn't" trap.
- **Phase 5 (Fitment Intelligence):** The precision/recall tradeoff and rules-table design directly affect the product's trust moat.
- **Phase 8 (Contact/Chat abuse):** Behavior-aware filtering + Realtime Broadcast-from-trigger pattern at scale warrant validation beyond the happy path.

Phases with standard, well-documented patterns (can likely skip research-phase):
- **Phase 1 (Foundation/Privacy):** `@supabase/ssr` + RLS public/private split is extensively documented (Supabase official docs) — HIGH confidence.
- **Phase 2 (Verified Seller/OTP):** Supabase phone login + Twilio Verify is a standard, documented integration.
- **Phase 7 (Social Layer):** Comments/saves are conventional CRUD over RLS-protected tables.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack + pinned versions verified against official docs/npm/Context7 as of June 2026; only open call is Next 15 vs 16 (recommend 16). |
| Features | MEDIUM-HIGH | Competitor sets verified across multiple sources; fitment standards verified vs eBay/ACES; privacy-model specifics are product-novel, reasoned from first principles. |
| Architecture | HIGH | Stack/RLS/Realtime/search patterns verified vs Supabase docs; fitment-taxonomy table design is an opinionated synthesis (MEDIUM). |
| Pitfalls | HIGH | PII/RLS/Next.js auth & caching verified vs official docs + CVE-2025-48757; fitment search, chat abuse, cold start, SMS fraud are MEDIUM (credible secondary sources). |

**Overall confidence:** HIGH

### Gaps to Address

- **Heavy-truck fitment taxonomy modeling:** No clean universal catalog exists for take-off parts; the 8-level hierarchy and the hierarchical-vs-flat-tag split are an in-house design that should be prototyped early and validated against real listings. *(Address in Phase 3 planning / research-phase.)*
- **Slang/synonym dictionary seeding:** The initial alias set ("359 Guys", "Aerodyne", "Flat Glass Kenworth") is curated by hand; completeness drives both search and Intelligence quality. *(Seed for one make/region first; expand from real search logs.)*
- **Fitment Intelligence precision tuning:** Rules-based v1 precision/recall behavior is unproven; needs the "report wrong fitment" feedback loop live to calibrate. *(Address in Phase 5; instrument feedback from launch.)*
- **Supabase plan decision (Image Transformations):** EXIF strip is mandatory regardless, but thumbnail/transform strategy differs free-tier vs Pro. *(Decide before Phase 4; affects upload pipeline.)*
- **Next.js version:** PROJECT.md says 15; research recommends 16. *(Confirm the call before scaffolding in Phase 1.)*

## Sources

### Primary (HIGH confidence)
- `/vercel/next.js`, `/supabase/ssr`, `/supabase/supabase` (Context7) — version availability, SSR client + platform docs
- https://supabase.com/docs/guides/auth/server-side/nextjs — `@supabase/ssr`, `getClaims`/`getUser` vs `getSession`, auth-helpers deprecation
- https://supabase.com/docs/guides/database/postgres/row-level-security — RLS, public/private split, default-deny, `(select auth.uid())`
- https://supabase.com/docs/guides/realtime/broadcast — Broadcast preferred over `postgres_changes` for chat at scale
- https://supabase.com/docs/guides/storage/serving/image-transformations — transforms, WebP, Next.js loader, Pro-plan requirement
- https://supabase.com/docs/guides/auth/phone-login — phone OTP via Twilio Verify
- https://www.postgresql.org/docs/current/pgtrgm.html — trigram fuzzy/slang matching
- https://export.ebay.com/en/growth/pa/vehicle-compatibility-fitment-guide-for-ebay-sellers/ — fitment / ACES (official eBay)
- CVE-2025-48757 reporting + https://www.twilio.com/en-us/blog/sms-pumping-fraud-solutions / Okta toll-fraud whitepaper — RLS exposure class + SMS pumping
- npm (June 2026): `@supabase/supabase-js@2.106`, `@supabase/ssr@0.10`, `react-hook-form@7.76`, `zod@4.4`, `tailwindcss@4.2`

### Secondary (MEDIUM confidence)
- https://blog.starmorph.com/blog/row-level-security-supabase-tables-nextjs — default-deny RLS + middleware refresh
- https://supabase.com/blog/postgres-full-text-search-vs-the-rest — FTS + trigram hybrid for marketplace search
- ACES/PIES guides (automotiveaftermarket.org, sparkshipping.com) — part↔vehicle M2M (simplified for heavy-truck)
- EXIF stripping guides (Mochify, Konvrt) + GHSA-q7f2-rv22-2xgr advisory — metadata leakage via upload
- Marketplace moderation/trust patterns (GetStream, Sharetribe, Sightengine, Meta)
- Cold-start tactics (NFX, Prometora) — two-sided seeding
- Competitor comparisons (FB/Craigslist/OfferUp, dedicated truck-parts marketplaces)

### Tertiary (LOW confidence)
- https://www.intelmarketresearch.com/classifieds-marketplace-market-35734 — classifieds fraud rates (directional only)

---
*Research completed: 2026-06-01*
*Ready for roadmap: yes*
