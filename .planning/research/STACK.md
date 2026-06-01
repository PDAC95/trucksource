# Stack Research

**Domain:** Privacy-first, fitment-driven truck-parts online marketplace (Next.js + Supabase)
**Researched:** 2026-06-01
**Confidence:** HIGH (core stack + versions verified against official sources/npm as of June 2026)

> **Prescriptive intent:** The stack (Next.js App Router + Supabase + Tailwind + shadcn/ui) is already decided. This document makes it exact — pinned versions, one library per concern, and explicit "do not use" calls. Where the decided constraint conflicts with the current 2025/2026 ecosystem standard, it is flagged (see the Next.js version note below).

---

## ⚠️ Version Decision That Needs a Call: Next.js 15 vs 16

PROJECT.md specifies **Next.js 15 (App Router)**. As of June 2026, **Next.js 16 is the current stable line (16.2.x)** and the App Router API is essentially the same. Key differences relevant to this project:

- Next.js 16 makes **Turbopack the default bundler** (dev + prod), with stable filesystem caching — faster builds, no config needed.
- React 19 is the minimum for both 15 and 16, so the component model is identical.
- `@supabase/ssr`, shadcn/ui, Tailwind v4, RHF, and Zod all support 16.
- Async request APIs (`cookies()`, `headers()`, `params`, `searchParams` are `await`-ed) landed in 15 and remain in 16 — this is the single biggest "gotcha" carried into both.

**Recommendation: build on Next.js 16 (latest stable) using the App Router.** "Next.js 15 App Router" in PROJECT.md should be read as "Next.js App Router, latest stable" — there is no architectural reason to pin to 15, and 16 is what a greenfield 2026 project should start on. If a hard external constraint forces 15, pin `next@15.5.x` (last 15.x); everything else below is unchanged. **Confidence: HIGH.**

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Next.js (App Router)** | `16.2.x` (or `15.5.x` if forced) | Full-stack React framework: SSR/RSC pages, Server Actions, route handlers, middleware | The default 2026 framework for Supabase apps. Server Components keep seller PII server-side by default; Server Actions handle listing/contact form mutations without a separate API layer; middleware is exactly where Supabase session refresh belongs. **HIGH** |
| **React** | `19.x` | UI runtime | Required minimum for Next 15/16. Server Components + `useActionState`/`useFormStatus` pair perfectly with Server Actions for the listing and contact forms. **HIGH** |
| **TypeScript** | `5.7+` | Type safety end-to-end | Supabase generates DB types via CLI; Zod infers form types. Non-negotiable for a relational-heavy app. **HIGH** |
| **Supabase** | Platform (hosted) | Postgres + Auth + Realtime + Storage | One managed backend covers the four hard requirements (relational fitment, RLS privacy, realtime chat, photo storage) with minimal custom backend. **HIGH** |
| **PostgreSQL** | `15+` (Supabase-managed, currently PG 17) | Relational store + search engine | The fitment library is deeply relational AND needs fuzzy/slang search. Postgres does both natively (FTS + `pg_trgm`) — no external search service needed at this scale. **HIGH** |

### Supabase Client Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@supabase/supabase-js** | `2.106.x` | Core JS client (DB, auth, storage, realtime) | Always. Base SDK. **HIGH** |
| **@supabase/ssr** | `0.10.x` | Cookie-based SSR auth for Next.js App Router | Always, for this project. Creates browser + server clients, handles cookie-based sessions in Server Components, route handlers, and middleware. **This is the only supported SSR auth path.** **HIGH** |
| **supabase** (CLI) | `2.x` (dev dependency) | Local dev, migrations, `gen types typescript` | Dev/CI. Run migrations as versioned SQL files; generate TS types from the schema. **HIGH** |

> **Critical:** Do NOT use `@supabase/auth-helpers-nextjs` — it is **deprecated**. `@supabase/ssr` replaces it. In server code, authenticate with **`supabase.auth.getClaims()`** (verifies the JWT signature against the project's published keys on every call), **not** `getSession()` (which trusts unverified cookie data). Source: Supabase server-side auth docs.

### UI Layer

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Tailwind CSS** | `4.2.x` | Utility-first styling | Always. v4 uses the CSS-first `@theme` config (no `tailwind.config.js` JS object required), OKLCH colors, ~5x faster builds. shadcn/ui is fully aligned with v4. **HIGH** |
| **shadcn/ui** | latest (CLI-installed components, not a versioned dep) | Copy-in accessible component primitives | Always. Components are copied into your repo (you own them), built on Radix UI + Tailwind. Use the CLI (`npx shadcn@latest add ...`) to scaffold Form, Dialog, Input, Select, Command (for the fitment combobox/search), Badge (Verified Seller), Sonner (toasts). **HIGH** |
| **Radix UI** | (pulled in by shadcn components) | Unstyled accessible primitives | Transitively. Don't install standalone unless a component isn't covered by shadcn. **HIGH** |
| **lucide-react** | latest | Icon set | Default icon set shadcn uses. **HIGH** |
| **@tailwindcss/postcss** | `4.2.x` | PostCSS plugin for Tailwind v4 | Build pipeline (replaces the old `tailwindcss` + `autoprefixer` + `postcss` trio config). **HIGH** |

### Forms & Validation

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **react-hook-form** | `7.76.x` | Performant form state | All forms: listing creation (large, multi-section), registration, contact-seller, admin. Minimal re-renders matters on the big listing form. **HIGH** |
| **zod** | `4.4.x` | Schema validation + TS inference | Define each form/DB-input schema once; reuse on client (RHF) AND server (Server Action revalidation). Zod 4 is stable, ~57% smaller, much faster than v3. **HIGH** |
| **@hookform/resolvers** | `5.x` | Bridges Zod → RHF | Use `zodResolver` from `@hookform/resolvers/zod`. v5 supports Zod 4. **HIGH** |

> **Validate on the server too.** Client-side Zod is UX only. Re-run the same Zod schema inside the Server Action before writing to Postgres — never trust the client, especially for the contact form (which must persist + copy to admin) and listing inputs.

### Search (Fitment + Trucker Slang)

| Technology | Version | Purpose | When to Use |
|------------|---------|---------|-------------|
| **Postgres Full-Text Search** (`tsvector`/`tsquery`, `GIN`) | built-in | Tokenized, ranked search over titles/descriptions/part numbers | Primary relevance-ranked search across listing text + aggregated fitment terms. **HIGH** |
| **pg_trgm** extension | built-in (enable) | Trigram fuzzy/typo-tolerant matching | Slang and misspellings ("Aerodyne", "359 Guys", "Flat Glass Kenworth", "W900L"), short-string similarity, autocomplete. **HIGH** |
| **unaccent** extension | built-in (enable) | Strip accents for search | Bilingual user base (Spanish comments in PROJECT.md examples). Normalize "¿disponible?" / accented input. **MEDIUM** |

> **Do NOT reach for Elasticsearch/Algolia/Meilisearch in v1.** Postgres FTS + `pg_trgm` covers fuzzy + slang + ranking for a single-language-ish catalog at marketplace-launch scale. Adding an external search engine means a sync pipeline and another moving part with no payoff yet. Revisit only if catalog size or query complexity outgrows Postgres. **HIGH.**

### Realtime Chat & Comments

| Feature | Mechanism | Purpose | Notes |
|---------|-----------|---------|-------|
| **Supabase Realtime — Postgres Changes** | built-in | In-site buyer↔seller chat (persisted messages) | Messages are stored in a `messages` table; clients subscribe to inserts on their thread. **Realtime applies table RLS automatically** — users only receive rows they're allowed to see. **HIGH** |
| **Supabase Realtime — Presence** | built-in | Online status / typing indicators (optional v1) | Share one channel with the chat subscription to limit WebSocket count. **MEDIUM** |
| **Supabase Realtime — Broadcast** | built-in | (Future) ephemeral signals at scale | Supabase now recommends Broadcast over Postgres Changes for high-scale fan-out. For v1 launch volumes, Postgres Changes is simpler and correct; design the `messages` table so you can switch to "Broadcast from a trigger" later without schema churn. **MEDIUM** |

> Public comments on listings are **not** realtime-critical — store in a `comments` table, render server-side, and optionally subscribe via Postgres Changes for live updates. RLS makes comments world-readable but write-restricted to authenticated users.

### Images / Storage

| Technology | Purpose | Notes |
|------------|---------|-------|
| **Supabase Storage** | Listing photo storage (buckets) | RLS-style storage policies control who can upload/read. Use a public bucket for listing photos (they're meant to be seen) with owner-only write policies. **HIGH** |
| **Supabase Storage Image Transformations** (ImgProxy-backed) | On-the-fly resize/compress/WebP | `render/image/...?width=&quality=` endpoint. Serve thumbnails for the feed, full-size on detail pages, auto-WebP to cut egress. **Note: requires Pro plan.** **HIGH** |
| **next/image** | Optimized rendering + lazy loading | Use a custom Supabase image **loader** so `next/image` delegates resizing to Supabase transforms (avoids double-optimization). Whitelist the Supabase domain in `next.config` `images.remotePatterns`. **HIGH** |
| **browser-image-compression** | Client-side pre-upload compression | OPTIONAL. Truckers upload large phone photos; compress to a sane max dimension client-side before upload to save bandwidth and storage. **MEDIUM** |

> If staying on the Supabase free tier (no Image Transformations), do client-side compression + generate a thumbnail at upload time, OR use `next/image`'s built-in optimizer pointed at the raw Storage URL. Decide based on plan.

### Auth Specifics (per PROJECT.md requirements)

| Requirement | Mechanism | Notes |
|-------------|-----------|-------|
| Email/password + email verification | Supabase Auth (email provider, "Confirm email" on) | Built-in. **HIGH** |
| Phone verification for Verified Seller | Supabase Auth Phone OTP via **Twilio Verify** (or MessageBird/Vonage) | Use `auth.updateUser({ phone })` → `auth.verifyOtp(...)` to attach + verify a phone to an existing email account. Requires an SMS provider (Twilio Verify recommended; needs Account SID, Auth Token, Verify Service SID). **HIGH** |
| Verified badge logic | App-level: `verified_email && verified_phone && accepted_terms` → set a `verified_seller` flag/column | Compute server-side; expose only the boolean publicly. **HIGH** |

### Deployment & Env

| Tool | Purpose | Notes |
|------|---------|-------|
| **Vercel** | Hosting Next.js | First-class Next.js host; preview deployments per PR; native env-var management per environment (Development/Preview/Production). **HIGH** |
| **Vercel env vars** | Secrets/config | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public, RLS-protected). Keep `SUPABASE_SERVICE_ROLE_KEY` **server-only** (never `NEXT_PUBLIC_`), used only in trusted server code (e.g. admin copy of contact messages, admin operations). **HIGH** |
| **Supabase CLI migrations** | Schema as code | Version SQL migrations in repo; apply via CI. Keep RLS policies in migrations so the privacy model is reviewable and reproducible. **HIGH** |

---

## Installation

```bash
# Scaffold (Next.js latest stable + App Router + TS + Tailwind v4 + shadcn-ready)
npx create-next-app@latest takeoff-parts --typescript --tailwind --app --eslint

# Supabase client + SSR auth
npm install @supabase/supabase-js @supabase/ssr

# Forms & validation
npm install react-hook-form zod @hookform/resolvers

# Icons (shadcn default) + optional client-side image compression
npm install lucide-react browser-image-compression

# shadcn/ui (initialize, then add components as needed)
npx shadcn@latest init
npx shadcn@latest add form input select textarea button dialog command badge sonner card

# Dev dependencies
npm install -D supabase   # CLI (or use it via npx)
```

```sql
-- Enable search extensions (in a migration)
create extension if not exists pg_trgm;
create extension if not exists unaccent;
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Zod 4 | Zod 3 | Only if a dependency hard-pins Zod 3. `@hookform/resolvers` v5 supports both; greenfield → Zod 4. |
| react-hook-form | TanStack Form / Conform | RHF is the shadcn-blessed default and battle-tested with Server Actions. TanStack Form is viable but adds learning cost with no clear win here. |
| Postgres FTS + pg_trgm | Algolia / Meilisearch / Elasticsearch | Only when catalog scale or query sophistication (typo+synonym+facet ranking at very high volume) outgrows Postgres. Adds a sync pipeline — defer past v1. |
| Realtime Postgres Changes | Realtime Broadcast (trigger-driven) | Switch when concurrent chat volume makes per-client RLS-checked change streams a bottleneck. Design schema now so the migration is non-breaking. |
| Supabase Image Transformations | Next.js built-in optimizer / Cloudinary | Use Next optimizer on free tier; Cloudinary only if you need advanced editing/DAM features (overkill for v1). |
| Supabase Auth phone (Twilio Verify) | MessageBird / Vonage | Pick by SMS pricing/coverage in target countries (US/Canada/Mexico). Mechanism identical. |
| Next.js 16 | Next.js 15.5 | Only if an external constraint mandates 15. No architectural difference for this app. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **@supabase/auth-helpers-nextjs** | Deprecated; not maintained for App Router | `@supabase/ssr` |
| **`supabase.auth.getSession()` in server code for authz** | Trusts unverified cookie data; can be spoofed | `supabase.auth.getClaims()` (verifies JWT signature every call) |
| **Single `users`/`profiles` table holding PII + public fields** | One leaky RLS policy or `select *` exposes name/phone/email/address — violates the core privacy guarantee | **Separate tables**: public `profiles` (username, state, country, member-since, active-listing count) vs private `seller_private` (first/last name, email, phone, address) with strict owner-only RLS. The PRIVACY model depends on this split. |
| **Client-side filtering to "hide" PII** | Data still travels to the browser; RLS is the only real boundary | Enforce with **RLS policies + table separation**; never send PII columns to public surfaces at all |
| **Service-role key in client/`NEXT_PUBLIC_` env** | Bypasses RLS entirely — full data exposure | Keep service-role key server-only; use anon key (RLS-bound) in the browser |
| **`LIKE '%term%'` for fitment/slang search** | No index usage, slow at scale, no typo tolerance | `pg_trgm` similarity + GIN index for fuzzy; `tsvector` for ranked FTS |
| **`tailwind.config.js` JS-object theming (v3 style)** | Tailwind v4 is CSS-first via `@theme` | Define theme tokens in `globals.css` under `@theme` (shadcn v4 convention) |
| **A separate Express/Nest API server** | Redundant with Server Actions + route handlers + RLS; more to host/secure | Next.js Server Actions + route handlers; Postgres RLS as the authorization layer |
| **Storing chat as ephemeral Broadcast-only in v1** | PROJECT.md requires persisted, admin-copyable communication logs | Persist messages in a `messages` table (Postgres Changes for realtime); contact-form submission persists first, then opens the thread |

---

## Stack Patterns by Variant

**If on Supabase free tier (no Image Transformations):**
- Compress client-side (`browser-image-compression`) + generate a thumbnail at upload, OR use `next/image` built-in optimizer against raw Storage URLs.
- Because: Image Transformations require Pro plan.

**If chat concurrency grows large:**
- Move from Realtime Postgres Changes to **Broadcast emitted from a DB trigger** on `messages`.
- Because: Supabase recommends Broadcast for high-scale fan-out; per-client RLS-checked change streams don't scale as well.

**If forced to Next.js 15:**
- Pin `next@15.5.x`; everything else identical.
- Because: App Router API and all listed libraries are compatible across 15/16.

---

## The Privacy Model (load-bearing — call out for roadmap)

The privacy guarantee ("seller PII never queryable/renderable on any public surface") is **a data-modeling decision, not a UI decision**. Prescriptive shape:

- `auth.users` — Supabase-managed identity.
- `profiles` (PUBLIC-readable via RLS): `id`, `username`, `state_province`, `country`, `member_since`, `verified_seller` (bool), `active_listings_count`. **No PII columns exist here.**
- `seller_private` (OWNER-ONLY via RLS): `user_id`, `first_name`, `last_name`, `email`, `phone`, `address`, `postal_code`. RLS: `auth.uid() = user_id` for select/update; no public/anon access.
- `contact_messages` / `messages`: persisted; RLS limits visibility to the two participants; a server-side (service-role) path copies each contact to admin for abuse/dispute logging (PROJECT.md requirement).
- Public surfaces (`profiles`, `listings`, `comments`) must **physically not contain** PII columns — so even a misconfigured policy can't leak a name or phone.

**Confidence: HIGH** that the separate-table pattern is the correct, Supabase-recommended approach for this exact requirement.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@16.2.x` | `react@19`, `react-dom@19` | React 19 is the minimum for Next 15/16. |
| `@supabase/ssr@0.10.x` | `@supabase/supabase-js@2.106.x`, Next 15/16 App Router | Use together; ssr depends on supabase-js as peer. |
| `@hookform/resolvers@5.x` | `react-hook-form@7.76.x`, `zod@4.4.x` | v5 resolver supports Zod 4 (and still Zod 3). |
| `tailwindcss@4.2.x` | `@tailwindcss/postcss@4.2.x`, shadcn/ui (v4 components), React 19 | shadcn components are updated for Tailwind v4 + React 19; HSL→OKLCH. |
| Supabase Image Transformations | Pro plan and above | Free tier: use Next optimizer / client compression. |

---

## Sources

- `/vercel/next.js` (Context7) — Next.js version availability (15.x, 16.x stable confirmed)
- `/supabase/ssr`, `/supabase/supabase` (Context7) — SSR client + platform docs
- https://nextjs.org/blog/next-16 — Next.js 16 stable, Turbopack default, React Compiler — **HIGH**
- https://endoflife.date/nextjs — version lifecycle — **MEDIUM**
- https://supabase.com/docs/guides/auth/server-side/nextjs — `@supabase/ssr` setup, `getClaims` vs `getSession`, auth-helpers deprecation — **HIGH**
- https://supabase.com/docs/guides/database/postgres/row-level-security + supabase discussion #36429 — separate public/private table pattern for PII — **HIGH/MEDIUM**
- https://supabase.com/docs/guides/realtime/postgres-changes + /broadcast — chat = Postgres Changes (persisted) + RLS-applied; Broadcast for scale — **HIGH**
- https://supabase.com/docs/guides/storage/serving/image-transformations — ImgProxy transforms, WebP, Next.js loader, Pro-plan requirement — **HIGH**
- https://supabase.com/docs/guides/auth/phone-login — phone OTP, Twilio Verify/MessageBird/Vonage — **HIGH**
- https://www.postgresql.org/docs/current/pgtrgm.html + Cockroach/Aapeli Vuorinen articles — FTS vs trigram, hybrid recommended for catalog/slang — **HIGH/MEDIUM**
- https://www.postgresql.org/docs/current/ltree.html + Ackee/Fueled — hierarchy modeling (adjacency list start, closure table for read-heavy filters) — **MEDIUM**
- https://ui.shadcn.com/docs/tailwind-v4 + https://tailwindcss.com/blog/tailwindcss-v4 — shadcn on Tailwind v4, `@theme`, OKLCH — **HIGH**
- npm (via search): `@supabase/supabase-js@2.106.2`, `@supabase/ssr@0.10.3`, `react-hook-form@7.76.0`, `zod@4.4.3`, `tailwindcss@4.2.0` — current as of June 2026 — **HIGH**
- https://github.com/react-hook-form/resolvers — resolvers v5 supports Zod 4 + Zod 3 — **HIGH**

---
*Stack research for: privacy-first truck-parts fitment marketplace*
*Researched: 2026-06-01*
