import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getOwnRestriction } from "@/lib/account/restrictions";
import {
  getMyThreads,
  getThreadForViewer,
  getThreadMessages,
  type MessageRow,
  type ThreadView as ThreadViewData,
} from "@/lib/messaging/queries";
import { markThreadRead } from "@/lib/actions/messages";
import { ThreadList } from "@/components/messaging/thread-list";
import { ThreadHeader } from "@/components/messaging/thread-header";
import { ThreadView } from "@/components/messaging/thread-view";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

// The inbox (MSG-05) — personalized, never cache one user's conversations for
// another (invariant 6). The (app) layout already getClaims-guards; viewerId is
// re-derived here because every read is viewer-scoped (defense in depth).
export const dynamic = "force-dynamic";

// ONE URL SCHEME (research Open Q3 — pure layout/CSS, NO parallel routes):
// the list column always renders; `?thread={id}` additionally renders the
// split-pane thread on the right, which is `hidden lg:flex` — on mobile rows
// link to /messages/[threadId] instead. Invalid/foreign ?thread= values fall
// back to the empty pane (RLS collapses nonexistent and forbidden — no
// existence leak, no error page).
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const { thread: rawThread } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const viewerId = data.claims.sub as string;

  const threads = await getMyThreads(viewerId);

  // Desktop split pane: hydrate the selected thread only when the handle is
  // well-formed AND the viewer is a participant (getThreadForViewer is RLS- +
  // re-check-scoped). Anything else renders the placeholder pane.
  let selected: ThreadViewData | null = null;
  let messages: MessageRow[] = [];
  let isBlocked = false;
  let restriction: Awaited<ReturnType<typeof getOwnRestriction>> = null;
  const threadId = Number(rawThread);
  if (rawThread && Number.isInteger(threadId) && threadId > 0) {
    selected = await getThreadForViewer(threadId, viewerId);
    if (selected) {
      const [msgs, { data: blockRow }, ownRestriction] = await Promise.all([
        getThreadMessages(threadId),
        supabase
          .from("user_blocks")
          .select("blocked_id")
          .eq("blocker_id", viewerId)
          .eq("blocked_id", selected.counterpartyId)
          .maybeSingle(),
        getOwnRestriction(),
      ]);
      messages = msgs;
      isBlocked = blockRow !== null;
      restriction = ownRestriction;
      // Stamp the read watermark on open (clears unread + re-arms the email
      // throttle). Best-effort — never blocks the render.
      await markThreadRead(threadId);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-muted-foreground text-sm">
          Your private conversations about parts.
        </p>
      </div>

      {threads.length === 0 && !selected ? (
        <div className="mt-10 grid place-items-center gap-4 rounded-lg border border-dashed py-16 text-center">
          <MessageSquare className="text-muted-foreground size-8" />
          <div className="grid gap-1.5">
            <p className="font-medium">No messages yet</p>
            <p className="text-muted-foreground mx-auto max-w-sm text-sm">
              When you contact a seller — or a buyer contacts you —
              conversations appear here.
            </p>
          </div>
          <Button asChild>
            <Link href="/">Browse parts</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-6">
          <ThreadList items={threads} activeThreadId={selected?.threadId} />

          {/* The split-pane thread — desktop only (hidden lg:flex). */}
          <div className="hidden min-h-[24rem] lg:flex lg:flex-col lg:gap-4">
            {selected ? (
              <>
                <ThreadHeader
                  listingId={selected.listingId}
                  listingTitle={selected.listingTitle}
                  listingPrice={selected.listingPrice}
                  listingStatus={selected.listingStatus}
                  listingPhotoUrl={selected.listingPhotoUrl}
                  counterpartyName={selected.counterpartyName}
                  counterpartyId={selected.counterpartyId}
                  initiallyBlocked={isBlocked}
                />
                <ThreadView
                  threadId={selected.threadId}
                  viewerId={viewerId}
                  initialMessages={messages}
                  names={{
                    [selected.buyerId]: selected.buyerName,
                    [selected.sellerId]: selected.sellerName,
                  }}
                  sendDisabled={
                    // Same precedence as /messages/[threadId] — UX mirrors of
                    // the 0019 messages INSERT policy arms:
                    // moderation freeze (both sides) > viewer restriction >
                    // viewer block.
                    selected.frozenAt
                      ? {
                          reason:
                            "This conversation has been closed by moderation.",
                        }
                      : restriction
                        ? {
                            reason:
                              "You can't send messages while your account is suspended.",
                          }
                        : isBlocked
                          ? {
                              reason: `You blocked ${selected.counterpartyName}. Unblock them to send messages.`,
                            }
                          : undefined
                  }
                />
              </>
            ) : (
              <div className="text-muted-foreground grid flex-1 place-items-center rounded-lg border border-dashed text-sm">
                Select a conversation
              </div>
            )}
          </div>
        </div>
      )}

      <Toaster />
    </div>
  );
}
