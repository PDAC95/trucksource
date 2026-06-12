# Phase 8: Social Layer - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

The 30% social experience comes alive — buyers can publicly comment on listings (attributed to username only), save listings to view later, and sellers can mark their listings as sold. Requirements: SOCL-01, SOCL-02, LIST-06. Cross-cutting gate: comments display commenter by username only (never PII); saves are owner-scoped via RLS.

</domain>

<decisions>
## Implementation Decisions

### Comment behavior
- One level of replies: comment → flat replies underneath (Facebook Marketplace style). No multi-level nesting.
- Any logged-in user can comment (buyers and sellers alike) — maximizes social activity per the "public social interaction" pillar.
- Users can delete their own comments; no editing (avoids changing context after the seller replied).
- Display order: newest first (top-level comments); replies read in conversation order under their parent.

### Seller control over comments
- Seller can delete ANY comment on their own listings — direct spam/troll control before Phase 10 admin exists. Deletions are logged (who deleted, when) for later audit.
- No "close comments" toggle in v1 — comments stay open; per-comment deletion is the moderation tool.
- Deleting a comment cascades to its replies (no orphans, no "[deleted]" placeholders).
- Seller gets a simple in-app indicator of new comments (badge/counter on "my listings") — NOT a full notification system (that would be its own phase).

### Saved listings experience
- Save button (heart/bookmark icon) on listing cards in feed/search AND on the listing detail page.
- Saved listings page reuses the Phase 7 search card grid component — consistent UI, fast to build.
- Saved listings that get sold/expired REMAIN in the list with a status badge ("Sold"/"Expired") — user removes them manually; nothing disappears silently.
- Seller sees a save COUNT on their own listings (e.g. "12 saves") — never WHO saved (privacy). Count is seller-facing, not public.

### Sold behavior
- Marking "Sold": listing page stays live with a "Sold" badge (links and saves don't break), but the listing is removed from search results and feed.
- Reversible: seller can "Mark as available" again (off-platform sales can fall through; zero friction to correct).
- Comments on a sold listing: existing comments remain visible; new comments are closed.
- Mark-as-sold action lives in both the seller's own listing detail page AND the "my listings" management view, with a simple confirmation before applying.

### Claude's Discretion
- Exact UI for delete confirmation, badges, comment composer
- Comment length limits and basic rate limiting
- Empty states (no comments yet, no saved listings)
- Schema details for the deletion audit log

</decisions>

<specifics>
## Specific Ideas

- Comments should feel like Facebook Marketplace Q&A: one reply level, seller answering buyer questions inline.
- Privacy invariant restated: comment attribution is username only — never join to `profiles_private` on any public surface.

</specifics>

<deferred>
## Deferred Ideas

- Full notification system (email/push for comments, saves, etc.) — own phase; v1 ships only the in-app new-comment indicator.
- Public save counts as social proof — revisit after Analytics (Phase 10) shows engagement data.

</deferred>

---

*Phase: 08-social-layer*
*Context gathered: 2026-06-10*
