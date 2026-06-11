import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getThreadForViewer, getThreadMessages } from "@/lib/messaging/queries";
import { markThreadRead } from "@/lib/actions/messages";
import { ThreadHeader } from "@/components/messaging/thread-header";
import { ThreadView } from "@/components/messaging/thread-view";
import { Toaster } from "@/components/ui/sonner";

// The private chat (MSG-05/06) — personalized, never cache one participant's
// thread for another (invariant 6). The (app) layout already getClaims-guards;
// viewerId is re-derived here because the queries are viewer-scoped (defense in
// depth, /saved precedent).
export const dynamic = "force-dynamic";

// PRIVACY (MSG-06): the ONLY identity source in this chat is the participant
// public-name map built from profiles_public (resolvePublicName inside the
// reader). The buyer's contact-form name/email/phone live in contact_log and
// NEVER appear as chat identity (locked decision).
export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId: rawId } = await params;
  const threadId = Number(rawId);
  // Malformed handle → same 404 as a thread you can't see (no existence leak).
  if (!Number.isInteger(threadId) || threadId <= 0) notFound();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const viewerId = data.claims.sub as string;

  // RLS scopes the read to participants; null collapses nonexistent and
  // forbidden into one notFound (no existence leak).
  const thread = await getThreadForViewer(threadId, viewerId);
  if (!thread) notFound();

  // Initial messages + viewer→counterparty block state (owner-RLS read of
  // user_blocks — only the viewer's own block rows are visible).
  const [messages, { data: blockRow }] = await Promise.all([
    getThreadMessages(threadId),
    supabase
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", viewerId)
      .eq("blocked_id", thread.counterpartyId)
      .maybeSingle(),
  ]);
  const isBlocked = blockRow !== null;

  // Stamp the viewer-side read watermark on open: clears the unread badge AND
  // re-arms the new-message email throttle (notify.ts sends again only after a
  // read). Best-effort — a failed stamp never blocks the render.
  await markThreadRead(threadId);

  // The sender-identity map: auth UUID → public name, both sides.
  const names: Record<string, string> = {
    [thread.buyerId]: thread.buyerName,
    [thread.sellerId]: thread.sellerName,
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <ThreadHeader
        listingId={thread.listingId}
        listingTitle={thread.listingTitle}
        listingPrice={thread.listingPrice}
        listingStatus={thread.listingStatus}
        listingPhotoUrl={thread.listingPhotoUrl}
        counterpartyName={thread.counterpartyName}
        counterpartyId={thread.counterpartyId}
        initiallyBlocked={isBlocked}
      />
      <ThreadView
        threadId={thread.threadId}
        viewerId={viewerId}
        initialMessages={messages}
        names={names}
        sendDisabled={
          isBlocked
            ? {
                reason: `You blocked ${thread.counterpartyName}. Unblock them to send messages.`,
              }
            : undefined
        }
      />
      <Toaster />
    </div>
  );
}
