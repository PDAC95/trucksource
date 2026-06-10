---
phase: 08-social-layer
plan: 02
subsystem: api
tags: [comments, server-actions, zod, supabase, rls, vitest]

# Dependency graph
requires:
  - phase: 08-social-layer (08-01)
    provides: 0015_social.sql (listing_comments RLS: self-attribution + active-only + depth-1 INSERT, author-or-seller DELETE; listings.comments_seen_at; COMMENT_SELECT_COLUMNS / COMMENT_AUTHOR_COLUMNS contract constants)
  - phase: 05-listings
    provides: lib/actions/listings.ts trust-boundary pattern (getClaims + cookie client + owner RLS + zero-rows→not_found)
  - phase: 05.1-stakeholder
    provides: resolvePublicName(displayName, username) in lib/seller/badge.ts
provides:
  - commentSchema + COMMENT_MAX_LENGTH (single client+server validation source, DB-CHECK lockstep)
  - getListingComments — zero-PII, anon-callable thread reader (parents desc, replies asc, batched attribution)
  - addComment / deleteComment / markCommentsSeen Server Actions (SOCL-01 write surface)
affects: [08-04 comment UI, 08-05, 08-06, 09-contact-chat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "App-level 60s/5 rate limit via owner-filtered head-count query (dependency-free)"
    - "Pre-check for clean error messages, RLS as real enforcement (RLS rejection collapses to invalid)"

key-files:
  created:
    - lib/comments/schema.ts
    - lib/comments/queries.ts
    - lib/actions/comments.ts
    - tests/unit/comment-schema.test.ts
    - tests/unit/social-actions.test.ts
  modified: []

key-decisions:
  - "Rate limit is a generous app-level head-count (>5 own comments/60s) — clean rate_limited message, no new dependency; RLS stays the security boundary"
  - "deleteComment does NOT re-implement the seller check — the author-OR-seller DELETE policy decides; zero rows collapses to not_found (no existence leak)"
  - "Missing-author attribution falls back to 'usuario' — the thread never crashes on a missing profiles_public row"

patterns-established:
  - "Comment reads mirror the 08-01 contract constants (COMMENT_SELECT_COLUMNS / COMMENT_AUTHOR_COLUMNS) — test and reader share one source of truth for the read shape"

requirements-completed: [SOCL-01]

# Metrics
duration: ~8min
completed: 2026-06-10
---

# Phase 8 Plan 02: Comments Backend Summary

**SOCL-01 comments backend: shared zod commentSchema (1000-char DB lockstep), an anon-callable zero-PII thread reader (parents newest-first, replies conversation-order, batched profiles_public attribution), and three getClaims+RLS Server Actions (add with 60s/5 rate limit + comments-closed pre-check, RLS-decided delete, owner-scoped seen-watermark)**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-10T17:36:58Z
- **Completed:** 2026-06-10T17:45:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- `lib/comments/schema.ts` — `COMMENT_MAX_LENGTH = 1000` (single shared constant, lockstep with the 0015 DB CHECK, unit-asserted) + `commentSchema` (coerced listingId/parentId, trimmed 1..1000 body) — the one validation source for the 08-04 client form AND the server action.
- `lib/comments/queries.ts` — `getListingComments` runs exactly TWO queries (no N+1): one enumerated `listing_comments` select mirroring `COMMENT_SELECT_COLUMNS` and one batched `profiles_public` read mirroring `COMMENT_AUTHOR_COLUMNS` (id/username/display_name ONLY → `resolvePublicName`); buckets parents `created_at DESC` (LOCKED) with replies `ASC` (LOCKED) under each, drops orphan replies, falls back to "usuario" on missing profiles, returns `[]` on error. Anon-callable via the cookie server client.
- `lib/actions/comments.ts` — the SOCL-01 write surface cloning the listings.ts trust boundary (getClaims, never getSession; cookie user client; RLS = authz; no admin client):
  - `addComment` guard order: unauthenticated → schema invalid → `rate_limited` (≥5 own comments in 60s, head-count) → `not_found`/`comments_closed` listing pre-check → self-attributed insert (`author_id = userId`); RLS rejection (e.g. crafted depth-2 parentId) collapses to `invalid`; revalidates `/listings/{id}`.
  - `deleteComment`: RLS decides author-OR-seller; zero rows → `not_found` (no existence leak); revalidates from the returned `listing_id`; cascade + audit live in the DB.
  - `markCommentsSeen`: owner-scoped (`eq("seller_id", userId)`) watermark update; zero rows → `not_found`.
- 25 new unit tests (schema limits/coercion + the full guard ORDER incl. self-attribution payload assertion and the owner-scoped update chain) — full suite 35 files / 224 passed / 1 skipped, tsc clean.

## Task Commits

1. **Task 1: commentSchema + getListingComments reader** — `ba63260` (feat)
2. **Task 2: addComment / deleteComment / markCommentsSeen Server Actions** — `c8cdff5` (feat)
3. **Task 3: Unit tests — schema limits + action guard order** — landed in `0885a86` (see Issues: husky cross-attribution; files verified on disk + in HEAD)

## Files Created/Modified

- `lib/comments/schema.ts` — commentSchema + COMMENT_MAX_LENGTH (client+server single source)
- `lib/comments/queries.ts` — getListingComments zero-PII thread reader
- `lib/actions/comments.ts` — addComment / deleteComment / markCommentsSeen
- `tests/unit/comment-schema.test.ts` — body bounds, trim, coercion, lockstep guard
- `tests/unit/social-actions.test.ts` — guard-order harness (mocked client, thenable chains)

## Decisions Made

- Rate limit implemented as a generous dependency-free head-count of the caller's OWN recent comments (≥5 in 60s → `rate_limited`) per Research "Don't Hand-Roll" — RLS remains the security boundary.
- Expiry pre-check treats `expires_at <= now()` as closed even when `status='active'` (matches the 0015 INSERT policy's active+unexpired condition), so a lapsed-but-not-yet-cron-flipped listing returns a clean `comments_closed` instead of an opaque RLS `invalid`.
- `parentId` coercion accepts the string handles the reply UI will pass (same Radix/route-param convention as listingSchema).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Husky cross-attribution (known parallel-wave hazard):** the Task-3 commit attempt found "no staged files" — the PARALLEL 08-03 commit `0885a86` had swept both test files into its commit during its lint-staged stash/restore. Verified by file-on-disk (the prescribed check): both files exist, match what was written, are in HEAD, and the working tree is clean; the suite ran green from disk. No re-commit needed.
- Two own comment strings initially tripped the grep gates (`select('*')` / `profiles_private` mentioned in doc comments) — reworded before committing so the gates assert real code only.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 08-04's comment UI can consume `getListingComments` + the three actions without interpretation: `CommentThread[]` carries `authorId` (own-comment delete affordance), `authorName` (PII-free), `authorUsername` (`/u/[username]` link).
- `markCommentsSeen` + `listings.comments_seen_at` are ready for the seller unread indicator (pairs with 08-03's `my_listing_save_counts` surface).

---
*Phase: 08-social-layer*
*Completed: 2026-06-10*

## Self-Check: PASSED

- All 5 plan files present on disk and identical to HEAD (git diff empty)
- Commits ba63260 / c8cdff5 / 0885a86 verified in history
- Full suite 35 files / 224 passed / 1 skipped; tsc clean; grep gates 0 hits
