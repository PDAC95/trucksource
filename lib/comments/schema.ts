// Shared Zod schema for a listing comment (SOCL-01) — the SAME schema validates
// on the client (UX) and inside the addComment Server Action (trust boundary).
// Single client+server source of truth (CLAUDE.md invariant), mirroring
// lib/listings/schema.ts.
import { z } from "zod";

/**
 * The maximum comment body length. SINGLE SHARED CONSTANT — MUST equal the DB
 * CHECK on listing_comments.body (migration 0015_social.sql:
 * `char_length(body) between 1 and 1000`). The unit test asserts the lockstep
 * (COMMENT_MAX_LENGTH === 1000); if the DB CHECK ever changes, change BOTH.
 */
export const COMMENT_MAX_LENGTH = 1000;

/**
 * A comment the user is posting.
 *   - listingId: REQUIRED — the listing being commented on. Coerced (the client
 *     hands route-param/select strings, same convention as listingSchema ids).
 *   - parentId: optional/nullable — set ⇒ this is a depth-1 reply to a top-level
 *     comment. Depth-1 STRUCTURE is enforced by the INSERT RLS policy (a crafted
 *     reply-to-a-reply is rejected by the DB, not by this schema).
 *   - body: REQUIRED, trimmed, 1..COMMENT_MAX_LENGTH chars (whitespace-only ⇒
 *     empty after trim ⇒ invalid).
 */
export const commentSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  parentId: z.coerce.number().int().positive().nullable().optional(),
  body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH),
});

export type CommentInput = z.infer<typeof commentSchema>;
