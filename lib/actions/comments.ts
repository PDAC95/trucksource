"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { commentSchema } from "@/lib/comments/schema";

// Comment trust boundary (SOCL-01) — clones lib/actions/listings.ts.
//
// IDENTITY: every action derives the caller via getClaims() — never the
// cookie-only session reader (CLAUDE.md invariant #6). Writes go through the
// cookie-bound user client, so RLS (0015_social.sql) is the authorization
// boundary:
//   - listing_comments INSERT enforces self-attribution + ACTIVE-unexpired
//     listing + structural depth-1 (reply-to-a-reply is impossible);
//   - listing_comments DELETE admits the author OR the listing's seller —
//     deleteComment deliberately does NOT re-implement the seller check;
//   - listings UPDATE (comments_seen_at) is owner-scoped.
// There is NO service-role/admin client here — grep-gated.
//
// The pre-checks in addComment (rate limit, listing-active) exist for CLEAN
// error messages; RLS remains the real enforcement (a raced/crafted insert that
// slips past a pre-check still dies at the policy and collapses to "invalid").

// Basic dependency-free rate limit (08-RESEARCH "Don't Hand-Roll"): generous —
// more than RATE_LIMIT_MAX of the caller's OWN comments in the trailing window
// rejects the post. Counted via an owner-filtered head-count query.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

export type AddCommentResult =
  | { ok: true; id: number }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "invalid"
        | "rate_limited"
        | "comments_closed"
        | "not_found";
    };

/**
 * Post a comment (or a depth-1 reply) on an active listing. Guard ORDER (the
 * unit test asserts it):
 *   1. getClaims identity (else unauthenticated)
 *   2. commentSchema re-validation (else invalid) — same schema as the client
 *   3. rate limit: > RATE_LIMIT_MAX own comments in the last 60s (rate_limited)
 *   4. listing pre-check (enumerated id/status/expires_at): missing → not_found,
 *      sold/expired → comments_closed ("comments close when sold", Pitfall 2)
 *   5. self-attributed insert; an RLS rejection here (e.g. a crafted depth-2
 *      parentId or a raced status flip) collapses to invalid
 */
export async function addComment(input: unknown): Promise<AddCommentResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  // 3) RATE LIMIT — count the caller's own recent comments (head-count only).
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("listing_comments")
    .select("id", { count: "exact", head: true })
    .eq("author_id", userId)
    .gte("created_at", windowStart);
  if ((count ?? 0) >= RATE_LIMIT_MAX)
    return { ok: false, error: "rate_limited" };

  // 4) LISTING PRE-CHECK — clean message; the INSERT policy re-enforces this.
  const { data: listing } = await supabase
    .from("listings")
    .select("id, status, expires_at")
    .eq("id", v.listingId)
    .maybeSingle();
  if (!listing) return { ok: false, error: "not_found" };
  const l = listing as {
    id: number;
    status: string;
    expires_at: string | null;
  };
  const expired =
    l.expires_at !== null && new Date(l.expires_at).getTime() <= Date.now();
  if (l.status !== "active" || expired)
    return { ok: false, error: "comments_closed" };

  // 5) SELF-ATTRIBUTED INSERT — author_id = the verified caller; the with-check
  // policy also enforces it (plus active-listing + depth-1).
  const { data: inserted, error } = await supabase
    .from("listing_comments")
    .insert({
      listing_id: v.listingId,
      author_id: userId,
      parent_id: v.parentId ?? null,
      body: v.body,
    })
    .select("id")
    .single();
  if (error || !inserted) return { ok: false, error: "invalid" };

  revalidatePath(`/listings/${v.listingId}`);
  return { ok: true, id: (inserted as { id: number }).id };
}

// Positive-int id guard for untrusted client handles (copied from listings.ts).
function isValidId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id > 0;
}

export type DeleteCommentResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" | "invalid" | "not_found" };

/**
 * Delete a comment. RLS DECIDES authorization — the DELETE policy admits the
 * comment's author OR the seller of the listing it sits on; this action does
 * NOT re-implement the seller check. Zero rows affected (not authorized OR
 * nonexistent) collapses to not_found — no existence leak. Reply cascade (FK)
 * and the deletion audit (BEFORE DELETE trigger) happen in the DB.
 */
export async function deleteComment(id: number): Promise<DeleteCommentResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  if (!isValidId(id)) return { ok: false, error: "invalid" };

  const { data, error } = await supabase
    .from("listing_comments")
    .delete()
    .eq("id", id)
    .select("id, listing_id");
  if (error) return { ok: false, error: "invalid" };
  if (!data || data.length === 0) return { ok: false, error: "not_found" };

  const listingId = (data[0] as { listing_id: number }).listing_id;
  revalidatePath(`/listings/${listingId}`);
  return { ok: true };
}

export type MarkCommentsSeenResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" | "invalid" | "not_found" };

/**
 * Move the seller's "comments seen" watermark on their OWN listing (powers the
 * unread-comments indicator on /sell/listings). Owner-scoped: explicit
 * .eq("seller_id", userId) + owner RLS; zero rows → not_found. No
 * revalidatePath needed — /sell/listings is force-dynamic.
 */
export async function markCommentsSeen(
  listingId: number,
): Promise<MarkCommentsSeenResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  if (!isValidId(listingId)) return { ok: false, error: "invalid" };

  const { data, error } = await supabase
    .from("listings")
    .update({ comments_seen_at: new Date().toISOString() })
    .eq("id", listingId)
    .eq("seller_id", userId)
    .select("id");
  if (error) return { ok: false, error: "invalid" };
  if (!data || data.length === 0) return { ok: false, error: "not_found" };

  return { ok: true };
}
