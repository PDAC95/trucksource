import Link from "next/link";
import { MessageSquare } from "lucide-react";

import type { CommentItem, CommentThread } from "@/lib/comments/queries";
import {
  CommentDeleteButton,
  CommentReplyToggle,
} from "@/components/comments/comment-composer";

// The server-rendered comment thread (SOCL-01). Renders the threads EXACTLY as
// the reader bucketed them — parents newest-first, replies oldest-first under
// their parent (both LOCKED) — no re-sorting here.
//
// PRIVACY (CLAUDE.md invariant #1): attribution is username-only. CommentItem
// carries authorName/authorUsername resolved from profiles_public — no real
// name, email, or phone can reach this component because the reader never
// touches the private profile table. Bodies render as PLAIN TEXT children
// (whitespace-preserving via CSS) — user input is never injected as raw HTML.
//
// "Comments closed when sold" (LOCKED, Pitfall 2): existing comments STAY
// visible on a sold listing; only the composer is replaced by a notice — the
// page owns that swap, this section owns the per-thread closed state (no reply
// affordance + the notice text when commentsClosed).

// Short, locale-stable date for attribution lines (server-rendered only — no
// hydration mismatch risk in an RSC).
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

function Comment({
  comment,
  listingId,
  viewerId,
  isSeller,
  isParent,
  canReply,
  isAuthenticated,
}: {
  comment: CommentItem;
  listingId: number;
  viewerId: string | null;
  isSeller: boolean;
  isParent: boolean;
  canReply: boolean;
  isAuthenticated: boolean;
}) {
  // Delete shows for the comment's own author and for THIS listing's seller —
  // mirroring (not re-implementing) the RLS delete policy, which is what
  // actually authorizes the delete server-side.
  const canDelete = viewerId === comment.authorId || isSeller;

  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        {comment.authorUsername ? (
          <Link
            href={`/u/${comment.authorUsername}`}
            className="text-sm font-medium hover:underline"
          >
            {comment.authorName}
          </Link>
        ) : (
          <span className="text-sm font-medium">{comment.authorName}</span>
        )}
        <span className="text-muted-foreground text-xs">
          {formatDate(comment.createdAt)}
        </span>
        {canDelete && (
          <CommentDeleteButton commentId={comment.id} isParent={isParent} />
        )}
      </div>
      {/* Plain text, whitespace-preserving. NO HTML rendering of user input. */}
      <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
      {/* Reply ONLY on top-level comments (depth-1 LOCKED) and only while the
          listing is active (comments closed when sold). */}
      {isParent && canReply && (
        <div>
          <CommentReplyToggle
            listingId={listingId}
            parentId={comment.id}
            isAuthenticated={isAuthenticated}
          />
        </div>
      )}
    </div>
  );
}

export function CommentSection({
  listingId,
  threads,
  viewerId,
  isSeller,
  commentsClosed,
}: {
  listingId: number;
  threads: CommentThread[];
  viewerId: string | null; // getClaims sub, or null for anon viewers
  isSeller: boolean; // seller of THIS listing → may delete any comment
  commentsClosed: boolean; // listing not active → no posting, thread stays
}) {
  const total = threads.reduce((n, t) => n + 1 + t.replies.length, 0);
  const isAuthenticated = viewerId != null;
  const canReply = !commentsClosed;

  return (
    <section aria-label="Comments" className="grid gap-4">
      <h2 className="text-lg font-semibold tracking-tight">
        Comments{total > 0 ? ` (${total})` : ""}
      </h2>

      {commentsClosed && (
        <div className="bg-muted/50 text-muted-foreground rounded-lg border p-4 text-sm">
          Comments are closed — this listing was sold.
        </div>
      )}

      {threads.length === 0 ? (
        !commentsClosed && (
          <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm">
            <MessageSquare className="size-4 shrink-0" />
            <p>No comments yet — be the first to ask.</p>
          </div>
        )
      ) : (
        <ul className="grid gap-5">
          {threads.map((t) => (
            <li key={t.parent.id} className="grid gap-3">
              <Comment
                comment={t.parent}
                listingId={listingId}
                viewerId={viewerId}
                isSeller={isSeller}
                isParent
                canReply={canReply}
                isAuthenticated={isAuthenticated}
              />
              {t.replies.length > 0 && (
                <ul className="border-muted grid gap-3 border-l-2 pl-4">
                  {t.replies.map((r) => (
                    <li key={r.id}>
                      <Comment
                        comment={r}
                        listingId={listingId}
                        viewerId={viewerId}
                        isSeller={isSeller}
                        isParent={false}
                        canReply={false}
                        isAuthenticated={isAuthenticated}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
