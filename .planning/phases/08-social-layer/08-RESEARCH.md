# Phase 8: Social Layer - Research

**Researched:** 2026-06-10
**Domain:** Supabase Postgres/RLS + Next.js Server Actions (comments, saves, mark-as-sold) — all in-repo patterns
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Comment behavior
- One level of replies: comment → flat replies underneath (Facebook Marketplace style). No multi-level nesting.
- Any logged-in user can comment (buyers and sellers alike) — maximizes social activity per the "public social interaction" pillar.
- Users can delete their own comments; no editing (avoids changing context after the seller replied).
- Display order: newest first (top-level comments); replies read in conversation order under their parent.

#### Seller control over comments
- Seller can delete ANY comment on their own listings — direct spam/troll control before Phase 10 admin exists. Deletions are logged (who deleted, when) for later audit.
- No "close comments" toggle in v1 — comments stay open; per-comment deletion is the moderation tool.
- Deleting a comment cascades to its replies (no orphans, no "[deleted]" placeholders).
- Seller gets a simple in-app indicator of new comments (badge/counter on "my listings") — NOT a full notification system (that would be its own phase).

#### Saved listings experience
- Save button (heart/bookmark icon) on listing cards in feed/search AND on the listing detail page.
- Saved listings page reuses the Phase 7 search card grid component — consistent UI, fast to build.
- Saved listings that get sold/expired REMAIN in the list with a status badge ("Sold"/"Expired") — user removes them manually; nothing disappears silently.
- Seller sees a save COUNT on their own listings (e.g. "12 saves") — never WHO saved (privacy). Count is seller-facing, not public.

#### Sold behavior
- Marking "Sold": listing page stays live with a "Sold" badge (links and saves don't break), but the listing is removed from search results and feed.
- Reversible: seller can "Mark as available" again (off-platform sales can fall through; zero friction to correct).
- Comments on a sold listing: existing comments remain visible; new comments are closed.
- Mark-as-sold action lives in both the seller's own listing detail page AND the "my listings" management view, with a simple confirmation before applying.

### Claude's Discretion
- Exact UI for delete confirmation, badges, comment composer
- Comment length limits and basic rate limiting
- Empty states (no comments yet, no saved listings)
- Schema details for the deletion audit log

### Deferred Ideas (OUT OF SCOPE)
- Full notification system (email/push for comments, saves, etc.) — own phase; v1 ships only the in-app new-comment indicator.
- Public save counts as social proof — revisit after Analytics (Phase 10) shows engagement data.

### Specific Ideas
- Comments should feel like Facebook Marketplace Q&A: one reply level, seller answering buyer questions inline.
- Privacy invariant restated: comment attribution is username only — never join to `profiles_private` on any public surface.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SOCL-01 | Buyer can post a public comment on a listing, attributed to their username only | `listing_comments` table (Pattern 1), RLS posture (public-read, author-insert, author-OR-seller-delete), enumerated `profiles_public` join via existing `resolvePublicName`, depth-1 reply enforcement in the insert policy, deletion audit trigger |
| SOCL-02 | Buyer can save (bookmark) a listing and view their saved listings | `saved_listings` table (Pattern 2), owner-only RLS on ALL operations, toggle Server Action, saved page reusing `ListingCard`/`SearchCard` shape with status badges, security-definer save-count RPC |
| LIST-06 | Seller can mark their own listing as "Sold" | `markSold`/`markAvailable` Server Actions mirroring `renewListing` (Pattern 3); `status='sold'` already admitted by the 0010 CHECK; `search_listings` RPC already filters `status='active'` so sold drops out of feed/search with zero search changes; public page status gate must change from `notFound()` to render-with-badge |
</phase_requirements>

## Summary

Phase 8 is almost entirely an **in-repo pattern-replication phase**. Every hard problem it touches already has a solved, committed precedent: owner-scoped Server Actions with getClaims + RLS (`lib/actions/listings.ts` renew/reactivate), public-read/owner-write child tables with EXISTS-on-parent policies (`listing_fitment`, `listing_photos`), insert-only audit streams with no select policy (`listing_view_events`, `search_events`), security-definer RPCs with `set search_path = ''` (`active_listing_count`), batch card hydration with no N+1 (`lib/search/queries.ts`, 07-04 profile grid), and zero-PII contract tests live against Staging. No new dependencies are needed — `alert-dialog`, `textarea`, `badge`, `sonner`, and lucide icons are already vendored/installed.

The three genuinely new design points this research resolves: (1) **depth-1 reply enforcement and comments-closed-when-sold both belong in the `listing_comments` INSERT RLS policy**, not just app code — RLS policies may subquery, so `parent must be top-level` and `listing must be active` are structurally enforceable; (2) the **deletion audit log is a default-deny table written by a `BEFORE DELETE` row trigger** (`security definer`, captures `auth.uid()` as deleter) — this automatically logs cascade-deleted replies too, which a Server-Action-side log would miss; (3) the **seller-facing save count must be a security-definer RPC scoped to `seller_id = auth.uid()`** — a SELECT policy letting sellers read save rows would expose WHO saved (user_id), violating the locked privacy decision.

One existing behavior must change: `app/(public)/listings/[id]/page.tsx` currently `notFound()`s any non-active listing. The locked sold decision requires sold listings to render publicly with a "Sold" badge (comments read-only). Expired listings stay hidden (LIST-09 unchanged — the sold decision does not cover expired).

**Primary recommendation:** One migration (`0015_social.sql`) with three tables + one trigger + one RPC, three small Server Action modules cloning existing trust-boundary patterns, and UI that composes the existing Phase 7 card grid. No new packages, no Realtime, no notification infrastructure.

## Standard Stack

### Core (all already installed — no `npm install` needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/ssr + supabase-js | 0.10.3 / 2.106.2 | Cookie-bound user client; RLS is the authz boundary | Repo invariant; every action in `lib/actions/*` uses it |
| zod | 4.4.3 | Comment body schema, shared client+server | Repo invariant #LIST pattern (`lib/listings/schema.ts`) |
| react-hook-form + @hookform/resolvers | 7.77 / 5.4 | Comment composer form | Same as listing/account forms |
| shadcn vendored: `alert-dialog`, `badge`, `textarea`, `sonner`, `button`, `card`, `skeleton` | in `components/ui/` | Confirmations, badges, composer, toasts | Already vendored — do NOT re-vendor |
| lucide-react | 1.17 | Heart/Bookmark, Trash2, MessageSquare icons | Already installed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server-rendered comments + `revalidatePath` | Supabase Realtime live comments | Realtime is deliberately deferred to Phase 9 (chat). Comments are low-frequency; revalidate-on-action is sufficient and avoids opening the Realtime surface a phase early. Do NOT use Realtime here. |
| Trigger-based deletion audit | Audit insert inside the delete Server Action | Action-side logging misses FK-cascaded reply deletions (the cascade happens in the DB, not the action). Trigger logs every physical row delete. |
| `comments_seen_at` column on `listings` | A `notifications`-row-per-comment scheme | Notifications inserts require service-role (table has NO authenticated insert policy) or a definer trigger — that's the deferred notification system. A seen-watermark column + one grouped count query is the v1-sized indicator. |

## Architecture Patterns

### Recommended File Layout (mirrors existing phases)

```
supabase/migrations/0015_social.sql      # comments + saves + audit + sold-aware bits, RLS in-migration
lib/comments/schema.ts                   # zod commentSchema (body 1..1000, parentId optional)
lib/comments/queries.ts                  # getListingComments(listingId) — enumerated, zero-PII
lib/actions/comments.ts                  # "use server": addComment, deleteComment, markCommentsSeen
lib/saves/queries.ts                     # getMySavedListings(), getSavedIds(listingIds), getMySaveCounts()
lib/actions/saves.ts                     # "use server": toggleSave
lib/actions/listings.ts                  # += markSold(id), markAvailable(id)  (clone renewListing)
components/comments/comment-section.tsx  # server-rendered thread (newest-first parents, asc replies)
components/comments/comment-composer.tsx # client form (RHF + zod), hidden parentId for replies
components/search/save-button.tsx        # client heart toggle (auth-aware, optimistic)
app/(app)/saved/page.tsx                 # saved listings grid (reuses ListingCard/SearchCard shape)
app/(app)/sell/listings/                 # += sold toggle + new-comment badge on owner cards
app/(public)/listings/[id]/page.tsx      # MODIFIED: sold renders w/ badge; comments section added
tests/integration/social.test.ts         # RLS + policy gates live vs Staging
tests/integration/social.contract.test.ts# zero-PII comment/save read-surface contract
tests/unit/comment-schema.test.ts        # zod limits
tests/unit/social-actions.test.ts        # guard-order tests (mocked client, mirrors listing-actions.test.ts)
```

### Pattern 1: `listing_comments` — public-read, structural depth-1 + active-only in RLS

**What:** One table holds parents and replies (`parent_id` nullable, self-FK `on delete cascade`). The INSERT policy enforces all three locked rules at the DB layer; the Server Action re-validates the same rules for clean error messages.

```sql
-- 0015_social.sql (RLS enabled in the SAME migration — invariant #2)
create table public.listing_comments (
  id bigint generated always as identity primary key,
  listing_id bigint not null references public.listings(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_id bigint references public.listing_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index listing_comments_listing_idx on public.listing_comments (listing_id, created_at desc);
create index listing_comments_parent_idx on public.listing_comments (parent_id);

alter table public.listing_comments enable row level security;

create policy "comments public-read" on public.listing_comments
  for select to anon, authenticated using (true);

-- Insert: must be self-attributed, listing must be ACTIVE (sold/expired = comments
-- closed), and a reply's parent must itself be top-level (depth-1, no nesting).
create policy "comments author-insert" on public.listing_comments
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and exists (
      select 1 from public.listings l
      where l.id = listing_id and l.status = 'active'
        and (l.expires_at is null or l.expires_at > now())
    )
    and (
      parent_id is null
      or exists (
        select 1 from public.listing_comments p
        where p.id = parent_id
          and p.listing_id = listing_id   -- reply stays on the same listing
          and p.parent_id is null         -- depth-1: parent must be top-level
      )
    )
  );

-- Delete: own comment OR any comment on a listing you sell. NO update policy
-- (locked decision: no editing).
create policy "comments author-or-seller-delete" on public.listing_comments
  for delete to authenticated using (
    (select auth.uid()) = author_id
    or exists (
      select 1 from public.listings l
      where l.id = listing_id and l.seller_id = (select auth.uid())
    )
  );
```

**Note on self-referencing policy:** the depth-1 subquery on `listing_comments` inside its own INSERT policy is safe — it routes through the table's SELECT policy (`using (true)`), which doesn't reference the table again, so no recursion. Confidence HIGH (standard Postgres RLS semantics; same EXISTS-subquery style as `listing_fitment owner-write`).

**Read shape (zero-PII):** `getListingComments` selects enumerated columns and resolves the author via `profiles_public` only — never `select('*')`, never `profiles_private`:

```ts
// lib/comments/queries.ts — mirrors lib/search/queries.ts batch hydration
const { data } = await supabase
  .from("listing_comments")
  .select("id, listing_id, author_id, parent_id, body, created_at")
  .eq("listing_id", listingId);
// then ONE batched profiles_public read:
//   .from("profiles_public").select("id, username, display_name").in("id", authorIds)
// and resolvePublicName(...) from lib/seller/badge.ts for attribution.
// Sort in app code: parents created_at DESC, replies under parent created_at ASC.
```

### Pattern 2: `saved_listings` — owner-only everything + definer count RPC

**What:** Saves are private. NO public/anon read at all; the only non-owner visibility is an aggregate count exposed exclusively to the listing's seller via a security-definer RPC.

```sql
create table public.saved_listings (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id bigint not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index saved_listings_listing_idx on public.saved_listings (listing_id);

alter table public.saved_listings enable row level security;

create policy "saves owner-select" on public.saved_listings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "saves owner-insert" on public.saved_listings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saves owner-delete" on public.saved_listings
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Seller-facing save COUNT (never WHO). SECURITY DEFINER bypasses the owner-only
-- RLS to aggregate, but hard-scopes output to listings the CALLER sells.
-- Follows the 0008 active_listing_count definer convention.
create or replace function public.my_listing_save_counts()
returns table (listing_id bigint, save_count bigint)
language sql stable security definer set search_path = '' as $$
  select s.listing_id, count(*)::bigint
  from public.saved_listings s
  join public.listings l on l.id = s.listing_id
  where l.seller_id = (select auth.uid())
  group by s.listing_id
$$;
revoke all on function public.my_listing_save_counts() from public, anon;
grant execute on function public.my_listing_save_counts() to authenticated;
```

**Saved page read:** do NOT route through the `search_listings` RPC — it filters `status='active'` and would silently drop sold/expired saves, violating the locked "saves remain with a badge" decision. Instead: owner-scoped `saved_listings` select → batch-hydrate the listing rows (enumerated: `id, title, asking_price, condition_id, status, expires_at, date_listed`) into the existing `SearchCard` shape (cover photo via lowest `sort_order`, first-fit Make/Model chip, condition name, public seller name) exactly like 07-04's profile grid, then overlay "Sold"/"Expired" badges from `status`/`expires_at`.

**Heart state in the feed:** the feed is anon-open. `SaveButton` is a small client component; the feed/search page batch-fetches the viewer's saved ids for the rendered page of listings (one `getSavedIds(listingIds)` owner-RLS query when authenticated; skip entirely for anon). Anon click → login invite, mirroring the three-state `FitsMyTruckControl` precedent.

### Pattern 3: mark-as-sold — clone `renewListing` exactly

`status='sold'` is ALREADY admitted by the 0010 `listings_status_check`. No CHECK change is needed. The actions are owner-scoped updates that collapse zero-rows to `not_found` (no existence leak):

```ts
// lib/actions/listings.ts — same shape as renewListing/reactivateListing
export async function markSold(id: number) {
  // getClaims (never getSession) → user client update:
  //   .update({ status: "sold" }).eq("id", id).eq("seller_id", userId).eq("status", "active")
  // zero rows → not_found; revalidatePath(`/listings/${id}`) + /sell/listings
}
export async function markAvailable(id: number) {
  //   .update({ status: "active" }).eq("id", id).eq("seller_id", userId).eq("status", "sold")
  // NEVER touches expires_at — renew/reactivate remain the ONLY expires_at writers.
}
```

**Feed/search removal is free:** `search_listings` (0014) already has `where l.status = 'active' and (l.expires_at is null or l.expires_at > now())` — a sold listing drops out of feed, search, and the public-profile grid (which filters `status='active'` too) with zero query changes. Verify with the existing integration suite, don't re-implement.

**Public page change (the one behavior edit):** `app/(public)/listings/[id]/page.tsx` currently does `if (listing.status !== "active") notFound()`. Change to: `expired` (or any other non-active, non-sold) → `notFound()` as today; `sold` → render with a prominent "Sold" badge, comment composer replaced by a "comments are closed" notice (existing comments still rendered), Contact/owner actions adjusted. Keep `recordListingView` firing only for `active` (sold views are not buyer-demand signal; cheap to keep the current placement before the status branch — Claude's discretion, but be explicit in the plan).

### Pattern 4: deletion audit — default-deny table + BEFORE DELETE definer trigger

```sql
create table public.comment_deletion_log (
  id bigint generated always as identity primary key,
  comment_id bigint not null,
  listing_id bigint not null,
  author_id uuid not null,
  parent_id bigint,
  body text not null,                       -- snapshot for the Phase-10 audit
  comment_created_at timestamptz not null,
  deleted_by uuid,                          -- auth.uid() of the deleter
  deleted_at timestamptz not null default now()
);
alter table public.comment_deletion_log enable row level security;
-- NO policies at all: default-deny. Only the definer trigger writes; only the
-- service role (Phase 10 admin) reads. Mirrors the listing_view_events posture.

create or replace function public.log_comment_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.comment_deletion_log
    (comment_id, listing_id, author_id, parent_id, body, comment_created_at, deleted_by)
  values
    (old.id, old.listing_id, old.author_id, old.parent_id, old.body, old.created_at,
     (select auth.uid()));
  return old;
end $$;

create trigger listing_comments_audit
  before delete on public.listing_comments
  for each row execute function public.log_comment_deletion();
```

Why a trigger and not action-side logging: deleting a parent cascades reply deletion **inside Postgres** (FK `on delete cascade`); row-level triggers fire for each cascaded row, so replies are audited with the same `deleted_by`. An action-side insert would only log the parent. FK cascades themselves are not subject to RLS, so the seller deleting a buyer's parent comment cascades the buyer's replies cleanly. Confidence HIGH (documented Postgres trigger/cascade semantics; definer-function convention matches 0011's cron posture).

### Pattern 5: new-comment indicator — seen-watermark column + one grouped count

Add `comments_seen_at timestamptz` to `listings` (nullable; additive, no RLS change — owner-update policy already covers it). `getMyListings` adds ONE grouped count query (`listing_comments` is public-read, so the seller can count directly — no definer needed):

```ts
// one query, no N+1: count comments per owned listing newer than the watermark
// select listing_id, count(*) from listing_comments
//   where listing_id in (...) and created_at > coalesce(comments_seen_at-per-listing)
// → simplest: fetch (listing_id, created_at) for owned ids in one query and
//   bucket in JS against each listing's comments_seen_at (volumes are tiny in v1).
```

`markCommentsSeen(listingId)` is an owner-scoped action fired when the seller views their own listing's comments (the `isOwner` branch already computed on the public page). Badge renders on `/sell/listings` cards. This deliberately does NOT touch the `notifications` table — that path is the deferred notification system.

### Anti-Patterns to Avoid

- **Routing the saved page through `search_listings`:** silently drops sold/expired saves (locked decision violated). Direct owner-RLS read + hydrate.
- **A SELECT policy on `saved_listings` for sellers:** exposes `user_id` (WHO saved). Counts only, via the definer RPC.
- **`select('*')` or embedding `profiles(*)` in comment reads:** the repo grep-gates this; enumerate columns, join `profiles_public` only.
- **Soft-delete columns / "[deleted]" placeholders on comments:** locked decision is hard delete + cascade, audit lives in the log table.
- **Supabase Realtime for live comments:** Phase 9 owns the Realtime surface. Revalidate-on-action here.
- **An UPDATE policy on `listing_comments`:** no editing is a locked decision — the absence of the policy IS the enforcement.
- **Touching `expires_at` in markSold/markAvailable:** renew/reactivate are the only `expires_at` writers (STATE invariant from 5.1).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confirmation dialogs (delete comment, mark sold) | Custom modal | vendored `components/ui/alert-dialog.tsx` | Already in repo, accessible |
| Status/“Sold” badges | New badge component | vendored `components/ui/badge.tsx` (+ existing `SellerTypeBadge` styling cues) | Consistency |
| Card grid on saved page | New card | existing `ListingCard` (`components/search/listing-card.tsx`, takes `SearchCard`) or the 07-04 local-card approach — Phase 7 is committed now, so importing `ListingCard` is safe (no cross-wave hazard anymore) | Locked decision: reuse Phase 7 grid |
| Public-name attribution | New resolver | `resolvePublicName` from `lib/seller/badge.ts` | Single source of display-name truth |
| Comment thread sort | DB-side recursive CTE | Fetch flat, bucket in app code (parents desc, replies asc) | Depth is exactly 2; trivial in JS |
| Rate limiting comments | The Twilio service-role abuse store | A self-count check inside `addComment` (count own comments in last 60s via own-RLS-visible public read; reject over ~5/min) | Comments are low-stakes vs OTP; keep it dependency-free. Discretion area — keep limits generous |

## Common Pitfalls

### Pitfall 1: Sold listings 404 because of the existing status gate
**What goes wrong:** LIST-06 ships, seller marks sold, every saved link and share breaks — the public page `notFound()`s non-active statuses today.
**How to avoid:** The plan MUST include the `app/(public)/listings/[id]/page.tsx` edit as an explicit task: `sold` renders with badge + closed composer; `expired` stays hidden.
**Warning sign:** Success criterion 3 verified only on `/sell/listings`, never on the public URL.

### Pitfall 2: Comments-closed enforced only in UI
**What goes wrong:** Composer hidden on sold listings, but a direct Server Action call (or stale tab) still inserts.
**How to avoid:** The `l.status = 'active'` arm lives in the INSERT RLS policy (Pattern 1). Integration test: insert against a sold listing as an authenticated non-owner → RLS rejection.

### Pitfall 3: Depth-1 enforced only in the composer
**What goes wrong:** Reply-to-a-reply via crafted payload → unbounded nesting the UI can't render.
**How to avoid:** The `p.parent_id is null` arm in the INSERT policy. Also check `p.listing_id = listing_id` so a reply can't be grafted onto another listing's thread.

### Pitfall 4: PII leaking through comment author joins
**What goes wrong:** A convenient `select("*, profiles_private(...)")` or even `profiles_public(*)` widens the read surface.
**How to avoid:** Enumerated columns + batched `profiles_public` read (`id, username, display_name` only). Extend the contract-test family (`social.contract.test.ts`) asserting zero PII keys in the exact page-shaped read — same harness as `public-profile.contract.test.ts`.

### Pitfall 5: N+1 hydration on the saved page / comment thread
**What goes wrong:** Per-card photo/fitment queries; per-comment profile queries.
**How to avoid:** Batch with `.in(...)` like `lib/search/queries.ts` — one photos query, one fitment query, one profiles query.

### Pitfall 6: Definer RPC without `search_path=''`/grant hygiene
**What goes wrong:** `security definer` with a default search_path is the classic Postgres privilege-escalation footgun; anon-executable count RPC leaks seller-only data shape.
**How to avoid:** Copy the 0008 convention verbatim: `set search_path = ''`, schema-qualify everything, `revoke ... from public, anon`, grant to `authenticated` only. The function body scopes by `l.seller_id = auth.uid()` so even authenticated callers only get their own listings' counts.

### Pitfall 7: Husky stash/restore cross-attribution in parallel waves
**What goes wrong:** Known repo hazard (MEMORY.md): parallel GSD waves get files cross-attributed by the pre-commit stash/restore.
**How to avoid:** Plan waves so the migration (Wave 1) is solo; verify by file-on-disk after commits; comments UI and saves UI can be parallel siblings but should not touch the same files (`listing-detail.tsx` is the contention point — give it to one plan only).

### Pitfall 8: `revalidatePath` omissions leave stale surfaces
**What goes wrong:** Mark-sold succeeds but the feed page (`/`), the listing page, and `/sell/listings` keep stale renders; saved page keeps "Active" badge.
**How to avoid:** The feed `/` is already force-dynamic and the listing page is force-dynamic, so they self-heal per request; still call `revalidatePath` for `/sell/listings` and `/saved` from the actions. Comment actions revalidate `/listings/[id]`.

## Code Examples

All key examples are inline in Architecture Patterns above (they are repo-pattern derivations, not external API usage). Additional references to copy from:

- **Owner-scoped update collapsing zero-rows → not_found:** `renewListing` in `lib/actions/listings.ts` (markSold/markAvailable clone this).
- **Guard-order unit test with mocked client:** `tests/unit/listing-actions.test.ts` (social-actions tests clone this).
- **Live RLS integration gates:** `tests/integration/rls.test.ts` + `fitment-intelligence.test.ts` (public-read / write-denied / owner-write probes).
- **Zero-PII contract test:** `tests/integration/public-profile.contract.test.ts` (PAGE_SELECT_COLUMNS discipline).
- **Batch hydration:** `searchListings` in `lib/search/queries.ts`.
- **Auth-aware three-state client control:** `components/search/fits-my-truck-control.tsx` (SaveButton's anon → login-invite state mirrors this).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `status in ('active','sold')` (0006) | `('active','sold','expired')` (0010) | Phase 5.1 | LIST-06 needs NO migration change to the CHECK — 'sold' already valid |
| Public page hides all non-active | Sold must render with badge | This phase (locked decision) | Explicit page edit required (Pitfall 1) |
| `(app)/page.tsx` auth feed | Anon-open `/` feed (07-03) | Phase 7 | SaveButton on feed cards must handle anon viewers |

Nothing in this phase touches deprecated APIs. Supabase client patterns (`getClaims`, cookie-bound `createClient`) are current per the repo's pinned `@supabase/ssr 0.10.x`.

## Open Questions

1. **Should sold listings keep recording view events?**
   - What we know: `recordListingView` currently fires only for active (the notFound gate precedes it).
   - Recommendation: do NOT record views for sold pages (not buyer-demand signal; keeps Phase 10 analytics clean). Note it in the plan so the page edit is deliberate. Claude's discretion.
2. **Comment length limit exact value.**
   - Recommendation: 1–1000 chars (CHECK + zod, single shared constant). Marketplace Q&A is short; 1000 is generous. Discretion area — any value 500–2000 is fine, just keep CHECK and zod in lockstep.
3. **Does the seller's "my listings" view need the save count AND the comment badge in one query pass?**
   - What we know: `getMyListings` exists and is owner-scoped; both additions are one extra query each (definer RPC + grouped comment count).
   - Recommendation: extend `getMyListings` with both in a single plan to avoid two plans contending for `lib/listings/queries.ts`.
4. **Where does the saved page live?**
   - Recommendation: `app/(app)/saved/page.tsx` (auth route group — saves are owner-scoped, anon has nothing to see). Add a nav entry alongside account/sell.

## Sources

### Primary (HIGH confidence — repo ground truth, read directly)
- `supabase/migrations/0006_listings.sql`, `0010_stakeholder_lifecycle.sql`, `0014_search.sql` — status CHECK already has 'sold'; search RPC filters active+unexpired; RLS policy conventions
- `supabase/migrations/0008_active_listing_count.sql` — security-definer RPC convention (`set search_path=''`)
- `lib/actions/listings.ts`, `lib/listings/queries.ts`, `lib/search/queries.ts`, `lib/seller/badge.ts` — action trust boundary, enumerated reads, batch hydration, resolvePublicName
- `app/(public)/listings/[id]/page.tsx` — current notFound status gate (the behavior this phase changes)
- `components/search/*`, `components/ui/*` — ListingCard/SearchCard shape, vendored primitives inventory
- `.planning/phases/08-social-layer/08-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `CLAUDE.md` invariants

### Secondary (MEDIUM confidence)
- Postgres RLS/trigger semantics (self-referencing EXISTS in policies; row triggers fire on FK cascade deletes; cascades bypass RLS) — standard documented Postgres behavior, consistent with patterns already shipped in this repo (EXISTS-policies in 0006/0012). Verify live in the integration gates (the plan's tests ARE the verification).

### Tertiary (LOW confidence)
- None — no external/web research was required; the stack is fully pinned and every pattern has an in-repo precedent.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; everything verified installed/vendored in package.json + components/ui
- Architecture: HIGH — every pattern is a derivation of a committed, Staging-verified repo precedent
- Pitfalls: HIGH for repo-specific ones (read from source); MEDIUM for trigger-on-cascade audit semantics (standard Postgres, gate with an integration test)

**Research date:** 2026-06-10
**Valid until:** 2026-07-10 (stable — internal patterns, pinned stack)
