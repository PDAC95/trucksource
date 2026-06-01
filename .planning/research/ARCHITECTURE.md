# Architecture Research

**Domain:** Privacy-first truck-parts marketplace + lightweight social network (Next.js 15 App Router + Supabase)
**Researched:** 2026-06-01
**Confidence:** HIGH (stack + RLS + Realtime + search patterns verified against Supabase docs and ACES/PIES industry standards; fitment-taxonomy table design is an opinionated synthesis — MEDIUM)

## Standard Architecture

This is a **server-first Next.js App Router app with Supabase as the entire backend** (Postgres + Auth + Realtime + Storage). There is no separate API server. Postgres Row Level Security (RLS) is the security boundary — the database protects itself, so even if a query reaches a table it cannot return rows the caller isn't allowed to see. This is the single most important architectural decision because privacy is the product.

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │
│  │ Feed /     │  │ Listing    │  │ Chat       │  │ Admin Console  │  │
│  │ Search UI  │  │ Detail UI  │  │ (Realtime) │  │ (Ops+Analytics)│  │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └───────┬────────┘  │
│        │ browserClient │               │ WS               │           │
├────────┼───────────────┼───────────────┼──────────────────┼───────────┤
│                    NEXT.JS 15 (App Router) — server-first              │
│  ┌──────────────┐  ┌──────────────────┐  ┌────────────────────────┐   │
│  │ Server       │  │ Server Actions   │  │ Route Handlers         │   │
│  │ Components    │  │ (mutations:      │  │ (webhooks, contact     │   │
│  │ (read via RLS)│  │  list, contact,  │  │  intake, admin RPC)    │   │
│  │               │  │  comment, save)  │  │                        │   │
│  └──────┬───────┘  └────────┬─────────┘  └──────────┬─────────────┘   │
│         │ serverClient (cookie-bound, user JWT)     │ service role     │
│         │                   │                       │ (admin only)     │
│  ┌──────┴───────────────────┴───────────────────────┴─────────────┐   │
│  │  middleware.ts → refreshes session cookie on every request      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                      SUPABASE (managed backend)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ Postgres │ │  Auth    │ │ Realtime │ │ Storage  │ │ Edge Fns / │  │
│  │ + RLS    │ │ (JWT)    │ │(Broadcast│ │ (photos) │ │ pg_cron    │  │
│  │ + FTS    │ │          │ │ + Presence)│ │          │ │ (analytics)│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Public surfaces** (feed, search, listing detail, public profile) | Render only public data; never touch PII | Server Components reading through `serverClient`; RLS guarantees PII tables return nothing |
| **Auth & session** | Registration, login, session refresh, JWT issuance | Supabase Auth + `@supabase/ssr`; `middleware.ts` refreshes the cookie session on every request |
| **Listing service** | Create/edit/sell listings, attach photos, attach fitment tags | Server Actions writing to `listings` + `listing_fitment` join tables; Storage for photos |
| **Fitment taxonomy** | The 8-level library + Barnyard; source of truth for searchable dimensions | Normalized reference tables, mostly read-only (admin-managed) |
| **Fitment intelligence** | On listing creation, suggest applicable trucks/categories | Rules/mapping table + a suggestion service (Server Action or Edge Function) querying `fitment_rules` |
| **Search service** | Multi-path query across fitment + slang + FTS | Postgres FTS (`tsvector`) + `pg_trgm` for fuzzy/slang; one RPC (`search_listings`) |
| **Contact + chat** | Persist contact → copy admin/log → open realtime thread | Server Action writes `contact_log` + `message_threads` + first `message`; Realtime **Broadcast** for live delivery |
| **Social layer** | Public comments, saves/bookmarks, feed | Tables `comments`, `saved_listings`; feed = paginated query on `listings` |
| **Admin console** | Ops (users, listings, reports, messages, categories, fitment) + Analytics | Separate route group guarded by `is_admin`; analytics from pre-aggregated tables/materialized views |

## Recommended Project Structure

```
project/
├── app/
│   ├── (public)/                  # unauthenticated/public surfaces
│   │   ├── page.tsx               # feed
│   │   ├── search/page.tsx
│   │   ├── listings/[id]/page.tsx # detail + public comments
│   │   └── u/[username]/page.tsx  # public profile (NO PII)
│   ├── (auth)/
│   │   ├── login/  register/      # Supabase Auth flows
│   ├── (app)/                     # authenticated buyer/seller area
│   │   ├── sell/page.tsx          # create listing + fitment auto-suggest
│   │   ├── messages/              # in-site chat (Realtime)
│   │   ├── saved/page.tsx         # bookmarks
│   │   └── account/page.tsx       # edit private PII (self only)
│   ├── admin/                     # guarded by is_admin (route group)
│   │   ├── users|listings|reports|messages|categories|fitment/
│   │   └── analytics/
│   └── api/                       # Route Handlers (contact intake, webhooks)
├── lib/
│   ├── supabase/
│   │   ├── server.ts              # createServerClient (cookie-bound)
│   │   ├── client.ts              # createBrowserClient
│   │   ├── middleware.ts          # session refresh helper
│   │   └── admin.ts               # service-role client (server-only, admin)
│   ├── search/                    # query builders for search RPC
│   ├── fitment/                   # suggestion logic, taxonomy helpers
│   └── actions/                   # Server Actions (listings, contact, comments)
├── components/                    # shadcn/ui + feature components
├── middleware.ts                  # calls lib/supabase/middleware
└── supabase/
    ├── migrations/                # SQL schema + RLS policies (source of truth)
    └── seed.sql                   # fitment taxonomy + barnyard seed data
```

### Structure Rationale

- **Route groups `(public)` / `(app)` / `admin`:** physically separates surfaces by trust level. Public components are written to never import PII queries, reinforcing the RLS guarantee at the code level.
- **`lib/supabase/` split clients:** the cookie-bound `serverClient` (user JWT, RLS-enforced) is the default; the `admin.ts` service-role client lives in one file, server-only, used ONLY in `app/admin/` and trusted Route Handlers. Keeping it isolated prevents accidental RLS bypass.
- **`supabase/migrations/` as source of truth:** RLS policies are schema, not app code. They must be versioned in migrations so the privacy guarantee is reproducible and reviewable.

## Data Model

### Privacy Split (users / profiles) — the core design

Two-table split keyed on the same `auth.users.id`. PII lives in a private table that **anon/authenticated roles cannot read** (RLS allows only `self`); the public profile lives in a separate table readable by everyone.

```
auth.users (Supabase-managed)
   id (uuid, PK)
        │ 1:1            │ 1:1
        ▼                ▼
profiles_private        profiles_public
─────────────────       ─────────────────
id (PK = auth.uid)      id (PK = auth.uid)
first_name              username (unique)      ← custom or system-generated
last_name               state_province
email                   country
phone                   member_since
street_address          is_verified           ← email+phone+terms => badge
postal_code             contact_preference    ← email_only|email_phone|messaging
contact_pref_internal   (active_listing_count is DERIVED, not stored — count view)
terms_accepted_at
phone_verified_at
email_verified_at
```

**RLS policy intent:**

| Table | SELECT | INSERT/UPDATE |
|-------|--------|----------------|
| `profiles_private` | `TO authenticated USING (id = auth.uid())` — owner only; no public read EVER | owner only, with `WITH CHECK (id = auth.uid())` |
| `profiles_public` | `TO anon, authenticated USING (true)` — world-readable | owner only (`id = auth.uid()`), both `USING` + `WITH CHECK` |

Active-listing count is computed (`count(*)` of the owner's non-sold listings) via a view or a small aggregate, never a writable column — avoids drift and avoids exposing PII.

> **Why two tables, not "public vs private columns" on one table:** Postgres RLS is row-level, not column-level. Column privacy requires either column-level grants (brittle, easy to leak through `select *`) or views. A clean table split makes the privacy boundary structural: a public Server Component literally cannot reach PII because it queries `profiles_public`, and even a malicious direct query to `profiles_private` is denied by RLS. This is the safest, most auditable pattern. (Confirmed: views bypass RLS unless `security_invoker = true`; relying on a view for privacy is riskier than a separate table.)

### Fitment Taxonomy (8 levels + Barnyard)

The 8 levels are a mix of **hierarchical** (Make → Model → Configuration) and **flat tag dimensions** (Common Search Terms, Part Categories, Materials, Condition, Special Filters). A part is findable through MANY of these — pure many-to-many. This mirrors the auto-aftermarket ACES standard (a part fits many vehicle configs; a config accepts many parts), simplified for heavy-truck reality.

```
makes                models                configurations
──────               ──────                ──────────────
id (PK)              id (PK)               id (PK)
name (Peterbilt)     make_id (FK)          model_id (FK)
                     name (W900L)          name (Aerodyne / Flat-top / Day Cab)

search_terms (trucker slang)   part_categories       materials
───────────────────────────    ───────────────       ─────────
id (PK)                        id (PK)               id (PK)
term ("359 Guys",              parent_id (FK self,   name (Aluminum,
 "Flat Glass Kenworth")         optional hierarchy)   Stainless, Chrome…)
                               name

conditions          special_filters       (Barnyard = a sentinel category /
──────────          ───────────────        boolean flag on listing, "anything-goes")
id, name            id, name
(New, Used,
 Reman, Core)
```

**Listing ↔ fitment join tables** (one per dimension that can have multiple values per listing):

```
listings
────────
id (PK), seller_id (FK auth.uid), title, part_number, asking_price,
shipping_option (enum), status (active|sold), damage_notes, date_listed,
is_barnyard (bool), search_vector (tsvector, generated)

listing_models           listing_configs          listing_search_terms
──────────────           ──────────────           ────────────────────
listing_id (FK)          listing_id (FK)          listing_id (FK)
model_id (FK)            config_id (FK)           term_id (FK)
PK(listing_id,model_id)  PK(...)                  PK(...)

listing_categories   listing_materials   listing_conditions   listing_special_filters
(same shape)         (same shape)        (single or M2M)      (same shape)

listing_photos
──────────────
listing_id (FK), storage_path, sort_order
```

Make is reachable through `model_id → models.make_id`, so a per-listing `listing_makes` join is optional (derive from models, or denormalize for query speed).

**How search queries it:** one Postgres RPC `search_listings(filters, q)` that:
1. Starts from `listings` where `status = 'active'`.
2. `JOIN`/`EXISTS` against the relevant `listing_*` join tables for each selected facet (model, config, category, material, condition, special filter).
3. For free-text `q`: combine **FTS** on `listings.search_vector` (titles, part numbers, descriptions) with **`pg_trgm` similarity** against `search_terms.term` so slang/typos ("359 Guys", "Areodyne") still match.
4. Rank and paginate. Barnyard listings surface via `is_barnyard` or the Barnyard category.

> **Search engine choice (verified):** Postgres FTS handles structured text up to tens of millions of rows; `pg_trgm` covers fuzzy/partial/slang matching that FTS misses. The hybrid FTS + trigram approach is the documented Supabase recommendation for marketplace search — no external search engine (Algolia/Elastic) needed at this scale.

### Fitment Intelligence (auto-suggest)

A **rules/mapping table** drives suggestions; logic lives in a **suggestion service** (Server Action `lib/fitment/suggest.ts`, promotable to an Edge Function).

```
fitment_rules
─────────────
id (PK)
trigger_type   (part_category | search_term | model | part_number_pattern)
trigger_value  (e.g. category "Hoods")
implies_type   (model | config | category | search_term)
implies_value  (e.g. search_term "Long Hood Guys")
confidence     (for ranking suggestions)
```

Flow on listing creation: seller picks a category/model → suggestion service queries `fitment_rules` where the seller's selections are triggers → returns implied configs/terms/categories the seller can one-click accept → accepted suggestions become rows in the `listing_*` join tables. This is what makes one part appear in **every** relevant search. Keeping it as data (a rules table) rather than hardcoded logic lets admins extend coverage without code changes.

### Messaging (contact → chat) + Social

```
contact_log                 message_threads             messages
───────────                 ───────────────             ────────
id (PK)                     id (PK)                     id (PK)
listing_id (FK)             listing_id (FK)             thread_id (FK)
buyer_user_id (FK, null     buyer_id (FK)               sender_id (FK)
  if guest)                 seller_id (FK)              body
buyer_name, buyer_email,    created_at                  created_at
  buyer_phone (form data)   last_message_at             read_at
message_text                status (open|closed)
admin_copied (bool)
created_at

comments                    saved_listings
────────                    ──────────────
id (PK)                     user_id (FK)
listing_id (FK)             listing_id (FK)
author_id (FK)              created_at
body                        PK(user_id, listing_id)
created_at
```

`contact_log` is the abuse/dispute base of record and the admin copy. `message_threads` + `messages` are the private in-site chat. RLS on threads/messages: only `buyer_id` or `seller_id` (and admins) may read — buyer and seller still never see each other's PII because the chat is keyed on `auth.uid()`, not on names/emails.

## Data Flow

### Flow 1: Search query

```
Buyer selects facets (Make=Peterbilt, Category=Hoods) + types "359 long hood"
    ↓ (Server Component or Server Action)
serverClient.rpc('search_listings', { filters, q })
    ↓
Postgres: listings WHERE status='active'
          EXISTS in listing_models / listing_categories for selected facets
          + FTS(search_vector @@ q) UNION/OR pg_trgm similarity on search_terms.term
    ↓ RLS: only active listings + public columns
Ranked, paginated results → rendered feed (no PII anywhere)
```

### Flow 2: Contact → private chat

```
Buyer submits contact form (Name, Email, Phone?, Message) on a listing
    ↓ Server Action / Route Handler (server-side)
1. INSERT contact_log (form data + listing + buyer) ← persisted FIRST (abuse base)
2. Copy to admin (admin_copied=true; optional email/notification) + log communication
3. UPSERT message_threads (buyer_id, seller_id, listing_id)
4. INSERT first messages row (sender=buyer, body=message_text)
    ↓
Redirect buyer to /messages/[thread]; seller notified
    ↓ Realtime
Both clients subscribe to a per-thread channel; new messages delivered via
Supabase Realtime BROADCAST (sent from a DB trigger/Server Action on INSERT)
Presence shows online/typing. Neither party ever sees the other's PII.
```

> **Realtime mode (verified):** Use **Broadcast** (not `postgres_changes`) for message delivery — Supabase docs state `postgres_changes` does not scale as well and recommend Broadcast for most chat use cases. Pattern: persist the message (RLS-protected), then broadcast the new-message event to the thread channel; clients render from the broadcast (or refetch). Use **Presence** for online/typing indicators.

### Flow 3: Listing creation with fitment auto-suggest

```
Seller fills public part info + selects Make/Model + a few categories
    ↓
lib/fitment/suggest → query fitment_rules where selections are triggers
    ↓
UI shows suggested configs/terms/categories ("also tag: Aerodyne, Long Hood Guys?")
    ↓ seller accepts/edits
Server Action (transaction):
  INSERT listings (+ search_vector generated from title/part#/notes)
  INSERT listing_models / listing_configs / listing_categories /
         listing_materials / listing_conditions / listing_special_filters
  Upload photos → Storage → INSERT listing_photos
    ↓ RLS: WITH CHECK seller_id = auth.uid()
Listing now surfaces in every search path it was tagged for.
```

## Architectural Patterns

### Pattern 1: RLS as the privacy boundary (default-deny)

**What:** Enable RLS on every table in `public`; write explicit policies. PII tables grant SELECT only to the owner; public tables grant world SELECT but owner-only writes.
**When to use:** Always here — this is the product's core guarantee.
**Trade-offs:** Policies must be tested (a missing SELECT policy silently returns 0 rows; an over-broad one leaks PII). Worth it: the DB enforces privacy even if app code has a bug.

```sql
alter table profiles_private enable row level security;
create policy "owner reads own PII" on profiles_private
  for select to authenticated using ( (select auth.uid()) = id );
-- NO anon/public select policy → PII is structurally unreadable publicly

alter table profiles_public enable row level security;
create policy "public profiles readable" on profiles_public
  for select to anon, authenticated using ( true );
create policy "owner edits own profile" on profiles_public
  for update to authenticated
  using ( (select auth.uid()) = id ) with check ( (select auth.uid()) = id );
```

### Pattern 2: Server-first reads, Server Actions for writes

**What:** Server Components read through the cookie-bound `serverClient` (RLS-enforced). Mutations go through Server Actions / Route Handlers, never raw client writes for sensitive flows (contact, listing create).
**When to use:** Everywhere; the browser client is reserved for Realtime subscriptions and optimistic UI.
**Trade-offs:** Slightly more server round-trips, but keeps privacy logic server-side and lets RLS + server validation co-enforce rules.

### Pattern 3: Service-role isolated to admin

**What:** The `service_role`/secret key bypasses RLS. Keep it in one server-only module used solely by `app/admin/` (guarded by `is_admin`) and trusted webhooks.
**When to use:** Admin ops (cross-user moderation, analytics aggregation, communication monitoring).
**Trade-offs:** Powerful and dangerous — must never reach the browser (`NEXT_PUBLIC_*` is sent to the client). One isolated file makes audit trivial.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–1k users | Single Supabase project; FTS + pg_trgm indexes; Realtime Broadcast for chat. Monolith is correct. |
| 1k–100k users | Add GIN indexes on `search_vector` and trigram columns; materialized views for analytics refreshed via `pg_cron`; ensure chat uses Broadcast not `postgres_changes`. |
| 100k+ users | Read replicas for search/feed; consider connection pooling (Supavisor); move analytics to scheduled rollups; evaluate dedicated search if FTS latency degrades. |

### Scaling Priorities

1. **First bottleneck:** search latency on multi-join facet queries — fix with GIN indexes (FTS + trigram) and composite indexes on join tables before anything else.
2. **Second bottleneck:** Realtime fan-out and analytics aggregation — use Broadcast for chat (scales better than `postgres_changes`) and pre-aggregate analytics via `pg_cron` instead of live `count(*)` over large tables.

## Anti-Patterns

### Anti-Pattern 1: PII in the public profile table (or in a view)

**What people do:** One `profiles` table with a mix of public/private columns, relying on `select` discipline; or a public view over the PII table.
**Why it's wrong:** `select *`, an ORM, or a forgotten policy leaks PII; views bypass RLS unless `security_invoker = true`, and a view-based privacy boundary is easy to misconfigure.
**Do this instead:** Physically separate `profiles_private` (owner-only RLS) from `profiles_public` (world-readable). Make privacy structural.

### Anti-Pattern 2: `postgres_changes` for chat at scale

**What people do:** Subscribe the chat UI directly to row inserts via `postgres_changes` because it's the simplest demo.
**Why it's wrong:** It does not scale well (documented Supabase limitation) and couples UI directly to replication.
**Do this instead:** Persist the message (RLS-protected) then **Broadcast** the event to the thread channel; render from the broadcast.

### Anti-Pattern 3: Opening chat before persisting contact

**What people do:** Open the chat thread first, log the contact "later."
**Why it's wrong:** Requirement is form-first — the contact must be the durable abuse/dispute record and the admin copy BEFORE any conversation.
**Do this instead:** Server Action writes `contact_log` (+ admin copy) first, then creates the thread + first message in the same transaction.

### Anti-Pattern 4: Trusting `user_metadata` for authorization

**What people do:** Put `is_admin` in user metadata and check it in RLS.
**Why it's wrong:** `raw_user_meta_data` is user-editable and unsafe for authz.
**Do this instead:** Store admin/role flags in `app_metadata` or a server-controlled `admins` table; check that in policies.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Supabase Auth | `@supabase/ssr` `createServerClient`/`createBrowserClient` + `middleware.ts` | Refresh session every request; use new publishable/secret keys (legacy anon/service_role work through 2026 but are deprecating) |
| Supabase Storage | Server Action upload → `listing_photos.storage_path` | Upsert needs INSERT+SELECT+UPDATE storage policies; serve via public bucket or signed URLs |
| Supabase Realtime | Broadcast (chat) + Presence (online/typing) | Broadcast over `postgres_changes` for scale |
| pg_cron / Edge Functions | Scheduled analytics rollups, notification sends | Analytics aggregation lives here, not in request path |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Public surface ↔ PII | NONE (by design) | Public components query `profiles_public` only; RLS denies PII |
| Listing create ↔ fitment intelligence | Server Action → `fitment_rules` lookup | Suggestions are data-driven, admin-extensible |
| Contact ↔ chat ↔ admin | Single Server Action transaction | contact_log (+admin copy) → thread → message |
| Buyer ↔ seller in chat | Keyed on `auth.uid()`, not identity | RLS on threads/messages; neither sees the other's PII |

## Build Order Implications

Dependencies dictate this order (each layer needs the one before it):

1. **Foundation:** Supabase project, `@supabase/ssr` clients + `middleware.ts`, RLS-on-everything baseline. Nothing is safe to build until the session + RLS scaffolding exists.
2. **Auth + Privacy split:** `profiles_private` / `profiles_public` tables + RLS + registration (custom/system username, verified-seller flow). The privacy model must be correct before any public surface renders.
3. **Fitment taxonomy:** seed the 8 reference tables + Barnyard. Listings can't be tagged or searched without the taxonomy existing first.
4. **Listings + fitment join tables + Storage:** create/edit/sell + photos. Depends on auth (seller_id) and taxonomy (tags).
5. **Fitment intelligence:** `fitment_rules` + suggestion service. Depends on listings + taxonomy.
6. **Search + feed:** `search_listings` RPC (FTS + pg_trgm) + facet UI + public profile. Depends on listings being taggable.
7. **Social layer:** comments + saved listings. Depends on listings.
8. **Contact → chat:** `contact_log` → threads/messages + Realtime Broadcast. Depends on listings + auth; the contact_log/admin-copy must come before live chat.
9. **Admin:** Ops console (uses service-role, isolated) + Analytics (pre-aggregated via pg_cron/materialized views). Depends on all data existing to manage/measure.

Critical sequencing: **RLS scaffolding → privacy split → fitment taxonomy** must precede listings; **listings** must precede search, social, and contact/chat; **admin** comes last.

## Sources

- Supabase RLS / SSR / security checklist — `supabase` skill (current product-security guidance), [Creating a Supabase client for SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs) — HIGH
- [RLS in Supabase: Complete Guide for Next.js with @supabase/ssr (2026)](https://blog.starmorph.com/blog/row-level-security-supabase-tables-nextjs) — MEDIUM (default-deny RLS, middleware refresh confirmed)
- Realtime: [Broadcast | Supabase Docs](https://supabase.com/docs/guides/realtime/broadcast), [Subscribing to Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes) — HIGH (Broadcast preferred over postgres_changes at scale)
- Search: [Postgres Full Text Search vs the rest (Supabase)](https://supabase.com/blog/postgres-full-text-search-vs-the-rest), [Full Text Search | Supabase Docs](https://supabase.com/docs/guides/database/full-text-search), [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html) — HIGH (FTS + trigram hybrid)
- Fitment many-to-many: [ACES and PIES Data Standards](https://automotiveaftermarket.org/aftermarket-industry-trends/aces-pies-data-explained/), [ACES and PIES: The Guide for 2026](https://www.sparkshipping.com/blog/aces-and-pies-guide) — MEDIUM (validates part↔vehicle M2M; our schema is a simplified heavy-truck adaptation)

---
*Architecture research for: privacy-first truck-parts marketplace (Next.js 15 + Supabase)*
*Researched: 2026-06-01*
