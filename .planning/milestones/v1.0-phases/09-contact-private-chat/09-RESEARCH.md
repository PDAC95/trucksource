# Phase 9: Contact → Private Chat - Research

**Researched:** 2026-06-11
**Domain:** Contact-form trust spine + Supabase Realtime in-site chat (Postgres Changes), reporting/abuse logging, Resend notifications
**Confidence:** HIGH (stack is already in the repo; Realtime patterns verified against current Supabase docs via Context7)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Contact form flow
- **Login required** to contact a seller. The "Contact Seller About This Part" CTA redirects unauthenticated users to login/signup and returns them to the listing.
- **Buyer verification NOT required** — any authenticated account can contact. OTP verification is a seller (listing) requirement, not a buyer one. Rate limiting covers spam.
- Form presented as a **modal over the listing** — buyer keeps listing context.
- **Pre-fill Name/Email (and Phone if available) from the buyer's own `profiles_private` data, editable** before submit. (It's the buyer's own PII — no privacy issue.)
- After submit: **directly into the chat thread**, with the form's Message as the first chat message. Persist + admin copy happen server-side before the thread opens (invariant #5).

#### Chat threading & inbox
- **One thread per (listing, buyer) pair.** Same buyer asking about two parts from one seller = two threads.
- Inbox layout: **conversation list + active thread split view on desktop** (part photo, username, last message, unread badge per conversation); **list → thread as separate pages on mobile**.
- Thread header: **fixed part card** — photo, title, price, listing status (Active/Sold/Expired), clickable through to the listing.
- **Text-only messages in v1** (character limit; no photos in chat — avoids a second EXIF pipeline).
- **Chat identity is public username on both sides.** The buyer's real name from the contact form is visible only in the initial contact context (seller side) and to admin — never as the ongoing chat identity.

#### Realtime & notifications
- **Live message delivery via Supabase Realtime** (per ROADMAP: Postgres Changes first, schema future-proofed for Broadcast-from-trigger). **No typing indicators or read receipts in v1.**
- **Global unread badge** on a "Messages" nav entry, always visible for logged-in users.
- **Email notification on new messages** (via Resend): "new message about [part]" with sender username, part, ~100-char message snippet, and a "View message" button linking to the thread. Never reveals the other party's email (no reply-to leakage).
- **Throttle: max 1 email per thread until the recipient reads the thread** — prevents email-per-message flooding.
- Sender: **Take-Off Parts <notifications@…>** via the existing Resend setup; subject mentions username + part.
- Tone: **direct, trucker-friendly English** (e.g. "BigRigBob is asking about your Peterbilt hood") — consistent with site voice.
- **Opt-out toggle in account settings**: "Email me about new messages", on by default.

#### Thread lifecycle
- Re-clicking "Contact Seller" on a listing where the buyer already has a thread → **opens the existing thread directly** (no second form, no duplicate thread).
- Listing marked Sold/Expired: **existing threads stay open** (parties still coordinate the off-platform deal); thread header shows the Sold/Expired badge. **New contacts from that listing are no longer allowed.**
- **Block user**: either party can block the other; the blocked user can no longer message them in any thread. History preserved for abuse logs.
- **No deletion in v1** — MSG-04 requires the full log. At most, hide a thread from one's own inbox without deleting data.

#### Rate limiting & anti-spam
- New contact forms (new threads): **~10 per buyer per day**.
- In-chat messages: **soft burst limit ~20 messages/minute per user** — invisible in normal use, stops bots/flooding.
- Limit-hit UX: **clear, honest message with timeframe** — e.g. "You've reached the daily contact limit. Try again tomorrow."
- **No automatic content filtering in v1** (no link/phone/profanity blocking — sharing contact info is the legitimate off-platform flow). Report + abuse log + Phase 10 admin queue cover abuse.

#### Reporting (MSG-07)
- Report form: **predefined reasons dropdown** (Scam/Fraud, Harassment, Spam, Prohibited item, Wrong info, Other) **+ optional free-text detail**. Structured for Phase 10 triage.
- Placement: **kebab/⋯ contextual menu** on listing page, each comment, and each chat message with a "Report" action.
- Post-report: **confirmation toast only** — "Report submitted — our team will review it." No report-status tracking in v1 (review queue is Phase 10).
- Anti-abuse: **one report per user per item + general rate limit** on reports.

#### Admin copy (MSG-03)
- **DB row is the source of truth** (`contact_log`, read by Phase 10 console) **+ immediate email to admin** — visibility from day 1 without waiting for Phase 10.
- Admin email includes **full context**: form data (name, email, phone, message), buyer & seller usernames, listing, timestamp. Admin is trusted and sees PII by design for disputes.
- Admin destination: **`ADMIN_NOTIFICATIONS_EMAIL` env var** — stakeholder's inbox today, ops inbox later without code changes.
- **Reports also trigger an admin email** (same DB-row + email mechanism) — an unseen scam report pre-Phase-10 is dangerous.

### Claude's Discretion
- Exact rate-limit numbers/windows (anchor to ~10 new threads/day, ~20 msgs/min) and reuse of the project's existing rate-limiting pattern
- Modal vs page fallback details, loading/skeleton states, exact spacing/typography
- Empty-state styling (follow existing feed/garage empty-state patterns); copy anchor: "No messages yet. When you contact a seller — or a buyer contacts you — conversations appear here." + "Browse parts" CTA
- Exact email templates/subject lines (within the decided tone and content rules)
- Message character limit value
- How "hide thread from inbox" is modeled (if implemented)

### Deferred Ideas (OUT OF SCOPE)
- Photos/attachments in chat — would require routing through the EXIF-safe pipeline; revisit post-v1
- Report status tracking for reporters ("your report was actioned") — Phase 10+
- Notification digest scheduling (batched emails) — post-v1 if throttle proves noisy
- Archive threads (beyond simple hide) — backlog
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MSG-01 | Each listing has a "Contact Seller About This Part" action | Pattern 2 (contact CTA + modal on the existing 08-04 listing page); login-redirect mirrors SaveButton's anon login-invite precedent |
| MSG-02 | Buyer completes a contact form (Name, Email, Phone optional, Message) before any thread opens | Pattern 2 (RHF + zodResolver shared schema, the same Zod schema re-validates inside the Server Action — listings/comments precedent); pre-fill via owner-RLS `profiles_private` read |
| MSG-03 | Contact submission persisted + copy sent to administration BEFORE chat opens | Pattern 3 (single `submitContact` server action with hard guard ORDER: validate → `contact_log` insert (blocking) → admin email (best-effort, `alertSpendCap` posture) → thread+first-message insert) |
| MSG-04 | Every buyer→seller communication logged for abuse monitoring/dispute resolution | Schema design: `messages` is append-only (NO update/delete policies — absence of policy IS the enforcement, 0015 precedent); `contact_log` immutable; hide ≠ delete |
| MSG-05 | After form submit, a private in-site chat thread opens | Pattern 3 step 4 + redirect to `/messages/[threadId]`; `unique(listing_id, buyer_id)` makes re-contact resolve to the existing thread |
| MSG-06 | Buyer and seller exchange messages without exposing seller PII | Schema: `messages`/`message_threads` carry only auth UUIDs + body; identity rendered from `profiles_public` (resolvePublicName); Realtime payload contains only those columns; participant-only RLS |
| MSG-07 | User can report a listing, comment, or message for abuse | Pattern 5 (`reports` table, exclusive-arc target FKs, reason CHECK, unique-per-reporter-per-target, admin email clone) |
</phase_requirements>

## Summary

Phase 9 introduces **zero new dependencies**. Everything needed is already in the repo: `@supabase/supabase-js@2.106.x` ships the Realtime client (`supabase.channel(...).on('postgres_changes', ...)`), the browser client factory exists at `lib/supabase/client.ts`, Resend is already used via raw HTTP (`lib/verify/alert.ts`, `app/api/cron/near-expiry/route.ts`), RHF+zod+sonner+vendored shadcn primitives (Dialog, AlertDialog, Badge, Sheet) are installed, and the dependency-free count-based rate limiter has two proven incarnations (`lib/verify/ratelimit.ts` service-role variant, `lib/actions/comments.ts` owner-RLS head-count variant).

The phase is therefore mostly **schema + RLS design + one carefully-ordered server action**. The new ground is Supabase Realtime: this project has never enabled it. Two things must happen in the migration that no previous migration has done: `alter publication supabase_realtime add table public.messages` (without it, subscriptions connect and silently receive nothing), and a cheap, indexed participant SELECT policy on `messages` (Postgres Changes applies RLS per-subscriber via WALRUS — the policy runs for every change × every subscriber, so it must be a fast indexed EXISTS). The locked decision is Postgres Changes first; future-proofing for Broadcast-from-trigger is purely conventional: keep `thread_id` on every message row, adopt the topic naming `thread:{thread_id}` now, and an `AFTER INSERT` trigger calling `realtime.broadcast_changes()` can be added later with zero schema churn (verified current pattern, Supabase docs 2025).

The riskiest part is not realtime — it's the **guard order in `submitContact`** (invariant #5: contact_log row must exist and admin copy attempted before any thread/message insert; "open chat" is never wired as the primary action) and **PII discipline on three new surfaces**: the chat thread (usernames only), the email notifications (never reveal the counterparty's address, no reply-to leakage), and the recipient-email lookup for notifications, which is a legitimate server-only `profiles_private` read via the admin client that must never appear in any response (the near-expiry cron is the exact precedent).

**Primary recommendation:** One migration (`0016_messaging.sql`) creating `contact_log`, `message_threads`, `messages`, `user_blocks`, `reports` — all RLS-on in-migration, append-only message log, block enforcement inside the messages INSERT policy, realtime publication added for `messages` — then clone the existing action/reader/UI patterns (comments backend is the closest template) with Realtime as a thin client-component layer over server-fetched initial messages.

## Standard Stack

### Core (all already installed — no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.106.x (installed) | Realtime channels (`postgres_changes`), DB reads/writes | Already pinned; Realtime client is built in — no extra package |
| `@supabase/ssr` | 0.10.x (installed) | Cookie-bound server/browser clients | Browser client (`lib/supabase/client.ts`) carries the auth token Realtime needs for RLS-scoped delivery |
| `react-hook-form` + `zod` + `@hookform/resolvers` | installed | Contact form, message composer, report form | Same client+server shared-schema pattern as listings/comments |
| Resend HTTP API | n/a (fetch) | Buyer/seller new-message emails + admin copy emails | Existing posture in `lib/verify/alert.ts` and near-expiry cron — raw `fetch` to `api.resend.com/emails`, best-effort, swallowed errors |
| sonner / vendored shadcn (Dialog, AlertDialog, Badge, Sheet, DropdownMenu*) | installed | Modal contact form, report menu, toasts, badges | Existing UI system; *check whether a DropdownMenu primitive is vendored — the kebab report menu needs one (vendor it if absent, like Sheet in 07-03) |

### Supporting

| Asset | Where | Purpose | When to Use |
|-------|-------|---------|-------------|
| `lib/supabase/admin.ts` | exists | Service-role client | ONLY for: recipient-email lookup for notification emails (PII read, never returned) — same justification as near-expiry cron |
| `lib/seller/badge.ts` `resolvePublicName` | exists | Public display name resolution | Chat identity on both sides (username/display_name only) |
| `lib/actions/comments.ts` rate-limit head-count | exists | Dependency-free rate limiting | Clone for new-thread/day, messages/min, reports/day limits |
| `notifications` table (0010) | exists | In-app notification rows | NOT needed for chat unread (threads carry their own watermark) — do not overload it |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Realtime Postgres Changes | Broadcast-from-trigger (`realtime.broadcast_changes()`) | Locked decision: Postgres Changes first. Broadcast scales better but needs `realtime.messages` RLS + `setAuth()` + private channels. Schema/topic convention below keeps the move non-breaking |
| Realtime for the global unread badge | Server-rendered count + refresh on navigation | Recommended: server-rendered. A second long-lived subscription on every page for a badge is not worth it in v1; the badge updates on navigation and inside `/messages` it's live anyway |
| Per-thread polling | Realtime subscription | Realtime is the locked decision for in-thread delivery |

**Installation:** none — `npm install` adds nothing this phase.

## Architecture Patterns

### Recommended Structure (mirrors existing phases)

```
supabase/migrations/0016_messaging.sql   # all 5 tables + RLS + publication + indexes
lib/messaging/schema.ts                  # contactSchema, messageSchema, reportSchema + MESSAGE_MAX_LENGTH (DB-CHECK lockstep, 08-02 precedent)
lib/messaging/queries.ts                 # getMyThreads, getThread, getThreadMessages, unreadThreadCount — zero-PII readers, enumerated columns
lib/messaging/notify.ts                  # "server-only" best-effort Resend senders (new-message, admin contact copy, admin report copy) — alert.ts posture
lib/actions/contact.ts                   # submitContact (the invariant-#5 spine), getOrFindExistingThread
lib/actions/messages.ts                  # sendMessage, markThreadRead, hideThread, blockUser
lib/actions/reports.ts                   # submitReport
components/messaging/contact-seller-button.tsx  # CTA + login redirect + existing-thread shortcut
components/messaging/contact-form-modal.tsx     # RHF modal (Dialog), pre-filled
components/messaging/thread-view.tsx            # client: initial messages prop + realtime subscription + composer
components/messaging/report-menu.tsx            # kebab menu + report dialog (reused on listing/comment/message)
app/(app)/messages/page.tsx              # inbox (desktop split view; list on mobile), force-dynamic
app/(app)/messages/[threadId]/page.tsx   # thread page (mobile target; desktop deep-link), force-dynamic
```

### Pattern 1: Schema + RLS (the phase's foundation)

Proposed tables (refines ARCHITECTURE.md's sketch with the locked decisions):

```sql
-- contact_log — MSG-02/03/04 base of record. Buyer's form PII lives here BY DESIGN.
create table public.contact_log (
  id bigint generated always as identity primary key,
  listing_id bigint not null references public.listings(id),
  buyer_id uuid not null references auth.users(id),
  seller_id uuid not null references auth.users(id),
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text,
  message_text text not null,
  admin_emailed_at timestamptz,          -- best-effort email outcome; the ROW is the copy
  created_at timestamptz not null default now()
);
-- RLS: buyer INSERT (buyer_id = auth.uid() + listing active pre-check in policy);
-- seller SELECT own-listing rows (the "initial contact context" the seller is allowed to see);
-- buyer SELECT own rows; NO update/delete policies (immutable log); admin reads via service role (Phase 10).

-- message_threads — one per (listing, buyer)
create table public.message_threads (
  id bigint generated always as identity primary key,
  listing_id bigint not null references public.listings(id),
  buyer_id uuid not null references auth.users(id),
  seller_id uuid not null references auth.users(id),
  contact_log_id bigint not null references public.contact_log(id),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  buyer_last_read_at timestamptz,        -- read watermarks (comments_seen_at precedent)
  seller_last_read_at timestamptz,
  buyer_emailed_at timestamptz,          -- email-throttle watermarks (1 email per thread until read)
  seller_emailed_at timestamptz,
  buyer_hidden_at timestamptz,           -- "hide from inbox" without deleting (MSG-04)
  seller_hidden_at timestamptz,
  unique (listing_id, buyer_id)          -- one-thread-per-(listing,buyer), race-proof
);
-- RLS: SELECT/UPDATE for participants only: (select auth.uid()) in (buyer_id, seller_id).
-- INSERT only via the buyer (buyer_id = auth.uid()) — created inside submitContact AFTER contact_log.

-- messages — append-only chat log
create table public.messages (
  id bigint generated always as identity primary key,
  thread_id bigint not null references public.message_threads(id),
  sender_id uuid not null references auth.users(id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages (thread_id, created_at);
-- RLS SELECT: participant of the thread (indexed EXISTS — this policy runs per-change
--   per-subscriber under Realtime WALRUS, keep it ONE indexed lookup):
--   exists (select 1 from public.message_threads t
--           where t.id = messages.thread_id
--             and (select auth.uid()) in (t.buyer_id, t.seller_id))
-- RLS INSERT: sender_id = auth.uid() AND participant AND NOT blocked-either-direction:
--   ... and not exists (select 1 from public.user_blocks b
--           where (b.blocker_id = t.buyer_id and b.blocked_id = t.seller_id
--                  or b.blocker_id = t.seller_id and b.blocked_id = t.buyer_id))
-- NO update, NO delete policies — the absent policy IS the MSG-04 enforcement (0015 precedent).

-- user_blocks
create table public.user_blocks (
  blocker_id uuid not null references auth.users(id),
  blocked_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
-- RLS: owner INSERT/DELETE/SELECT (blocker_id = auth.uid()).
-- (DELETE = unblock; the block table is not the abuse log — messages/contact_log are.)

-- reports — MSG-07, exclusive-arc target (fitment_rules num_nonnulls precedent)
create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users(id),
  listing_id bigint references public.listings(id),
  comment_id bigint references public.listing_comments(id),
  message_id bigint references public.messages(id),
  reason text not null check (reason in
    ('scam_fraud','harassment','spam','prohibited_item','wrong_info','other')),
  detail text,
  created_at timestamptz not null default now(),
  check (num_nonnulls(listing_id, comment_id, message_id) = 1)
);
create unique index reports_once_listing on public.reports (reporter_id, listing_id) where listing_id is not null;
create unique index reports_once_comment on public.reports (reporter_id, comment_id) where comment_id is not null;
create unique index reports_once_message on public.reports (reporter_id, message_id) where message_id is not null;
-- RLS: reporter INSERT (reporter_id = auth.uid()); reporter SELECT own rows (or none);
-- NO update/delete. Admin reads via service role (Phase 10 queue).

-- Realtime: REQUIRED or subscriptions silently receive nothing
alter publication supabase_realtime add table public.messages;
```

**Notes for the planner:**
- Reporting a *message* requires the reporter to be a thread participant — enforce in the INSERT policy (EXISTS through messages→threads), otherwise message ids are guessable.
- `comment_id` FK: comments hard-DELETE with cascade (Phase 8). Use `on delete set null`? No — `set null` breaks the exclusive-arc CHECK. Recommend `on delete cascade` on the report (the deletion audit table still has the comment) and note it; alternatively keep the FK plain and let a comment-delete fail if reported — cascade is cleaner for v1.
- Every table: RLS enabled in the same migration (invariant #2), policies scoped with `(select auth.uid())`.

### Pattern 2: Contact CTA + modal (MSG-01/02)

- CTA on the listing detail page (08-04 owns that surface): server component already knows `viewerId`, listing status, and seller. Render rules: owner → no CTA; anon → CTA links to `/login?next=/listings/[id]` (match existing login-invite precedent); listing not active → no new-contact CTA (existing threads still accessible via inbox); buyer with an existing thread → CTA becomes "View conversation" linking straight to `/messages/[threadId]` (locked: no second form). The existing-thread check is one indexed owner-RLS read on `message_threads`.
- Modal: vendored `Dialog` + RHF + `zodResolver(contactSchema)`; defaults loaded server-side from the buyer's OWN `profiles_private` via the cookie client (owner RLS — pass as props to the modal, never fetched client-side from a generic endpoint).
- `contactSchema`: `{ name: 1..100 trimmed, email: email(), phone: optional, message: 1..MESSAGE_MAX_LENGTH }` — single schema, client UX + server trust boundary (project rule).

### Pattern 3: `submitContact` guard order (invariant #5 — the spine)

```
1. getClaims() → unauthenticated? return error        (never getSession)
2. zod re-validate
3. rate limit: count contact_log rows by buyer_id in 24h ≥ 10 → "daily contact limit"
4. listing pre-check (enumerated id/status/seller_id): missing → not_found;
   not active → contacts_closed; seller_id === buyer → invalid
5. existing-thread check (unique(listing_id,buyer_id)) → return { threadId } (no new row anywhere)
6. INSERT contact_log  ← BLOCKING. Failure = whole action fails, no thread.
7. Admin copy email (lib/messaging/notify.ts) — attempted now, BEFORE the thread;
   best-effort (alert.ts posture: try/catch, swallow; stamp admin_emailed_at on success).
   The contact_log ROW is the admin copy of record (locked decision).
8. INSERT message_threads (on conflict (listing_id,buyer_id) do nothing → re-read if raced)
9. INSERT first messages row (sender = buyer, body = form message)
10. Seller new-message email (throttled — Pattern 6), best-effort
11. revalidate + return { threadId } → client routes to /messages/[threadId]
```

Steps 6→9 are sequential best-effort inserts (the project's established posture — 05-RESEARCH Open Q3; an atomic RPC is a documented future upgrade). The failure mode that matters for the invariant is benign: contact persisted but thread missing → buyer retries, step 5/8 dedupes.

### Pattern 4: Realtime thread view (MSG-05/06)

Server page fetches the thread + initial messages + both participants' public names (enumerated `profiles_public` columns via `resolvePublicName` — never `profiles_private`, never `*`). A client component receives them and subscribes:

```typescript
// Source: supabase.com/docs/guides/realtime/subscribing-to-database-changes (verified via Context7)
"use client";
const supabase = createClient();          // lib/supabase/client.ts — auth token rides on subscribe
useEffect(() => {
  const channel = supabase
    .channel(`thread:${threadId}`)        // topic convention: STABLE — Broadcast reuses it later
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "messages",
        filter: `thread_id=eq.${threadId}` },
      (payload) => addMessage(payload.new as MessageRow), // de-dupe by id vs optimistic insert
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [threadId]);
```

- RLS is the delivery boundary (WALRUS evaluates the `messages` SELECT policy per subscriber); the `filter` is a convenience, **not** security.
- `sendMessage` is a normal Server Action (getClaims → zod → 20/min head-count rate limit → insert under RLS → throttled recipient email → revalidate). The sender renders optimistically; the realtime echo de-dupes by message id.
- Sender identity in the UI comes from the already-fetched participant map (`sender_id` → public name); the realtime payload itself contains only `thread_id/sender_id/body/created_at` — zero PII by construction.
- **Broadcast future-proofing (the ROADMAP non-breaking requirement) is convention, not schema:** (a) every message row carries `thread_id`; (b) topic = `thread:{thread_id}`; (c) clients render from full message rows. Later: add an `AFTER INSERT` trigger calling `realtime.broadcast_changes('thread:' || NEW.thread_id, ...)`, add a `realtime.messages` SELECT policy keyed on `SPLIT_PART(topic,':',2)::bigint` thread membership, switch the client to `config: { private: true }` + `supabase.realtime.setAuth()` + `.on('broadcast', { event: 'INSERT' }, ...)`. No table change. (Verified current pattern via Context7 — `realtime.broadcast_changes` docs + 2025-04 Supabase blog.)

### Pattern 5: Reporting (MSG-07)

One reusable `ReportMenu` (kebab → dialog with reason select + optional detail) mounted on: listing detail page, each comment, each chat message. `submitReport` server action: getClaims → zod → head-count rate limit (e.g. 10 reports/day) → target-existence/authz pre-check for clean errors (RLS is the real gate) → insert; unique-index violation → friendly "already reported" toast; then best-effort admin email (notify.ts). Confirmation toast only.

### Pattern 6: Email notifications + throttle

`lib/messaging/notify.ts` (`import "server-only"`):
- **Recipient resolution is the one service-role PII read**: `admin.from("profiles_private").select("email, message_email_opt_out").eq("id", recipientId)` — never returned to the client; same justification as near-expiry cron (the only other cross-user PII read in the app).
- **Throttle**: send only if the recipient-side `*_emailed_at` watermark is null OR `*_last_read_at > *_emailed_at` (they read since the last email). On send, stamp the watermark. `markThreadRead` (fired when the recipient opens the thread, owner-RLS UPDATE on their watermark column) re-arms it. Small races are acceptable (ratelimit.ts precedent — documented, conservative).
- **Opt-out**: add `message_email_opt_out boolean not null default false` to **`profiles_private`** (owner-only table; it's fetched in the same admin read as the email; no public surface needs it). Account-settings toggle clones the `contact-preference-form.tsx` pattern. Note this column rides in migration 0016.
- Content rules (locked): sender USERNAME + part title + ≤100-char snippet + "View message" link to the thread; `from: Take-Off Parts <notifications@…>` via existing Resend env; **no reply-to, never the counterparty's email**. Until the pre-launch domain verification, `onboarding@resend.dev` only delivers to the Resend account address (known constraint — MEMORY/STATE) — emails are best-effort by posture, so this degrades silently in staging; flag in the plan's UAT notes.

### Anti-Patterns to Avoid

- **Opening the thread before `contact_log` persists** (ARCHITECTURE.md Anti-Pattern 3) — the action order in Pattern 3 is non-negotiable.
- **Treating the `filter:` param or channel name as authorization** — only the `messages` SELECT RLS policy gates delivery.
- **Putting any PII in `messages`/`message_threads` rows** — realtime ships full rows to authorized subscribers; identity stays UUID + public-name resolution.
- **Wiring the unread badge to `notifications`** — that table is the service-role-written near-expiry surface; chat unread derives from thread watermarks.
- **Update/delete policies on `messages` or `contact_log`** — MSG-04: absence of policy is the enforcement.
- **`getSession()` anywhere; missing `force-dynamic` on `/messages` pages** — personalized routes must be dynamic (invariant #6).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Live message delivery | Polling loop / SSE endpoint / custom WS | Supabase Realtime Postgres Changes | Built into the installed client; RLS-scoped delivery for free |
| Rate limiting | Redis/Upstash, token buckets | Count-query head-count (comments.ts pattern) on `contact_log`/`messages`/`reports` | Proven twice in this repo; dependency-free; RLS-compatible |
| Duplicate-thread prevention | App-level check-then-insert only | `unique (listing_id, buyer_id)` + on-conflict handling | Races are real; the DB constraint is the truth |
| One-report-per-item | App-level dedupe | Partial unique indexes per target column | Same reason |
| Block enforcement | Per-action JS checks scattered around | `NOT EXISTS user_blocks` inside the messages INSERT RLS policy | Single enforcement point; can't be bypassed by a new code path |
| Email sending | SDK/nodemailer/queue | Existing raw-fetch Resend posture (alert.ts) | Already the project's pattern; best-effort + swallowed errors |
| Message ordering/identity | Client-generated ids/timestamps | `bigint identity` + server `created_at` | Realtime echo de-dupes by server id; clocks lie |

**Key insight:** the project already contains a working template for every sub-problem here except the WebSocket subscription itself; the planner should clone postures (comments backend = actions/readers; alert.ts = emails; 0015 = RLS style), not invent new ones.

## Common Pitfalls

### Pitfall 1: Realtime silently delivers nothing
**What goes wrong:** Subscription connects fine, no events ever arrive.
**Why:** `messages` not added to the `supabase_realtime` publication, or the subscriber's SELECT RLS policy denies the row, or Realtime isn't enabled for the table — all fail silently.
**How to avoid:** `alter publication supabase_realtime add table public.messages` in 0016; verify live (two authed clients, insert from one, assert receipt on the other) at the human-verify checkpoint; also assert a NON-participant client receives nothing (the privacy gate).
**Warning signs:** Chat only updates on refresh.

### Pitfall 2: Expensive RLS policy on a realtime table
**What goes wrong:** Per-change × per-subscriber WALRUS evaluation of the `messages` SELECT policy melts under load if it joins broadly.
**How to avoid:** Single indexed EXISTS against `message_threads(id)` (PK lookup); keep the block check OUT of the SELECT policy (blocks gate sending, not reading history — locked decision preserves history).

### Pitfall 3: Invariant #5 ordering drift
**What goes wrong:** A refactor (or the "View conversation" shortcut) creates a path where a thread/message exists with no `contact_log` row.
**How to avoid:** Thread creation lives ONLY inside `submitContact`, after the contact insert; `message_threads.contact_log_id NOT NULL` makes the invariant structural. Unit-test the guard order (listing-actions/comments test precedent: assert no thread insert occurs when the contact insert fails).

### Pitfall 4: PII leakage via the new surfaces
**What goes wrong:** Buyer's form name/email rendered as chat identity; seller email in a notification payload or reply-to; `select('*')` on contact_log feeding a UI.
**How to avoid:** Chat identity = `resolvePublicName(profiles_public)` on BOTH sides (locked); contact-form data rendered ONLY in the seller's "initial contact" context block and sourced from a seller-scoped enumerated `contact_log` read; extend the privacy grep gates + contract tests (PII-keys denylist in `tests/integration/_supabase.ts`) to `messages`, `message_threads`, and the thread reader shapes.

### Pitfall 5: Email flooding / dead-email UX
**What goes wrong:** One email per message; or notifications hard-fail the send action when Resend is down; or staging emails go nowhere and the throttle logic is assumed broken.
**How to avoid:** Watermark throttle (Pattern 6), best-effort try/catch posture, and an explicit UAT note that `resend.dev` only delivers to the account address until the pre-launch domain verification.

### Pitfall 6: Unread badge surface mismatch
**What goes wrong:** "Always visible for logged-in users" badge added only to the `(app)` header — but the feed `/` lives in `(public)` with its own inline header, so the most-trafficked page shows nothing.
**How to avoid:** Plan the badge as a small server-resolved component mounted in BOTH headers (or extract a shared header). Count = threads where viewer is participant AND `last_message_at > viewer's last_read_at` AND last sender ≠ viewer (cheap with the `(buyer_id)`/`(seller_id)` indexes; v1 can approximate with `last_message_at > coalesce(watermark,'-infinity')`).

### Pitfall 7: Client subscription lifecycle leaks
**What goes wrong:** Channels accumulate across route changes; stale closures append to the wrong thread.
**How to avoid:** Subscribe in `useEffect` keyed on `threadId`, `removeChannel` in cleanup; de-dupe by message id; on `subscribe` status `CHANNEL_ERROR`/`TIMED_OUT`, fall back to a refetch (messages are persisted — refresh always heals).

### Pitfall 8: Parallel-wave/husky hazards (project-specific)
**What goes wrong:** lint-staged stash/restore cross-attributes files between parallel plans (recorded in MEMORY).
**How to avoid:** Verify by file-on-disk; keep wave file-ownership disjoint (UI vs backend vs migration), as Phase 8 did.

## Code Examples

### Broadcast-from-trigger (the FUTURE migration this schema must not break)
```sql
-- Source: supabase.com/docs/guides/realtime/broadcast (verified via Context7, current as of 2025 docs)
create or replace function public.broadcast_message_changes()
returns trigger security definer set search_path = '' as $$
begin
  perform realtime.broadcast_changes(
    'thread:' || new.thread_id::text, tg_op, tg_op,
    tg_table_name, tg_table_schema, new, old);
  return null;
end; $$ language plpgsql;
-- + AFTER INSERT trigger on public.messages
-- + realtime.messages SELECT policy keyed on SPLIT_PART(topic, ':', 2)::bigint membership
```
Nothing in 0016 needs to change for this — which is the proof the v1 schema satisfies the ROADMAP constraint.

### Existing-repo templates to clone (load-bearing precedents)
- `lib/actions/comments.ts` — guard order, dependency-free rate limit, no-existence-leak `not_found`, RLS-as-authz.
- `lib/verify/alert.ts` — best-effort Resend + durable-row posture for the admin copy / report email.
- `app/api/cron/near-expiry/route.ts` — the sanctioned cross-user `profiles_private.email` service-role read.
- `0015_social.sql` — RLS style: structural rules in policies, qualified `NEW`-row columns in EXISTS subqueries (the depth-1 bug lesson: always qualify `messages.thread_id` etc. inside policy subqueries).
- `app/(app)/sell/listings` + `/saved` — force-dynamic getClaims→redirect page guard, empty states, badge patterns.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `postgres_changes` for all realtime | Broadcast (incl. `broadcast_changes` from triggers) recommended for chat at scale | Supabase guidance, 2024–2025 | v1 stays on Postgres Changes (locked, fine at launch volume); topic/schema conventions above make the move additive |
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | already adopted | n/a |
| Public realtime channels | Private channels + `realtime.messages` RLS + `setAuth()` | GA 2024 | Only needed when Broadcast lands; not used in v1 |

**Deprecated/outdated:** nothing newly relevant; the installed `supabase-js@2.106.x` Realtime API (`channel().on('postgres_changes',…)`) is current.

## Open Questions

1. **Where the global unread badge lives on the public feed**
   - What we know: `(app)/layout.tsx` has a header (Saved/Heart precedent); the feed `/` is in `(public)` with no shared header.
   - What's unclear: whether to extract a shared header or mount the badge twice.
   - Recommendation: planner decides during UI plan; cheapest v1 = mount the same server component in both places.

2. **`reports.comment_id` vs comment hard-delete cascade**
   - What we know: comments delete with cascade + a deletion audit table.
   - Recommendation: `on delete cascade` on the report FK and rely on the audit log + admin email for trace; note in migration comment.

3. **Desktop split-view implementation shape**
   - What we know: list+thread split on desktop, separate pages on mobile (locked).
   - Recommendation: simplest robust v1 = `/messages` renders list + (on `?thread=` or a parallel segment) the active thread; avoid Next parallel-routes complexity unless the planner prefers it — pure layout/CSS with the thread page reused is fine. Claude's discretion per CONTEXT.

4. **Message character limit** — discretion; recommend `MESSAGE_MAX_LENGTH = 2000` (DB CHECK + shared zod constant, comments lockstep precedent).

5. **Realtime token refresh on long-lived threads** (LOW confidence)
   - supabase-js auto-refreshes auth and re-sends the token on the socket; not verified against this exact version for postgres_changes re-authorization mid-session. Mitigation already in design: messages persist, refetch-on-error heals. Validate during live UAT (leave a thread open > 1h is the only real test; don't block the phase on it).

## Sources

### Primary (HIGH confidence)
- Context7 `/supabase/supabase` — Realtime: subscribing-to-database-changes (publication requirement, `postgres_changes` INSERT subscribe), broadcast.mdx + getting_started.mdx (`realtime.broadcast_changes` trigger pattern, `realtime.messages` RLS, `setAuth()`/private channels), WALRUS RLS-scoped delivery, chat RLS policy examples (participant EXISTS).
- This repo: `lib/actions/comments.ts`, `lib/verify/ratelimit.ts`, `lib/verify/alert.ts`, `app/api/cron/near-expiry/route.ts`, `supabase/migrations/0009/0010/0015`, `lib/supabase/{client,admin}.ts`, `app/(app)/layout.tsx`, `app/(public)/page.tsx` — verified directly.
- `.planning/research/ARCHITECTURE.md` (contact→chat flow, schema sketch), `.planning/research/STACK.md` (Postgres Changes first / Broadcast later, pinned versions), CLAUDE.md invariants.

### Secondary (MEDIUM confidence)
- Supabase blog 2025-04 "Realtime Broadcast from Database" (via Context7) — client listener shape for the future Broadcast migration.

### Tertiary (LOW confidence)
- Realtime token-refresh behavior on very long-lived `postgres_changes` subscriptions (Open Question 5).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; everything verified installed in this repo
- Architecture: HIGH — schema/RLS/action patterns are direct extensions of proven in-repo precedents; Realtime patterns verified against current Supabase docs
- Pitfalls: HIGH for publication/RLS/ordering/PII (doc-verified or repo-proven); LOW only for long-session token refresh (flagged)

**Research date:** 2026-06-11
**Valid until:** ~2026-07-11 (stable stack; Supabase Realtime guidance moves slowly)
