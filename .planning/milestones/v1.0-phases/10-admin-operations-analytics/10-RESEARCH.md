# Phase 10: Admin Operations & Analytics - Research

**Researched:** 2026-06-11
**Domain:** Next.js 16 admin console over Supabase service-role, moderation/enforcement schema, live SQL analytics, CSV bulk import
**Confidence:** HIGH (codebase-grounded), MEDIUM on chart-library version pairing

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Enforcement & report queue**
- Full enforcement ladder: warn → hide listing → temporary suspension → permanent ban
- Affected user is notified by email with the reason / rule violated on every enforcement action
- Queue workflow: simple states — Pending → Resolved/Dismissed, with an admin note; filterable by state and type
- Multiple reports on the same listing/user are grouped into one queue entry with a report counter; one action resolves all of them

**Message / contact-log monitoring**
- Default visibility is metadata only (who with whom, when, message counts); full thread content opens only when there is a report on that thread
- Contact logs: full searchable/filterable table (buyer, seller, listing, date, initial message) — this is the admin copy already persisted by design
- Every admin access to thread content is recorded in an audit log (who, when, which report justified it)
- Admin can close/freeze a problematic thread so no one can write further (in addition to user/listing enforcement actions)

**Analytics dashboard**
- Layout: KPI cards on top (users, active listings, messages, growth %) with trend charts and rankings (most-searched, most-viewed) below
- Time ranges: preset selector 7 / 30 / 90 days + all time (no free date pickers in v1)
- "Active user" = any login within the last 30 days (classic MAU)
- Data freshness (live queries vs pre-aggregation): Claude's discretion — live queries likely fine at launch volume

**Admin access & console structure**
- Admin designated by a manual flag in the DB (column/script); no admin-management UI in v1
- Single admin role with full console access; granular roles (moderator/analyst) deferred to v2
- Navigation: fixed sidebar — Dashboard (analytics), Users, Listings, Reports, Messages, Categories, Fitment Library
- Bulk onboarding via CSV import (see below)

**Fitment library management**
- Full CRUD + activate/deactivate per taxonomy level (makes, models, configs, terms, categories, materials, conditions, filters); hard delete only allowed when nothing references the value
- Deactivating/removing a value leaves existing listings intact (still visible/searchable with the old value); only new listings can't pick it
- Slang terms / `search_synonyms`: full CRUD inside the Fitment Library section (term → canonical table) — adding new trucker slang is a frequent op
- Whether part categories live inside Fitment Library or as their own sidebar section: Claude's discretion (categories are level 5 of the taxonomy — likely together)

**Admin scope over users/listings**
- Listings: moderate only — hide/restore listings and remove individual rule-violating photos; admin never rewrites seller content (title, description, price)
- Users: admin can rename offensive usernames and change account state (suspend/ban/reactivate); never edits private PII; password reset stays self-service via Supabase
- Admin user detail view DOES show private PII (real name, email, phone) — needed for support/verification; console is service-role + server-only so the public privacy model is untouched
- Unified audit log: every admin action (hide, suspend, rename, taxonomy edits, chat-content access) recorded with who/what/when in one audit table

**Suspensions**
- Duration: admin picks from presets — 24h / 7 days / 30 days; auto-reactivates on expiry
- Suspended user can log in but the whole app shows a blocked page: "Account suspended until [date] — reason: [X]"; cannot operate
- Suspended user's listings hidden from public while suspension lasts, restored on reactivation; banned user's listings hidden permanently (data retained, not deleted)
- Suspended user's chats: read-only — can view conversations but cannot send; counterpart sees the thread normally

**CSV bulk import**
- Listings assigned to real registered seller accounts: each CSV row references the owning seller's username/email (e.g. yards handing over inventory); contact flows normally to them
- Photos via URLs in CSV columns; server downloads, re-encodes with sharp (EXIF strip mandatory — same privacy pipeline as regular uploads), and stores in Supabase Storage
- Per-row validation: valid rows import, failed rows reported with reason at the end so only those get fixed and re-uploaded
- Imported listings land as drafts; admin reviews and bulk-publishes with one click

### Claude's Discretion
- Analytics data freshness strategy (live vs pre-aggregated)
- Where part-categories management lives in the nav (own section vs inside Fitment Library)
- CSV column schema, parsing library, batch size, and import progress UI
- Audit log table design and retention
- Exact chart library/components and dashboard skeleton/loading states

### Deferred Ideas (OUT OF SCOPE)
- Granular admin roles (moderator, analyst) — v2 if a team grows
- Admin-management UI (promote/demote admins from the console) — v2; v1 uses a DB flag
- Appeals flow for suspensions/bans — not discussed as v1; revisit post-launch
- Free date-range picker and data export on analytics — v2
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ADMO-01 | Admin can view and manage users | Pattern 1 (admin gate via `app_metadata` + `requireAdmin()`), Pattern 3 (`user_restrictions` table + suspension/ban/rename actions), service-role reads of `profiles_public` + `profiles_private` joined on id |
| ADMO-02 | Admin can view and manage listings | Pattern 4 (`hidden_at`/`hidden_reason` moderation columns + RLS/RPC dual exclusion), photo removal reuses `listing_photos` + Storage delete via service role |
| ADMO-03 | Admin can view and act on reports (abuse queue with enforcement) | `reports` table exists (0016, append-only, "Admin queue reads via the service role (Phase 10)" comment); Pattern 5 adds queue columns + grouped-queue query; enforcement ladder actions in Pattern 3/4 |
| ADMO-04 | Admin can monitor messages/contact logs | `contact_log` + `message_threads` + `messages` exist with no admin-readable policies — service-role read only; Pattern 6 (metadata-first thread monitor, audited content access, `frozen_at` freeze) |
| ADMO-05 | Admin can manage part categories | `part_categories` table exists (0003, has `parent_id` hierarchy); Pattern 7 generic taxonomy CRUD + `is_active` column |
| ADMO-06 | Admin can manage the fitment library (8 levels) | Pattern 7: `is_active` flag per taxonomy table, FK-`restrict`-guarded hard delete, `search_terms`/`search_term_targets` CRUD for slang |
| ADMA-01 | Analytics: registered users + active users | Registered = `count(profiles_public)`; active (MAU) = `auth.users.last_sign_in_at > now()-30d` via a security-definer RPC (Pattern 8) |
| ADMA-02 | Analytics: active listings + most-viewed listings | `listings` status filter; `listing_view_events` (0006) is the append-only stream built for exactly this — service-role aggregate, time-ranged |
| ADMA-03 | Analytics: most-searched makes and models | `search_events.facets` jsonb carries `makeId`/`modelId` keys (verified in `app/(public)/page.tsx`); group-by on `(facets->>'modelId')::bigint` joined to `models`/`makes` |
| ADMA-04 | Analytics: messages sent + monthly growth | `count(messages)` time-ranged; growth = month buckets over `profiles_public.member_since` and `listings.created_at` |
</phase_requirements>

## Summary

This phase is almost entirely an exercise in building on rails that previous phases deliberately laid. Every data source already exists: `reports`, `contact_log`, `messages`, `message_threads` were created append-only with explicit "admin reads via the service role (Phase 10)" comments; `search_events` and `listing_view_events` are insert-only streams with **no** select policy, readable only by the service role; `lib/supabase/admin.ts` is the one `server-only` service-role module the cross-cutting gate requires. What does NOT exist yet: any admin identity mechanism, any enforcement/moderation schema (suspensions, listing hiding, report queue state, thread freeze), the audit log, taxonomy `is_active` flags, a `draft` listing status, and the entire `app/admin/` UI (the directory exists, empty).

The plan therefore needs (a) **one schema migration (0019)** adding: `user_restrictions`, `admin_audit_log`, report-queue columns on `reports`, `listings.hidden_at/hidden_reason` + `'draft'` status, `message_threads.frozen_at`, `is_active` on the 8 taxonomy tables, and the RLS/RPC updates that make hiding structural; (b) an **admin gate** built on `auth.users.app_metadata.role = 'admin'` set by a script (the "manual DB flag" the stakeholder locked), checked by a `requireAdmin()` helper in the admin layout **and** every admin Server Action (layouts are not a security boundary in Next.js); (c) **server-rendered admin pages** under `app/admin/` reading through `createAdminClient()`, all `force-dynamic`; (d) a **live-query analytics dashboard** (no pre-aggregation at launch volume) using shadcn/ui charts (Recharts); (e) a **CSV import** route using Papa Parse + the existing `stripAndReencode()` EXIF pipeline for URL-fetched photos.

The dangerous parts are not the CRUD — they are the structural-enforcement edges: hidden/draft/suspended listings must be excluded in BOTH the `search_listings` RPC and the `listings` SELECT RLS policy (the RPC is `security invoker`, so the policy alone can do it — but the public detail page reads the table directly too); suspended users must be blocked from *sending* messages at the RLS insert policy (single enforcement point, same precedent as blocks); and suspension auto-expiry must be **lazy** (computed from `suspended_until < now()`), never cron-dependent — pg_cron is still unscheduled on Staging (Phase 5.1 memory).

**Primary recommendation:** One migration (0019) for all enforcement/audit/taxonomy schema with RLS-structural hiding, `requireAdmin()` on app_metadata role in every admin entry point, service-role live-SQL analytics behind a definer RPC for auth.users stats, shadcn charts, Papa Parse import reusing `stripAndReencode()`.

## Standard Stack

### Core (already installed — reuse, do not add)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.106.x | `createAdminClient()` service-role reads/writes; `auth.admin` API | Already the project's only service-role path (`lib/supabase/admin.ts`) |
| `next` | 16.2.6 | `app/admin/` route group, Server Actions, `force-dynamic` pages | Existing app |
| `react-hook-form` + `zod` 4.4.x + `@hookform/resolvers` | installed | Admin forms (taxonomy CRUD, enforcement dialogs) with the same client+server schema discipline | Project invariant |
| `sharp` | 0.34.5 | CSV-import photo re-encode via existing `lib/images/strip.ts` | Invariant #4 — same EXIF gate as regular uploads |
| shadcn/ui (`components/ui/*`) | installed | Tables, dialogs, badges, selects, skeletons for the console | Already owns button/card/dialog/select/skeleton/sheet/etc. |

### New dependencies (this phase)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `recharts` | ^3.8.1 (or the version the shadcn `chart` component pins) | Trend charts + ranking bars on the dashboard | Installed via `npx shadcn@latest add chart` — gives `ChartContainer`/`ChartTooltip` wrappers themed with the existing Tailwind tokens |
| `papaparse` | ^5.5.3 | Server-side CSV parsing for bulk import | Battle-tested, handles quoted fields/BOM/CRLF; runs fine in Node route handlers |
| `@types/papaparse` | ^5.5.2 | Types | dev dep |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `user_restrictions` table | Supabase native `auth.admin.updateUserById(id, { ban_duration })` | Native ban blocks token issuance — user **cannot log in at all**, which violates the locked decision (suspended user logs in and sees the blocked page; reads chats read-only). Use the custom table. |
| `app_metadata.role = 'admin'` | `profiles_public.is_admin` column | Column on a world-readable table leaks who the admins are; also requires a DB query per check. `app_metadata` rides in the verified JWT — `getClaims()` reads it with zero extra queries and users cannot self-modify it (only service role can). |
| Papa Parse | `csv-parse` 6.x | Equivalent; Papa Parse chosen for simpler synchronous string API on an uploaded file. Either is fine. |
| Recharts via shadcn | Tremor / visx | Heavier or lower-level; shadcn chart matches the existing component system and theme tokens. |
| Live analytics queries | Materialized views / pre-aggregation tables | Locked as Claude's discretion → **live queries** at launch volume (thousands of event rows, not millions). Add `created_at` indexes now; revisit materialized views only if dashboard p95 degrades. |

**Installation:**
```bash
npx shadcn@latest add chart table tabs
npm install papaparse
npm install -D @types/papaparse
```

## Architecture Patterns

### Recommended Project Structure
```
app/admin/
├── layout.tsx                  # requireAdmin() + fixed sidebar + force-dynamic
├── page.tsx                    # Dashboard (analytics) — KPI cards + charts + rankings
├── users/page.tsx              # ADMO-01 list (search by username/email)
├── users/[id]/page.tsx         # detail incl. PII, enforcement actions, restriction state
├── listings/page.tsx           # ADMO-02 list (filter status/hidden), bulk-publish drafts
├── listings/[id]/page.tsx      # detail, hide/restore, per-photo removal
├── reports/page.tsx            # ADMO-03 grouped queue (filter state/type)
├── messages/page.tsx           # ADMO-04 tabs: threads (metadata) | contact logs
├── messages/threads/[id]/page.tsx  # content view — ONLY reachable with a justifying report; access audited
├── fitment/page.tsx            # ADMO-05/06 level picker (8 levels + slang)
├── fitment/[level]/page.tsx    # generic CRUD per taxonomy level
└── import/page.tsx             # CSV bulk import + results report
lib/admin/
├── auth.ts                     # requireAdmin() — the ONE admin gate helper
├── audit.ts                    # logAdminAction() — the ONE audit writer
├── queries.ts                  # service-role read helpers (lists, detail, analytics)
├── analytics.ts                # KPI/trend/ranking aggregate queries
└── import.ts                   # CSV row schema (zod), photo-URL fetch + strip pipeline
lib/actions/admin/
├── enforcement.ts              # warn / hide listing / suspend / ban / reactivate / rename
├── reports.ts                  # resolve / dismiss (grouped)
├── threads.ts                  # freeze / unfreeze, open-content audit
├── taxonomy.ts                 # generic CRUD + activate/deactivate + slang
└── import.ts                   # CSV import action (or route handler — see Pitfall 6)
supabase/migrations/0019_admin_operations.sql   # ALL schema for this phase
scripts/grant-admin.mjs         # manual flag script (matches scripts/ precedent)
```
**Discretion call — part categories nav:** keep categories **inside the Fitment Library section** (`/admin/fitment/categories`) — it is level 5 of the same taxonomy and shares the exact generic CRUD pattern — but give it its own sidebar link "Categories" pointing there, satisfying the locked sidebar list (Dashboard, Users, Listings, Reports, Messages, Categories, Fitment Library) without a second implementation.

### Pattern 1: Admin gate — app_metadata role + requireAdmin() everywhere
**What:** Flag admins by writing `{"role":"admin"}` into `auth.users.raw_app_meta_data` via script (the locked "manual flag in the DB"). `app_metadata` is embedded in the access token and **cannot be modified by the user** (unlike `user_metadata`). Check it with the project's existing `getClaims()` discipline.
**When to use:** In `app/admin/layout.tsx` (UX gate) AND at the top of **every** admin Server Action and admin route handler (security gate — Next.js layouts do not re-run for every nested navigation and are not an authorization boundary).
**Example:**
```typescript
// lib/admin/auth.ts
import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin(): Promise<{ adminId: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims(); // verified, never getSession()
  const claims = data?.claims;
  const role = (claims?.app_metadata as { role?: string } | undefined)?.role;
  if (!claims?.sub || role !== "admin") notFound(); // 404, don't advertise the console
  return { adminId: claims.sub };
}
```
```js
// scripts/grant-admin.mjs — manual flag (run with --env-file=.env.local)
const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
// find user id by email, then:
await admin.auth.admin.updateUserById(userId, { app_metadata: { role: "admin" } });
// NOTE: the flagged user must sign out/in (or refresh token) before the claim appears.
```
Source: Supabase docs — `app_metadata` is service-role-writable only and included in the JWT (HIGH confidence; matches existing `getClaims()` usage in `lib/actions/account.ts`).

### Pattern 2: Service-role isolation (cross-cutting gate)
**What:** ALL admin reads/writes go through `createAdminClient()` from `lib/supabase/admin.ts` — the module already exists, is `server-only`, and is currently imported by exactly 5 trusted server files. Admin pages are server components; no admin data fetching from client components.
**CI scan:** add a CI step after `next build` that fails if the service key name leaks into client chunks:
```yaml
- run: npm run build
- name: service-role key never in client bundle
  run: "! grep -r 'SUPABASE_SERVICE_ROLE_KEY' .next/static"
```
(`server-only` already hard-errors a client import of `admin.ts` at build time; the grep is the belt to that suspender.)
**Caching:** every `app/admin` page exports `export const dynamic = "force-dynamic"` (invariant #6 — personalized/privileged routes must never be cached; the `(app)` layout precedent already does this).

### Pattern 3: `user_restrictions` — suspension/ban state with lazy expiry
**What:** One row per restricted user; written ONLY by service role; the user can read their own row (powers the blocked page showing date + reason).
```sql
create table public.user_restrictions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null check (state in ('suspended','banned')),
  reason text not null,
  suspended_until timestamptz,          -- null for bans
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (state <> 'suspended' or suspended_until is not null)
);
alter table public.user_restrictions enable row level security;
-- self-read only (blocked page); NO insert/update/delete policies → service-role-only writes
create policy "restrictions self-select" on public.user_restrictions
  for select to authenticated using ((select auth.uid()) = user_id);
```
**Lazy expiry (critical):** "currently restricted" is ALWAYS computed as `state = 'banned' or (state = 'suspended' and suspended_until > now())`. Never depend on a cron flipping rows — pg_cron is still unscheduled on Staging (Phase 5.1 memory). When an expired suspension is detected at gate-time, a server-side sweep (service role) deletes the row and **restores the suspension-hidden listings** (see Pattern 4).
**App-wide blocked page:** check the restriction in the `(app)` route-group layout (and the messaging/listing Server Actions). The user reads their own row via normal RLS — no service role needed on the gate path. Render the "Account suspended until [date] — reason: [X]" page instead of children; messaging UI passes a `readOnly` flag for suspended users.
**Structural send-block:** extend the `messages` INSERT policy (one enforcement point, same precedent as `user_blocks`):
```sql
-- add to "messages participant-insert" with check (...):
and not exists (
  select 1 from public.user_restrictions r
  where r.user_id = (select auth.uid())
    and (r.state = 'banned' or (r.state = 'suspended' and r.suspended_until > now()))
)
and exists ( select 1 from public.message_threads t2
             where t2.id = messages.thread_id and t2.frozen_at is null )
```
(Implement as `drop policy` + `create policy` with the full original body plus these arms.)

### Pattern 4: Listing moderation — `hidden_at` + `'draft'` status, structurally enforced
**What:** Two orthogonal mechanisms: `status` gains `'draft'` (CSV imports land here); moderation hiding is a separate `hidden_at timestamptz` + `hidden_reason text check (hidden_reason in ('moderation','suspension','ban'))`. The reason column exists so reactivation restores ONLY suspension-hidden listings, never admin-moderated ones (and ban-hidden stay hidden permanently).
```sql
alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings add constraint listings_status_check
  check (status in ('draft','active','sold','expired'));
alter table public.listings add column hidden_at timestamptz;
alter table public.listings add column hidden_reason text
  check (hidden_reason in ('moderation','suspension','ban'));

-- REPLACE the public-read policy: hidden/draft rows visible only to their owner.
drop policy "listings public-read" on public.listings;
create policy "listings public-read" on public.listings for select
  to anon, authenticated
  using (
    (hidden_at is null and status <> 'draft')
    or seller_id = (select auth.uid())
  );
```
**Why RLS, not just the RPC:** `search_listings` is `security invoker`, so the new policy automatically filters it — but the public listing detail page, the profile `active_listing_count` RPC, and the saved-listings reader all read `listings` directly. The policy is the single structural choke point. **Still add `and hidden_at is null and status <> 'active'-equivalent` checks where the RPC's own WHERE clause already enumerates statuses** so query plans stay index-friendly, and verify `active_listing_count` (0008) excludes hidden rows.
**Photo removal (locked: remove individual rule-violating photos):** service-role delete of the `listing_photos` row + Storage object (`LISTING_PHOTOS_BUCKET`), audit-logged. Watch the LIST-08 3-photo minimum: removal may drop a listing below 3 photos — do NOT auto-unpublish; just log (the minimum is a publish-time gate, still pending as a Phase-5 gap).
**Suspension hide/restore:** suspend = service-role `update listings set hidden_at = now(), hidden_reason = 'suspension' where seller_id = $1 and hidden_at is null`; restore = `update ... set hidden_at = null, hidden_reason = null where seller_id = $1 and hidden_reason = 'suspension'`. Ban uses `hidden_reason = 'ban'` and is never auto-restored.

### Pattern 5: Report queue — columns on `reports` + grouped queue query
**What:** `reports` (0016) is append-only with reporter-only RLS; admin acts via service role, so adding queue columns needs **no new policies** (default-deny already protects them).
```sql
alter table public.reports add column status text not null default 'pending'
  check (status in ('pending','resolved','dismissed'));
alter table public.reports add column resolved_by uuid references auth.users(id);
alter table public.reports add column resolved_at timestamptz;
alter table public.reports add column admin_note text;
create index reports_status_idx on public.reports (status, created_at desc);
```
**Grouping (locked: multiple reports on same target = one queue entry + counter; one action resolves all):** group in the QUERY, not the schema — `group by coalesce(listing_id::text, 'c'||comment_id::text, 'm'||message_id::text)` with `count(*)`, `array_agg(reason)`, `min(created_at)`. Resolve/dismiss updates all pending rows for that target in one service-role `update`.
**Type filter:** target type derives from which arc column is non-null (exclusive-arc check already guarantees exactly one).
**Enforcement actions from the queue:** the queue row links to the target; actions invoke the same `lib/actions/admin/enforcement.ts` functions (hide listing / suspend / ban / warn), then mark the group resolved with the note — every step audit-logged and the affected user emailed (Pattern 9).

### Pattern 6: Message monitoring — metadata by default, audited content access, freeze
**What:**
- **Threads list:** service-role query over `message_threads` joined to `profiles_public` (usernames) + `count(messages)` + `last_message_at`. No message bodies in the list query at all.
- **Content view:** `/admin/messages/threads/[id]` first checks (service role) that a report exists targeting a message in that thread (or the thread's listing — recommend: message-report required for chat content, listing-report alone does not unlock chat). If no justifying report → the page renders a "no report on this thread" notice, NOT the content. On success it inserts an `admin_audit_log` row (`action: 'thread_content_access'`, metadata: `{ thread_id, report_id }`) **before** rendering messages.
- **Freeze:** `alter table public.message_threads add column frozen_at timestamptz; add column frozen_by uuid;` — enforcement is the `messages` INSERT-policy arm in Pattern 3 (no one can write, both sides can read). UI shows "This conversation has been closed by moderation."
- **Contact logs:** plain service-role table over `contact_log` (already carries buyer PII by design as the admin copy of record) with filters on buyer/seller username, listing, date; `ilike` on `message_text` is fine at admin volume (no FTS needed).

### Pattern 7: Generic taxonomy CRUD — `is_active` + FK-guarded hard delete
**What:** All 8 taxonomy tables (`makes`, `models`, `configurations`, `search_terms`, `part_categories`, `materials`, `conditions`, `special_filters`) get `is_active boolean not null default true` in 0019. (Slang lives in `search_terms` + `search_term_targets` — note the project does NOT have a table literally named `search_synonyms`; CONTEXT's "search_synonyms" maps to these two tables.)
- **New-listing pickers** (`lib/fitment` queries feeding the create/edit form and CSV import) filter `is_active = true`. **Search/read surfaces do NOT filter** — locked decision: existing listings stay visible/searchable with old values.
- **Hard delete:** existing FKs are already `on delete restrict` from `listing_fitment.model_id/config_id`, `listings.condition_id`, etc. Implement delete as: count references (service role) → if zero, delete; if the DB still throws FK violation (race), surface "in use, deactivate instead". Never cascade.
- **Writes via service role** (taxonomy tables have public-read RLS and no write policies — correct as-is; no new policies needed).
- **One generic CRUD page** parameterized by a level config map (table name, columns, parent FK — models need a make selector, configurations are a shared master + `model_configurations` join, `search_terms` need targets management via `search_term_targets`). Budget extra effort for `search_terms`: it has trigram-indexed `term` and per-target rows; its editor is the most-used admin surface per CONTEXT ("adding new trucker slang is a frequent op").
- Models/configs feeding `search_listings` and fitment intelligence are unaffected by `is_active` at read time — verify `0012` fitment-rules suggestions also filter `is_active` for NEW listings only.

### Pattern 8: Analytics — live SQL via service role + one definer RPC for auth stats
**Discretion call — freshness:** live queries, no pre-aggregation. Event tables will hold thousands of rows at launch; every dashboard query is a single indexed aggregate. Add the missing time indexes in 0019: `create index search_events_created_idx on public.search_events (created_at desc);` and `create index listing_view_events_created_idx on public.listing_view_events (created_at desc);`.
- **Registered users:** `count(*) from profiles_public` (service role).
- **Active users (MAU):** `last_sign_in_at` lives in the `auth` schema, which PostgREST does not expose — use a `security definer` SQL function:
```sql
create or replace function public.admin_user_activity_stats()
returns table (registered bigint, active_30d bigint)
language sql stable security definer set search_path = ''
as $$
  select (select count(*) from public.profiles_public),
         (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days');
$$;
revoke execute on function public.admin_user_activity_stats() from anon, authenticated, public;
-- service_role retains execute → only the admin client can call it.
```
- **Most-searched makes/models (ADMA-03):** facets are camelCase jsonb keys (verified call site):
```sql
select m.name, count(*) as searches
from public.search_events e
join public.models m on m.id = (e.facets->>'modelId')::bigint
where e.facets->>'modelId' is not null and e.created_at > now() - $1::interval
group by m.name order by searches desc limit 10;
-- makes: same shape on facets->>'makeId' joined to makes;
-- ALSO union in fitsModelId (the "Fits my truck" facet) for model demand if desired.
```
- **Most-viewed listings:** `group by listing_id` over `listing_view_events` joined to `listings` (include hidden ones — it's an admin view).
- **Monthly growth:** `date_trunc('month', member_since)` over `profiles_public` and `date_trunc('month', created_at)` over `listings`; growth % = current vs previous month.
- **Time presets:** `?range=7d|30d|90d|all` searchParam → interval; page is `force-dynamic`, charts are client components receiving server-aggregated arrays (never raw events to the client).
- Run the handful of aggregates with `Promise.all` in the page; wrap sections in `<Suspense>` with the existing `skeleton.tsx` for loading states (discretion answered).

### Pattern 9: Enforcement emails — clone the `notify.ts` Resend posture
**What:** Every enforcement action emails the affected user with reason/rule (locked). Reuse the exact pattern from `lib/messaging/notify.ts`: raw `fetch` to `api.resend.com`, `escapeHtml` on user-supplied strings, try/catch swallow — **the audit/DB row is the record; email is best-effort courtesy**. Recipient email read from `profiles_private` via service role in the same action. KNOWN STAGING CONSTRAINT: `onboarding@resend.dev` only delivers to the Resend account address until domain verification (pre-launch task) — enforcement emails will not deliver to arbitrary users on Staging; do not treat that as a bug at UAT.

### Pattern 10: Audit log (discretion answered)
```sql
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users(id),
  action text not null,            -- 'listing_hide','listing_restore','photo_remove','user_suspend',
                                   -- 'user_ban','user_reactivate','username_rename','warn_user',
                                   -- 'report_resolve','report_dismiss','thread_freeze','thread_unfreeze',
                                   -- 'thread_content_access','taxonomy_create','taxonomy_update',
                                   -- 'taxonomy_deactivate','taxonomy_delete','csv_import','bulk_publish'
  target_type text not null,       -- 'user','listing','photo','report_group','thread','taxonomy','import'
  target_id text not null,         -- text: covers uuid + bigint + composite targets
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
alter table public.admin_audit_log enable row level security;
-- ZERO policies: default-deny; service-role only, both directions.
```
**Retention:** keep forever in v1 (rows are tiny, volume is admin-action-rate; an audit log you prune is not an audit log). One `logAdminAction()` helper in `lib/admin/audit.ts`; every enforcement/taxonomy/content-access action calls it — write the audit row in the same logical flow BEFORE returning success.

### Pattern 11: CSV bulk import (discretion: schema/library/batching answered)
**Column schema (zod-validated per row):**
```
seller (username OR email) | title | part_number? | asking_price | condition (name) |
shipping_option | damage_notes? | is_barnyard? | make_model fitments? ("Peterbilt 379;Kenworth W900" — model names, optional :config suffix) |
categories? (names, ;-separated) | photo_url_1..photo_url_8
```
**Flow per row:** zod parse → resolve seller (service-role lookup: `profiles_public.username` citext eq, else `profiles_private.email`) → resolve taxonomy names to ids (only `is_active` values) → fetch each photo URL (https only, 10MB cap, timeout ~10s) → `stripAndReencode()` (the EXISTING gate — never a parallel pipeline) → upload to `listing-photos` bucket under the seller's uid path → insert listing with `status='draft'` + fitment/category/photo child rows. Collect `{ row, error }` failures; return a results report (imported n / failed m with reasons). Audit-log the import (`metadata: { file, imported, failed }`).
**Bulk publish:** `/admin/listings?status=draft` checkbox-select → one action: `update listings set status='active', date_listed=now(), expires_at=now()+interval '90 days' where id = any($1) and status='draft'` (must set `expires_at` — the 0010 lifecycle expects it on active rows).
**Batch size / runtime:** run the import in a route handler (not a plain Server Action) with `export const maxDuration = 300`; process rows sequentially (photo fetches dominate); document ≤100 rows per file for v1. CSV text itself is far below the 4.5MB Vercel body cap — only photo bytes were ever the problem, and they arrive by URL server-side (this is why the locked decision is URLs, not file uploads).

### Anti-Patterns to Avoid
- **Gating only in `layout.tsx`:** every admin Server Action/route handler calls `requireAdmin()` itself. An action imported into a page is invocable directly via POST regardless of the layout.
- **A second sharp pipeline for CSV photos:** import MUST call `stripAndReencode()` from `lib/images/strip.ts`; extend the existing no-GPS regression test to the import path (cross-cutting EXIF gate re-verification).
- **Filtering hidden listings only in app queries:** the RLS SELECT policy is the boundary; app-side WHERE clauses are performance hints, not security.
- **Shipping raw event rows to client chart components:** aggregate server-side; the client receives `{ label, value }[]` only.
- **A pg enum for report status / restriction state:** keep `text + check` (0006/0010 precedent — cheap to extend).
- **Spanish strings anywhere in the console UI:** all admin copy in English (project rule), even though it's internal.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV parsing | split-on-comma parser | `papaparse` | Quoted fields, embedded commas/newlines, BOM, CRLF — all classic CSV landmines |
| Charts | SVG-by-hand | shadcn `chart` (Recharts) | Tooltips, responsive containers, theme tokens for free |
| EXIF strip on imported photos | new sharp chain | existing `stripAndReencode()` | It IS the audited P0 gate with a regression test |
| Admin emails | new mailer | clone `lib/messaging/notify.ts` `sendEmail` | Established Resend posture: best-effort, escaped HTML, never throws |
| auth.users stats | PostgREST tricks against `auth` schema | one `security definer` RPC with revoked public execute | `auth` schema isn't exposed; definer RPC is the sanctioned pattern |
| Admin identity | sessions table / custom middleware auth | `app_metadata.role` + `getClaims()` | Tamper-proof (service-role-writable only), zero extra queries, fits invariant #6 |

**Key insight:** Phase 9 and earlier already built the hard privacy machinery (append-only logs, service-role module, EXIF gate, email posture). Phase 10's job is to *consume* those rails, not re-create any of them.

## Common Pitfalls

### Pitfall 1: Admin claim doesn't appear after flagging
**What goes wrong:** You run `grant-admin.mjs`, reload, still 404 on `/admin`.
**Why:** `app_metadata` is baked into the access token at issuance; the existing session's JWT predates the flag.
**How to avoid:** Sign out/in (or force `refreshSession`) after granting. Document it in the script's output text.
**Warning signs:** `getClaims()` shows no `role` while the Supabase dashboard shows it on the user.

### Pitfall 2: RPC vs RLS drift on hidden/draft listings
**What goes wrong:** Hidden listing vanishes from search but its detail page still renders (or vice versa); profile `active_listing_count` still counts it.
**Why:** Visibility logic exists in three places: `search_listings` RPC WHERE clause, the `listings` SELECT policy, and the 0008 count RPC.
**How to avoid:** Make the SELECT policy the boundary (Pattern 4) and re-verify EVERY listing read surface in UAT: feed/search, detail page, public profile count, saved listings, "similar listings", messaging thread headers.
**Warning signs:** A hidden listing reachable by direct URL while absent from search.

### Pitfall 3: Suspension auto-reactivation depends on cron that doesn't run
**What goes wrong:** pg_cron is authored but UNSCHEDULED on Staging (0011 / Phase 5.1 memory); a cron-flipped `is_suspended` flag never flips back.
**How to avoid:** Lazy semantics everywhere (`suspended_until > now()` = suspended). Listing restore is the only side effect needing an actor — run the restore sweep when the expired-suspended user next hits the gate AND opportunistically on admin console loads (service role).
**Warning signs:** A user past `suspended_until` still seeing the blocked page or their listings still hidden.

### Pitfall 4: WALRUS / realtime policy bloat
**What goes wrong:** Messages realtime delivery gets slow or silently drops after extending the `messages` INSERT/SELECT policies.
**Why:** The SELECT policy on `messages` is evaluated per-change × per-subscriber by Realtime. 0016 deliberately kept it to one indexed EXISTS.
**How to avoid:** Add the restriction/freeze arms ONLY to the **INSERT** policy (writes are not the realtime hot path); never touch the SELECT policy. `user_restrictions` is PK-keyed on `user_id` and `message_threads.frozen_at` rides on the already-joined PK row — both arms are index hits.
**Warning signs:** Two-browser realtime UAT (the Phase 9 regression script) shows delayed delivery.

### Pitfall 5: Admin pages cached / served stale
**What goes wrong:** Dashboard shows stale counts, or worse, a non-admin sees a cached admin render.
**How to avoid:** `export const dynamic = "force-dynamic"` on every `app/admin` page + the layout calls `requireAdmin()` per request. No `revalidate` constants, no `unstable_cache` around service-role reads.
**Warning signs:** Numbers don't change after a known write; build output marks an admin route as static (○).

### Pitfall 6: CSV import outlives the function
**What goes wrong:** 50 rows × 5 photo downloads × sharp re-encode blows past the default function duration; import dies mid-file with partial writes.
**How to avoid:** Route handler with `maxDuration = 300`; per-row try/catch so one bad row never aborts the file (locked per-row validation decision); insert the listing only AFTER its photos all processed (or insert draft first, then photos, and report photo failures per-row). Keep v1 guidance at ≤100 rows/file.
**Warning signs:** Vercel `FUNCTION_INVOCATION_TIMEOUT` in logs; imports that work locally but fail deployed.

### Pitfall 7: PII discipline inside the console
**What goes wrong:** Admin user-list query joins `profiles_private` for the LIST view and someone later reuses that helper on a public surface.
**How to avoid:** PII (real name/email/phone) appears ONLY on the user **detail** page query, in `lib/admin/queries.ts`, `server-only`, named unambiguously (e.g. `getAdminUserDetailWithPII`). List views stay username-only. Never pass PII fields to client components as props beyond the detail view's needs.
**Warning signs:** A `profiles_private` join anywhere outside `lib/admin/` or the existing trusted modules.

### Pitfall 8: Thread-content unlock scope creep
**What goes wrong:** "There's a report on the LISTING, so show me the chat" — quietly widens the locked privacy decision (content opens only when there is a report on *that thread*).
**How to avoid:** The unlock check requires a report whose `message_id` belongs to the thread. Encode the rule in ONE function (`getThreadContentJustification(threadId)`) and audit-log with the justifying `report_id`.
**Warning signs:** Content page reachable for a thread with zero message reports.

## Code Examples

### Service-role read with admin gate (page skeleton)
```typescript
// app/admin/users/page.tsx
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: users } = await admin
    .from("profiles_public")
    .select("id, username, state_province, country, member_since")
    .order("member_since", { ascending: false })
    .limit(50);
  // render table…
}
```

### Enforcement action shape (suspend)
```typescript
// lib/actions/admin/enforcement.ts
"use server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin/audit";

const DURATIONS = { "24h": 1, "7d": 7, "30d": 30 } as const; // locked presets

export async function suspendUser(input: { userId: string; duration: keyof typeof DURATIONS; reason: string }) {
  const { adminId } = await requireAdmin();          // gate IN the action, always
  const admin = createAdminClient();
  const until = new Date(Date.now() + DURATIONS[input.duration] * 864e5).toISOString();
  await admin.from("user_restrictions").upsert({
    user_id: input.userId, state: "suspended", reason: input.reason,
    suspended_until: until, created_by: adminId,
  });
  await admin.from("listings")
    .update({ hidden_at: new Date().toISOString(), hidden_reason: "suspension" })
    .eq("seller_id", input.userId).is("hidden_at", null);
  await logAdminAction({ adminId, action: "user_suspend", targetType: "user",
    targetId: input.userId, reason: input.reason, metadata: { until } });
  await sendEnforcementEmail(input.userId, /* reason, until — best-effort */);
  revalidatePath("/admin/users");
}
```

### Grouped report queue query (service role, raw aggregate via RPC or PostgREST)
```sql
-- as a definer-free SQL the admin client calls via .rpc() (execute revoked from anon/authenticated)
select
  coalesce('listing:'||listing_id::text, 'comment:'||comment_id::text, 'message:'||message_id::text) as target_key,
  count(*) as report_count,
  array_agg(distinct reason) as reasons,
  min(created_at) as first_reported,
  bool_or(status = 'pending') as has_pending
from public.reports
group by 1
having bool_or(status = 'pending')   -- pending view; resolved/dismissed views invert
order by first_reported asc;
```

### CSV parse (server)
```typescript
import Papa from "papaparse";
const text = await file.text(); // CSV text from FormData — far under any body cap
const { data, errors } = Papa.parse<Record<string, string>>(text, {
  header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase(),
});
```

### Photo-URL → existing EXIF gate
```typescript
import { stripAndReencode } from "@/lib/images/strip";

async function importPhoto(url: string): Promise<Buffer> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("photo URL must be https");
  const res = await fetch(u, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`photo fetch failed (${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const result = await stripAndReencode(bytes, res.headers.get("content-type") ?? "");
  if (!result.ok) throw new Error(`photo rejected: ${result.error}`);
  return result.buffer; // webp, zero metadata — same gate as regular uploads
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getSession()` for server identity | `getClaims()` (project-wide since Phase 1) | @supabase/ssr 0.10 era | Admin gate uses the same verified-claims path |
| Supabase native `ban_duration` for suspensions | Custom `user_restrictions` table | n/a (design choice) | Native ban blocks login entirely — incompatible with the locked "logs in, sees blocked page, reads chats" UX |
| Recharts 2.x in shadcn charts | Recharts 3.x supported by shadcn chart component | shadcn updated for Recharts v3 during 2025 | Install via `npx shadcn@latest add chart`; accept the version the CLI pins (MEDIUM confidence — verify at install) |
| Cron-flipped suspension flags | Lazy `suspended_until > now()` predicates | n/a | Immune to the still-unscheduled pg_cron on Staging |

**Deprecated/outdated:** `@supabase/auth-helpers-nextjs` (already on the project's do-not-use list); nothing else in this phase's domain.

## Open Questions

1. **shadcn chart ↔ Recharts version pairing**
   - What we know: `recharts` latest is 3.8.1 (npm-verified today); shadcn's chart component migrated to support Recharts v3.
   - What's unclear: which exact recharts range the current shadcn CLI pins for this Tailwind v4 project.
   - Recommendation: install via `npx shadcn@latest add chart` and keep whatever it pins; do not hand-pick a recharts version. Low risk either way.

2. **"Most-searched makes" data sufficiency**
   - What we know: `search_events.facets.makeId` is logged only when the make facet was applied; free-text searches ("Peterbilt visor") log only `normalized_term`.
   - What's unclear: whether facet-only counting will look sparse early on.
   - Recommendation: count facet hits (makeId/modelId + fitsModelId) for v1 ADMA-03; optionally show top `normalized_term` strings as a separate "top search terms" ranking — cheap and honest. Do not attempt NLP make-extraction from raw terms.

3. **Warn action mechanics**
   - What we know: ladder starts at "warn"; email is the locked notification channel; a `notifications` table (0010, in-app) exists.
   - What's unclear: whether warn is email-only or also in-app.
   - Recommendation: email + audit row for v1 (matches "notified by email on every enforcement action"); optionally also insert a `notifications` row if the existing type-check constraint allows a new type cheaply. Planner can decide; don't build a new notification system.

4. **Vercel `maxDuration` ceiling on the current plan**
   - What we know: Hobby caps lower than Pro; `maxDuration = 300` requires a paid plan (Fluid compute defaults differ).
   - What's unclear: the project's current Vercel plan.
   - Recommendation: set `maxDuration` to the max the plan allows; keep per-file row guidance small (≤100) and the per-row error isolation regardless. Imports can also be run against Staging locally if prod times out — note in the import UI.

## Sources

### Primary (HIGH confidence)
- Project codebase (read directly this session): `supabase/migrations/0001,0003,0006,0010,0014,0016`, `lib/supabase/admin.ts`, `lib/messaging/notify.ts`, `lib/images/strip.ts`, `lib/search/events.ts`, `app/(public)/page.tsx` (facet keys), `lib/actions/account.ts` (getClaims pattern), `proxy.ts`/`lib/supabase/middleware.ts`, `.github/workflows/ci.yml`, `package.json`
- npm registry (queried today): recharts 3.8.1, papaparse 5.5.3, @types/papaparse 5.5.2, csv-parse 6.2.1
- Supabase auth model: `app_metadata` service-role-writable / in JWT; `auth.admin.updateUserById`; `auth` schema not exposed to PostgREST — consistent with the project's own Phase 1–9 verified usage

### Secondary (MEDIUM confidence)
- shadcn/ui chart component (Recharts-based, CLI-installed) — version pairing to verify at install time
- Vercel function `maxDuration` plan limits — verify against the project's plan when wiring the import route

### Tertiary (LOW confidence)
- None load-bearing.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — almost everything reused from the existing codebase; only papaparse + shadcn chart are new and both are commodity
- Architecture: HIGH — every pattern grounded in existing migrations/policies and explicit Phase-10 hooks left by Phases 5/7/9
- Pitfalls: HIGH — derived from this repo's own recorded lessons (pg_cron unscheduled, Vercel body cap, Resend staging restriction, WALRUS policy cost, RPC/RLS drift)
- Chart/CSV externals: MEDIUM — versions npm-verified, shadcn pairing to confirm at install

**Research date:** 2026-06-11
**Valid until:** ~2026-07-11 (stable domain; re-check shadcn chart + recharts pairing if delayed)
