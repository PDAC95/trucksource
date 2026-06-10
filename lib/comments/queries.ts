// lib/comments/queries.ts — the comment-thread READ layer (SOCL-01).
//
// getListingComments(listingId) returns the username-attributed, depth-1 comment
// thread for a public listing page: parents newest-first, replies under their
// parent oldest-first (conversation order) — both LOCKED.
//
// PRIVACY (CLAUDE.md invariant #1, Pitfall 7): attribution is resolved via ONE
// batched profiles_public read with ENUMERATED columns (id, username,
// display_name) + resolvePublicName — the private profile table is NEVER
// reachable here, no `*`, no profiles embed on the comment select. The column lists below MUST stay in
// lockstep with COMMENT_SELECT_COLUMNS / COMMENT_AUTHOR_COLUMNS in
// tests/integration/social.contract.test.ts (the 08-01 zero-PII contract).
//
// Anon-callable: listing_comments is public-read (0015 RLS), so this uses the
// cookie server client like getListing does — no auth required to read.
import { createClient } from "@/lib/supabase/server";
import { resolvePublicName } from "@/lib/seller/badge";

export type CommentItem = {
  id: number;
  parentId: number | null;
  body: string;
  createdAt: string;
  authorId: string; // needed by the UI to show "delete" on own comments
  authorName: string; // resolvePublicName(display_name, username) — PII-free
  authorUsername: string; // for the /u/[username] link
};

export type CommentThread = { parent: CommentItem; replies: CommentItem[] };

// Raw row shapes for the two enumerated reads (mirror the contract-test constants).
type CommentRow = {
  id: number;
  listing_id: number;
  author_id: string;
  parent_id: number | null;
  body: string;
  created_at: string;
};

type AuthorRow = {
  id: string;
  username: string;
  display_name: string | null;
};

/**
 * Read the full comment thread for one listing. Two queries total (Pitfall 5 —
 * no N+1): one enumerated listing_comments select, one batched profiles_public
 * read for ALL unique authors. Bucketing happens in app code:
 *   - parents (parent_id === null) sorted created_at DESC (newest first, LOCKED)
 *   - replies grouped under their parent sorted created_at ASC (LOCKED)
 *   - orphan replies (parent deleted mid-read) are dropped
 * Authors with a missing profiles_public row fall back to "user" — never crash.
 * Returns [] on any error.
 */
export async function getListingComments(
  listingId: number,
): Promise<CommentThread[]> {
  const supabase = await createClient();

  // 1) ONE enumerated select — mirrors COMMENT_SELECT_COLUMNS. Never star-select,
  //    never a profiles embed (attribution is a separate batched read below).
  const { data, error } = await supabase
    .from("listing_comments")
    .select("id, listing_id, author_id, parent_id, body, created_at")
    .eq("listing_id", listingId);

  if (error || !data) return [];
  const rows = data as unknown as CommentRow[];
  if (rows.length === 0) return [];

  // 2) ONE batched author read — mirrors COMMENT_AUTHOR_COLUMNS. Enumerated
  //    profiles_public columns ONLY (username-only attribution, zero PII).
  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  const { data: authorData } = await supabase
    .from("profiles_public")
    .select("id, username, display_name")
    .in("id", authorIds);

  const authorById = new Map<string, AuthorRow>();
  for (const a of (authorData ?? []) as AuthorRow[]) {
    authorById.set(a.id, a);
  }

  const toItem = (r: CommentRow): CommentItem => {
    const author = authorById.get(r.author_id);
    return {
      id: r.id,
      parentId: r.parent_id,
      body: r.body,
      createdAt: r.created_at,
      authorId: r.author_id,
      // Missing profile (should not happen — FK to auth.users via profiles) falls
      // back to a neutral handle; the thread never crashes on attribution.
      authorName: author
        ? resolvePublicName(author.display_name, author.username)
        : "user",
      authorUsername: author?.username ?? "",
    };
  };

  // 3) Bucket: parents newest-first; replies per parent oldest-first; orphans dropped.
  const parents = rows
    .filter((r) => r.parent_id === null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const repliesByParent = new Map<number, CommentRow[]>();
  for (const r of rows) {
    if (r.parent_id === null) continue;
    const bucket = repliesByParent.get(r.parent_id);
    if (bucket) bucket.push(r);
    else repliesByParent.set(r.parent_id, [r]);
  }

  return parents.map((p) => ({
    parent: toItem(p),
    replies: (repliesByParent.get(p.id) ?? [])
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(toItem),
  }));
}
