---
phase: 10-admin-operations-analytics
plan: 04
subsystem: admin
tags: [admin, moderation, listings, rls, storage, audit, bulk-publish]
requires:
  - phase: 10-admin-operations-analytics (10-01)
    provides: migration 0019 — 'draft' status, hidden_at/hidden_reason, replaced listings public-read policy
  - phase: 10-admin-operations-analytics (10-02)
    provides: requireAdmin() gate, logAdminAction() audit writer, gated /admin shell
provides:
  - hideListing / restoreListing / removeListingPhoto / bulkPublishDrafts admin actions (all requireAdmin + zod + service-role + audited)
  - /admin/listings filterable index (status incl. draft, hidden toggle, title/seller search) with one-click draft bulk-publish
  - /admin/listings/[id] moderation detail — read-only seller content, hide/restore + per-photo removal dialogs
  - migration 0020 — active_listing_count excludes hidden rows (closes the definer-RPC vs RLS drift)
  - tests/integration/admin-moderation.test.ts — structural hidden/draft exclusion gate
affects: [10-08, 10-09, 10-10]
tech-stack:
  added: []
  patterns:
    - "moderation is structural: actions only flip hidden_at/hidden_reason; the 0019 RLS policy does the public exclusion"
    - "restore scoped to hidden_reason='moderation' — enforcement hides (suspension/ban) can never be undone from the listing console"
    - "SECURITY DEFINER RPCs bypass RLS — every definer body must repeat the visibility predicate (0020 mirrors what RLS does)"
    - "cover promotion is positional (lowest sort_order at read time) — deleting the cover row promotes the next photo with zero writes"
key-files:
  created:
    - lib/admin/listings-queries.ts
    - app/admin/listings/page.tsx
    - app/admin/listings/[id]/page.tsx
    - lib/actions/admin/listings.ts
    - components/admin/listing-moderation.tsx
    - supabase/migrations/0020_active_listing_count_hidden.sql
    - tests/integration/admin-moderation.test.ts
  modified: []
key-decisions:
  - "bulkPublishDrafts pulled forward into the Task-1 commit so the index page's form compiles (plan placed it in Task 2); plus a bulkPublishDraftsFromForm FormData wrapper for the server-component form"
  - "Seller-side of the title/seller search: pre-resolve up to 20 username ilike matches from profiles_public, then OR seller_id.in(...) with title ilike — no FTS for admin volume"
  - "removeListingPhoto deletes the Storage object FIRST, then the row — a failed storage delete keeps the row (retryable) instead of orphaning the object"
  - "Photo-count floor NOT re-enforced on photo removal — the 3-photo minimum stays a publish-time gate only (Research Pattern 4)"
  - "Seller email notification on hide left as TODO for 10-08: lib/admin/email.ts was still uncommitted parallel-wave work at execution time (plan-sanctioned soft dependency)"
metrics:
  duration: ~20 min
  tasks: 3
  files: 8
  completed: 2026-06-11
---

# Phase 10 Plan 04: Admin Listing Moderation Summary

**One-liner:** /admin/listings index + detail with structural hide/restore (RLS does the hiding, the console flips hidden_at), audited per-photo Storage+row removal, one-click draft bulk-publish with the 90-day clock, and an integration gate proving hidden/draft rows vanish from search RPC, direct reads and the (0020-fixed) count RPC while staying owner-visible.

## What was built

- **lib/admin/listings-queries.ts** (`server-only`) — `getAdminListings({status, hidden, q, page})`: service-role paged read (50/page, exact count) with status/hidden filters and a title-OR-seller-username search (username ilike pre-resolve → `or(title.ilike,seller_id.in)`); usernames batch-resolved from profiles_public with enumerated columns (seller_id FKs auth.users, the getListing workaround). `getAdminListingDetail(id)`: full listing + ordered photos (with photo ids for removal) + fitment names + seller + report count.
- **app/admin/listings/page.tsx** (force-dynamic, requireAdmin) — GET-form filter bar (status select incl. Draft, "Hidden only" toggle, search box), moderation table (thumbnail, title→detail link, seller, status + hidden badges, listed/expires). `?status=draft` wraps the table in a form with per-row checkboxes + "Publish selected" → `bulkPublishDraftsFromForm`.
- **lib/actions/admin/listings.ts** (`"use server"`) — every action: requireAdmin() first, zod input, createAdminClient(), logAdminAction() before success, revalidatePath:
  - `hideListing`: `hidden_at=now(), hidden_reason='moderation'` only where hidden_at is null; audits `listing_hide` with reason.
  - `restoreListing`: clears hide ONLY where `hidden_reason='moderation'`; audits `listing_restore`.
  - `removeListingPhoto`: Storage object → listing_photos row → audit `photo_remove` with `{listingId, path}`; no auto-unpublish below 3 photos; cover promotion is positional.
  - `bulkPublishDrafts`: one statement `status='active', date_listed=now(), expires_at=now()+90d` scoped to `status='draft'`; one `bulk_publish` audit row with `{count, listingIds}`.
- **app/admin/listings/[id]/page.tsx** (force-dynamic, requireAdmin) — read-only seller content (title/price/condition/shipping/damage notes as TEXT — zero inputs, locked moderate-only), status/hidden/Barnyard/report badges, fitment chips, photo grid with per-photo Remove.
- **components/admin/listing-moderation.tsx** (client) — `HideRestoreControls` (hide dialog with required reason; restore button only for moderation hides; suspension/ban hides show an explanatory note instead) + `PhotoRemoveButton` (confirm dialog with required reason); sonner toasts + router.refresh().
- **supabase/migrations/0020_active_listing_count_hidden.sql** — applied to Staging via `npx supabase db query --linked -f`; see deviations.
- **tests/integration/admin-moderation.test.ts** — service-role fixture seller + listing; asserts baseline visibility, then hidden: excluded from `search_listings` RPC / direct anon read / `active_listing_count`, owner still sees it; then draft: excluded from search + direct anon read, owner-visible. 3/3 green against Staging.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] active_listing_count counted moderation-hidden listings (Pitfall 2 drift)**
- **Found during:** Task 3 design
- **Issue:** `active_listing_count` (0008) is SECURITY DEFINER — it bypasses the 0019 public-read policy, so a hidden-but-'active' listing kept inflating the public profile count; Task 3's done criterion (c) was unsatisfiable without it.
- **Fix:** migration `0020_active_listing_count_hidden.sql` — body-only change adding `and hidden_at is null` (name/signature frozen since Phase 1); applied to Staging.
- **Files modified:** supabase/migrations/0020_active_listing_count_hidden.sql
- **Commit:** 477cc0d (swept into the parallel 10-06 docs commit — see note below)

**2. [Rule 3 - Blocking] bulkPublishDrafts pulled forward into Task 1**
- **Found during:** Task 1
- **Issue:** the index page's draft form must reference the action to compile, but the plan placed the action in Task 2.
- **Fix:** lib/actions/admin/listings.ts created in the Task-1 commit with bulkPublishDrafts (+ FormData wrapper); hide/restore/photo actions added in Task 2 as planned.
- **Commit:** b377001

### Deferred Issues (logged to deferred-items.md, NOT fixed here)

- **FTS GIN gate failure (`tests/integration/search.test.ts`)** — pre-existing regression introduced by 10-01's 0019 policy replacement: a non-trivial RLS qual stops the non-leakproof `@@` predicate from using the GIN index for anon reads (EXPLAIN gate AND live search RPC now Seq Scan). Architectural fix (e.g. definer-ize search_listings with the visibility predicate in-body, the 0020 pattern) belongs to phase verification, not ADMO-02. Full integration run: 1 failed (this) | 103 passed | 1 skipped.

### Parallel-wave commit attribution

Task 3's files (`0020_*.sql`, `admin-moderation.test.ts`) were swept into the parallel 10-06 docs commit **477cc0d** by the known lint-staged stash/restore race (memory note); my own Task-3 commit attempt was then rejected as empty. File-on-disk content verified correct and committed. Also noted in deferred-items.md: 10-06 independently created `0020_analytics_helpers.sql` — duplicate `0020_` prefix to rename at phase verification (both already applied manually; no runtime impact).

## Verification

- `npm run typecheck`: clean for all 10-04 files (concurrent failures existed only in parallel 10-05 work-in-progress files, out of scope).
- `npm run build`: green after Task 1 and Task 2.
- `npx vitest run tests/integration/admin-moderation.test.ts`: 3/3 passed against Staging — hidden/draft exclusion holds across search RPC, direct reads and the count RPC; owner visibility intact; audit rows for hide/restore/photo/bulk actions are written through the throwing logAdminAction (write failure fails the action).
- No title/description/price input exists anywhere under /admin/listings (moderate-only, locked).

## Self-Check: PASSED

- lib/admin/listings-queries.ts — FOUND
- app/admin/listings/page.tsx — FOUND
- app/admin/listings/[id]/page.tsx — FOUND
- lib/actions/admin/listings.ts — FOUND (exports hideListing, restoreListing, removeListingPhoto, bulkPublishDrafts)
- components/admin/listing-moderation.tsx — FOUND
- supabase/migrations/0020_active_listing_count_hidden.sql — FOUND
- tests/integration/admin-moderation.test.ts — FOUND
- Commits b377001, 94bebd7, 477cc0d — FOUND
