---
phase: 08-social-layer
plan: 04
subsystem: social-ui
tags: [comments, saves, sold-toggle, listing-detail, socl-01, list-06]
requires:
  - "08-02: lib/comments (commentSchema, getListingComments, addComment/deleteComment/markCommentsSeen)"
  - "08-03: lib/saves (getSavedIds), lib/actions/listings (markSold/markAvailable), SaveButton"
provides:
  - "Public listing page renders SOLD listings with the Vendido treatment (expired still 404s)"
  - "Comment thread + composer + delete-with-confirmation on the listing page (SOCL-01 visible)"
  - "Owner sold toggle with confirmation (LIST-06 visible) + detail-page save heart (SOCL-02 on detail)"
affects:
  - "Phase 9 contact flow lands on this same detail page"
tech-stack:
  added: []
  patterns:
    - "Server CommentSection + client siblings (composer/delete/reply-toggle) in one client file"
    - "RHF useForm<z.input, unknown, z.output> + zodResolver(commentSchema) — shared client/server schema"
key-files:
  created:
    - components/comments/comment-section.tsx
    - components/comments/comment-composer.tsx
    - components/listings/sold-toggle.tsx
  modified:
    - app/(public)/listings/[id]/page.tsx
    - components/listings/listing-detail.tsx
decisions:
  - "Client subcomponents (CommentDeleteButton, CommentReplyToggle) live in comment-composer.tsx so comment-section.tsx stays a pure RSC — files_modified list kept exact"
  - "SoldToggle is a sibling components/listings/sold-toggle.tsx (plan-sanctioned) rather than converting listing-detail.tsx to a client component"
  - "Sold-listing views are NOT recorded (Research Open Q1: not buyer-demand signal)"
  - "SoldToggle self-hides on expired — reactivation stays RenewButton's job (expires_at writers unchanged)"
metrics:
  duration: "~12 min"
  completed: "2026-06-10"
  tasks: 3
  files: 5
---

# Phase 8 Plan 04: Listing-Detail Social UI Summary

**One-liner:** Public listing page now renders sold listings with a Vendido badge instead of 404ing, shows the username-attributed depth-1 comment thread with RHF+zod composer and author-or-seller delete, and gives owners a confirmed reversible sold toggle plus non-owners a save heart.

## What Shipped

### Task 1 — Comment components (`fcf985a`)
- **`components/comments/comment-section.tsx`** (RSC): renders threads exactly as the 08-02 reader bucketed them (parents newest-first, replies oldest-first, no re-sort), username-only attribution with `/u/[username]` links, plain-text whitespace-preserving bodies (no raw-HTML injection), delete affordance when `viewerId === authorId || isSeller`, "Responder" on top-level comments only (depth-1 LOCKED), closed notice ("Los comentarios están cerrados — este anuncio fue vendido.") while existing comments stay visible, MessageSquare empty state.
- **`components/comments/comment-composer.tsx`** (client): `CommentComposer` with `useForm<z.input, unknown, CommentInput>` + `zodResolver(commentSchema)` (the SAME schema the action re-validates), live remaining-chars hint near `COMMENT_MAX_LENGTH`, friendly error toasts (`rate_limited` → "Vas muy rápido…", `comments_closed` → "Los comentarios están cerrados"), anon login-invite card; plus `CommentDeleteButton` (AlertDialog, cascade warning on parents, `deleteComment` in a transition) and `CommentReplyToggle` (inline reply composer, collapses via `onDone`).

### Task 2 — Public page sold gate + wiring (`744ce9a`)
- **Status gate change (THE behavior change):** `sold` now renders publicly with the sold treatment; `expired`/other non-active still `notFound()`. Shared links and saves never break on sold (LOCKED).
- `recordListingView` fires ONLY when `status === "active"` (sold views are not buyer-demand signal — deliberate, commented).
- Parallel `getListingComments` + `getSavedIds` fetch; `isOwner && threads.length > 0` fire-and-forgets `markCommentsSeen` (resets the /sell/listings unread badge watermark).
- `CommentSection` + top-level `CommentComposer` (only when not closed) below `ListingDetail`; `Toaster` now unconditional.

### Task 3 — ListingDetail surface (`2fe6f7b`)
- New optional props `isSold` / `saved` / `isAuthenticated` (defaults preserve any other call site; the public page is the only consumer).
- Prominent destructive "Vendido" badge near the title + a gallery overlay tint with a centered Vendido tag; price stays visible (historical context).
- `SaveButton` for non-owner viewers near the title (saving sold listings allowed).
- `SoldToggle` (new sibling, client): active → "Marcar como vendido" with AlertDialog warning it leaves search/feed but the page stays visible; sold → "Marcar como disponible" with a lighter confirmation; transition + success toast + `router.refresh()`; `not_found` → "No se pudo actualizar"; renders nothing on expired (reactivate is RenewButton's). Renew/expiry semantics untouched.

## Deviations from Plan

### Auto-fixed / structural notes

**1. [Structural] Client subcomponents placed in comment-composer.tsx, not inline in comment-section.tsx**
- **Found during:** Task 1
- **Issue:** `"use client"` cannot be inlined inside a server-component file; the plan offered "inline or a tiny client sibling".
- **Fix:** `CommentDeleteButton` + `CommentReplyToggle` exported from the already-client `comment-composer.tsx` — files_modified list stays exact.

**2. [Structural] `components/listings/sold-toggle.tsx` created as a sibling file**
- **Found during:** Task 3
- **Issue:** Inlining the toggle would force `"use client"` onto the whole RSC-rendered ListingDetail.
- **Fix:** Sibling file (explicitly sanctioned by the plan text); committed with Task 3. One file beyond the frontmatter files_modified list.

**3. [Rule 1 - grep gate] Reworded two explanatory comments**
- **Found during:** Task 1
- **Issue:** My own comments contained the literal gate strings (the raw-HTML API name, the private-profile table name) that the plan's grep gates scan for — same lesson 08-03 hit.
- **Fix:** Reworded pre-commit; zero code change.

**4. [Sequencing] Task 2's per-task `npm run build` verify ran after Task 3's edits**
- Task 2 passes props ListingDetail only accepts after Task 3 — tsc cannot be green between them. Both files were written, verified together (tsc + build green), then committed as two atomic, correctly-scoped commits in plan order.

## Verification

- `npx tsc --noEmit` clean; `npm run build` green (`/listings/[id]` dynamic).
- `npx vitest run`: 35 files / 224 passed / 1 skipped — no regression.
- Grep gates on all 5 touched files: no private-profile refs, no star-selects, no `getSession`, no raw-HTML injection — exit 1 (no matches).
- Parallel-wave hygiene: 08-05 commits (`7985082`, `ee27c17`) interleaved cleanly — zero file overlap; all 5 of this plan's files verified by file-on-disk AND in HEAD.

## Commits

| Task | Commit | Files |
| ---- | ------ | ----- |
| 1 | `fcf985a` | comment-section.tsx, comment-composer.tsx |
| 2 | `744ce9a` | app/(public)/listings/[id]/page.tsx |
| 3 | `2fe6f7b` | listing-detail.tsx, sold-toggle.tsx |

## Self-Check: PASSED

- All 5 files exist on disk and in HEAD.
- All 3 commits present in `git log`.
- Full suite, tsc, build, grep gates all green.
