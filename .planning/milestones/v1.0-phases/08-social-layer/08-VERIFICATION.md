---
phase: 08-social-layer
verified: 2026-06-10T00:00:00Z
status: passed
score: 3/3 must-haves verified
re_verification: false
---

# Phase 8: Social Layer Verification Report

**Phase Goal:** The 30% social experience comes alive — buyers can publicly comment on listings (attributed to username only), save listings to view later, and sellers can mark their listings as sold.
**Verified:** 2026-06-10
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A buyer can post a public comment on a listing, shown attributed to their username only | VERIFIED | `getListingComments` in `lib/comments/queries.ts` reads `id, username, display_name` from `profiles_public` only; `addComment` self-attributes via `getClaims()`; `CommentSection` + `CommentComposer` wired in `app/(public)/listings/[id]/page.tsx` |
| 2 | A buyer can save (bookmark) a listing and view their list of saved listings | VERIFIED | `toggleSave` in `lib/actions/saves.ts`; `getMySavedListings` in `lib/saves/queries.ts`; `SaveButton` wired in feed cards + detail page; `/saved` page calls `getMySavedListings` + renders sold/expired badges |
| 3 | A seller can mark their own listing as "Sold," which updates its public status | VERIFIED | `markSold`/`markAvailable` in `lib/actions/listings.ts` (owner-scoped, status-only, no `expires_at` touch); `SoldToggle` component wired in `listing-detail.tsx` (detail page) and `app/(app)/sell/listings/page.tsx` (management) |

**Score:** 3/3 truths verified

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `supabase/migrations/0015_social.sql` | VERIFIED | 186 lines; `listing_comments`, `saved_listings`, `comment_deletion_log` all created with `enable row level security` in the same migration; `log_comment_deletion()` BEFORE DELETE trigger with `security definer set search_path = ''`; `my_listing_save_counts()` definer RPC with anon revoke; `comments_seen_at` column added to listings |
| `lib/comments/schema.ts` | VERIFIED | Exports `COMMENT_MAX_LENGTH = 1000`, `commentSchema`, `CommentInput`; lockstep constant matches DB CHECK |
| `lib/comments/queries.ts` | VERIFIED | 122 lines; enumerated selects only (no `*`); one batched `profiles_public` read (`id, username, display_name`); parents newest-first, replies oldest-first bucketing; `resolvePublicName` for attribution |
| `lib/actions/comments.ts` | VERIFIED | 176 lines; `addComment` / `deleteComment` / `markCommentsSeen`; all use `getClaims()` not `getSession()`; no `supabase/admin` import; guard order: unauthenticated → invalid → rate_limited → comments_closed/not_found → insert |
| `lib/saves/queries.ts` | VERIFIED | 213 lines; `getMySavedListings` + `getSavedIds`; does NOT call `search_listings` RPC (confirmed by grep); batch-hydrates via direct `listings` read including sold/expired rows; enumerated profiles_public columns only |
| `lib/actions/saves.ts` | VERIFIED | 66 lines; `toggleSave`; `getClaims()` identity; delete-first idempotent flip; `revalidatePath("/saved")` |
| `components/search/save-button.tsx` | VERIFIED | 103 lines; three states (anon invite / saved / unsaved); `useTransition` optimistic flip; `e.preventDefault(); e.stopPropagation()` present; imports `toggleSave` |
| `components/comments/comment-section.tsx` | VERIFIED | 168 lines — above the 60-line minimum; renders thread with per-comment delete; closed notice when `commentsClosed` prop |
| `components/comments/comment-composer.tsx` | VERIFIED | 281 lines; RHF + zod; `parentId` reply mode; calls `addComment` Server Action on submit |
| `app/(public)/listings/[id]/page.tsx` | VERIFIED | Sold-renders-with-badge gate (`status !== "active" && status !== "sold"` → notFound); calls `getListingComments`; mounts `CommentSection` + `CommentComposer`; `getSavedIds` for initial heart state |
| `app/(app)/saved/page.tsx` | VERIFIED | 70+ lines; `getMySavedListings`; empty state present; sold/expired badges rendered via `statusBadge` prop; `dynamic = "force-dynamic"` |
| `app/(app)/sell/listings/page.tsx` | VERIFIED | `saveCount` + `newCommentCount` rendered per row; `SoldToggle` wired per listing |
| `tests/integration/social.test.ts` | VERIFIED | 325 lines; live RLS gates: public-read, anon-write-denied, self-attribution, sold-closed insert, depth-1, no-update, owner-only saves, audit default-deny, RPC anon-revoked |
| `tests/integration/social.contract.test.ts` | VERIFIED | 121 lines; zero-PII shapes for comment thread + saved-page reader; profiles_private anon-read denial |
| `tests/unit/comment-schema.test.ts` | VERIFIED | 81 lines; schema limits + `COMMENT_MAX_LENGTH === 1000` lockstep |
| `tests/unit/social-actions.test.ts` | VERIFIED | 270 lines; guard-order for `addComment` proven; `deleteComment` zero-rows → not_found; `markCommentsSeen` owner-scoped eq present |

---

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `app/(public)/listings/[id]/page.tsx` | `lib/comments/queries.ts` | `getListingComments(listing.id)` on line 79 | WIRED |
| `components/comments/comment-composer.tsx` | `lib/actions/comments.ts` | `addComment` Server Action import + call | WIRED |
| `components/listings/listing-detail.tsx` | `lib/actions/listings.ts` | `SoldToggle` component imported on line 8, renders with `markSold`/`markAvailable` via `components/listings/sold-toggle.tsx` | WIRED |
| `components/listings/listing-detail.tsx` | `components/search/save-button.tsx` | `SaveButton` imported line 9, rendered line 134 | WIRED |
| `app/(public)/page.tsx` | `lib/saves/queries.ts` | `getSavedIds(cards.map(c => c.id))` for first-page heart state | WIRED |
| `app/api/search/route.ts` | `lib/saves/queries.ts` | `getSavedIds` for infinite-scroll pages | WIRED |
| `app/(app)/saved/page.tsx` | `lib/saves/queries.ts getMySavedListings` | RSC call + ListingCard grid | WIRED |
| `app/(app)/sell/listings/page.tsx` | `lib/listings/queries.ts getMyListings` | `saveCount` + `newCommentCount` rendered per row | WIRED |
| `lib/listings/queries.ts getMyListings` | `my_listing_save_counts RPC` | `supabase.rpc("my_listing_save_counts")` present | WIRED |
| `lib/actions/listings.ts markSold` | `listings.status` | `.update({ status: "sold" })` with `.eq("seller_id")` + `.eq("status","active")`, NO `expires_at` | WIRED |
| `lib/saves/queries.ts getMySavedListings` | `listings` (direct read) | `.from("listings").select(...).in("id", ids)` — NOT `search_listings` RPC | WIRED |
| `0015_social.sql` | `comment_deletion_log` | BEFORE DELETE trigger `listing_comments_audit` → `log_comment_deletion()` security definer | WIRED |
| `lib/actions/comments.ts` | `lib/comments/schema.ts` | `commentSchema.safeParse(input)` at trust boundary | WIRED |
| `lib/comments/queries.ts` | `profiles_public` | `.from("profiles_public").select("id, username, display_name").in("id", authorIds)` | WIRED |

---

## Requirements Coverage

| Requirement | Phase Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SOCL-01 | 08-01, 08-02, 08-04, 08-06 | Buyer can post a public comment attributed to username only | SATISFIED | Full backend (schema, actions, queries) + UI (section, composer) verified; username-only attribution via profiles_public; sold-listing composer replaced with closed notice |
| SOCL-02 | 08-01, 08-03, 08-04, 08-05, 08-06 | Buyer can save (bookmark) a listing and view saved listings | SATISFIED | `toggleSave` + `getMySavedListings` + `getSavedIds`; `/saved` page with sold/expired badges; `SaveButton` on feed cards + detail page |
| LIST-06 | 08-03, 08-04, 08-05, 08-06 | Seller can mark their own listing as "Sold" | SATISFIED | `markSold`/`markAvailable` actions (status-only, owner-scoped); `SoldToggle` component wired in detail page + management page; sold page stays reachable; removed from feed (search_listings filters active) |

No orphaned requirements — all three REQUIREMENTS.md Phase 8 IDs are claimed in plan frontmatter and verified with implementation evidence.

---

## Cross-Cutting Privacy/RLS Gate

| Check | Status | Evidence |
|-------|--------|---------|
| `profiles_private` referenced in social files | CLEAR | Zero hits across lib/comments, lib/saves, lib/actions/comments.ts, lib/actions/saves.ts, components/comments, components/search/save-button.tsx, app/(app)/saved |
| `select('*')` in social files | CLEAR | Zero hits; all reads use enumerated column lists |
| `getSession` in social actions | CLEAR | All actions use `getClaims()` exclusively |
| `supabase/admin` in social files | CLEAR | Zero hits; no service-role client in social layer |
| `markSold`/`markAvailable` update payloads | CLEAR | Both update exactly `{ status: "sold" }` / `{ status: "active" }` — no `expires_at` key |
| `getMySavedListings` avoids `search_listings` RPC | CLEAR | Direct `listings` table read confirmed; sold/expired rows included with effective status |
| RLS enabled in same migration for all 3 new tables | CLEAR | `alter table ... enable row level security` present in 0015_social.sql for listing_comments, saved_listings, comment_deletion_log |
| `comment_deletion_log` default-deny | CLEAR | Migration creates the table with RLS on and zero policies |
| `my_listing_save_counts()` anon-revoked | CLEAR | `revoke all on function ... from public, anon;` present in migration |

---

## Anti-Patterns Found

None. The placeholder found in `components/comments/comment-composer.tsx` line 141 is an HTML `placeholder=""` attribute on a textarea input — it is a UI affordance, not a code stub.

---

## Human Verification Required

The user-approved live UAT checkpoint (08-06) covered all three success criteria on the dev server. Per the task statement, this checkpoint was already APPROVED. No further human verification items remain.

Approved flows:
1. Post comment — appears newest-first, username-attributed, link to `/u/...`; depth-1 reply renders indented; delete removes comment + cascaded replies with confirmation.
2. Heart toggle on feed cards and detail page; anon heart shows sign-in invite; `/saved` grid shows saved listings; heart unsaves.
3. Mark-as-sold (confirmed) drops listing from feed/search; public URL stays live with Sold badge; comments closed; saved copy in `/saved` badged Sold; mark-as-available reverts to feed.

---

## Summary

Phase 8 goal is achieved. All three ROADMAP success criteria are satisfied by substantive, wired implementations:

- **SOCL-01** (comments): The full stack is in place — migration 0015 with structural RLS enforcement (self-attribution, sold-closed, depth-1), a zero-PII backend (getListingComments + addComment/deleteComment/markCommentsSeen using getClaims), and the comment section/composer UI wired to the listing page.

- **SOCL-02** (saves): toggleSave + getSavedIds + getMySavedListings are wired end-to-end from the SaveButton component through to the /saved page. The critical "sold/expired saves remain visible" constraint is honored — getMySavedListings bypasses the search RPC and hydrates directly from the listings table.

- **LIST-06** (mark-sold): markSold/markAvailable are owner-scoped, status-only (no expires_at writes), and wired through SoldToggle into both the detail page and the seller management page.

Privacy/RLS cross-cutting gate re-verified clean across all new surfaces. Test suite covers live RLS gates (social.test.ts), zero-PII read shapes (social.contract.test.ts), schema limits (comment-schema.test.ts), and guard-order proofs (social-actions.test.ts).

---

_Verified: 2026-06-10_
_Verifier: Claude (gsd-verifier)_
