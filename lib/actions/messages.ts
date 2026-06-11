"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { messageSchema } from "@/lib/messaging/schema";
import type { MessageRow } from "@/lib/messaging/queries";
import { sendNewMessageEmail } from "@/lib/messaging/notify";
import { resolvePublicName } from "@/lib/seller/badge";

// Chat trust boundary (MSG-03/04) — clones lib/actions/comments.ts posture:
// getClaims → zod → head-count rate limit → RLS-gated write → revalidate.
//
// AUTHORIZATION IS RLS (0016_messaging.sql): the messages INSERT policy
// enforces self-attribution + thread participation + not-blocked-either-way —
// the block check lives ONLY there (single enforcement point; no app-side
// re-implementation). Thread updates ride the participant UPDATE policy.
// There is NO service-role/admin client here — notify.ts owns the only
// sanctioned admin reads (grep-gated).
//
// Error copy contract: actions return MACHINE errors; the UI maps them to
// honest English ("You're sending messages too fast. Wait a minute." /
// "You've reached the daily contact limit. Try again tomorrow.").

// Burst rate limit: MORE than this many of the caller's own messages in the
// trailing minute rejects the send (head-count, dependency-free).
const MESSAGE_BURST_LIMIT = 20;
const MESSAGE_WINDOW_MS = 60_000;

// Positive-int id guard for untrusted client handles (listings.ts precedent).
function isValidId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id > 0;
}

// The enumerated thread row the role-scoped actions read (ids + role only).
type ThreadParticipants = {
  id: number;
  listing_id: number;
  buyer_id: string;
  seller_id: string;
};

export type SendMessageResult =
  | { ok: true; message: MessageRow }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "invalid"
        | "rate_limited"
        | "blocked_or_invalid";
    };

/**
 * Send a chat message in an existing thread. Guard ORDER (unit-tested):
 *   1. getClaims identity (else unauthenticated)
 *   2. messageSchema re-validation (else invalid)
 *   3. rate limit: > MESSAGE_BURST_LIMIT own messages in 60s → rate_limited
 *   4. self-attributed INSERT under RLS — participation + block enforcement
 *      live in the policy; a rejection collapses to blocked_or_invalid
 *   5. bump thread.last_message_at (participant UPDATE policy, best-effort)
 *   6. throttled new-message email to the OTHER participant (best-effort)
 *
 * Returns the inserted row so the client can render optimistically (the
 * realtime echo de-dupes by id).
 */
export async function sendMessage(input: unknown): Promise<SendMessageResult> {
  const supabase = await createClient();

  // 1) IDENTITY — getClaims, never the cookie-only session reader.
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  // 2) SCHEMA RE-VALIDATION.
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  // 3) RATE LIMIT — head-count of the caller's own recent messages.
  const windowStart = new Date(Date.now() - MESSAGE_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", userId)
    .gte("created_at", windowStart);
  if ((count ?? 0) > MESSAGE_BURST_LIMIT)
    return { ok: false, error: "rate_limited" };

  // 4) SELF-ATTRIBUTED INSERT — RLS enforces participant + not-blocked; any
  //    policy rejection (blocked, non-participant, crafted thread id)
  //    collapses to one opaque error (no block-state leak).
  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({ thread_id: v.threadId, sender_id: userId, body: v.body })
    .select("id, thread_id, sender_id, body, created_at")
    .single();
  if (error || !inserted) return { ok: false, error: "blocked_or_invalid" };
  const message = inserted as MessageRow;

  // 5) ACTIVITY BUMP — drives inbox ordering + unread watermarks. Best-effort:
  //    a failed bump never voids the already-persisted message.
  await supabase
    .from("message_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", v.threadId);

  // 6) RECIPIENT EMAIL — throttled + best-effort inside notify.ts. Reads are
  //    enumerated/public-only: thread ids for the counterparty, listings for
  //    the title, profiles_public for the sender's public name.
  try {
    const { data: threadData } = await supabase
      .from("message_threads")
      .select("id, listing_id, buyer_id, seller_id")
      .eq("id", v.threadId)
      .maybeSingle();
    const thread = threadData as ThreadParticipants | null;
    if (thread) {
      const recipientId =
        thread.buyer_id === userId ? thread.seller_id : thread.buyer_id;
      const [{ data: listingData }, { data: senderData }] = await Promise.all([
        supabase
          .from("listings")
          .select("title")
          .eq("id", thread.listing_id)
          .maybeSingle(),
        supabase
          .from("profiles_public")
          .select("username, display_name")
          .eq("id", userId)
          .maybeSingle(),
      ]);
      const sender = senderData as {
        username: string;
        display_name: string | null;
      } | null;
      await sendNewMessageEmail({
        threadId: v.threadId,
        recipientId,
        senderUsername: sender
          ? resolvePublicName(sender.display_name, sender.username)
          : "",
        listingTitle: (listingData as { title: string } | null)?.title ?? "",
        snippet: v.body,
        threadUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/messages/${v.threadId}`,
      });
    }
  } catch (err) {
    console.error("[messages] recipient email failed:", err);
  }

  revalidatePath(`/messages/${v.threadId}`);
  revalidatePath("/messages");
  return { ok: true, message };
}

export type ThreadSideResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" | "invalid" | "not_found" };

// Role-scoped watermark/hide update: reads the thread to learn WHICH side the
// caller is (RLS already scopes the read), then updates ONLY the viewer-side
// column, double-scoped by the role id eq. Column discipline is app-side; the
// participant UPDATE policy is the row-level boundary.
async function updateViewerSideColumn(
  threadId: number,
  buyerColumn: "buyer_last_read_at" | "buyer_hidden_at",
  sellerColumn: "seller_last_read_at" | "seller_hidden_at",
): Promise<ThreadSideResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  if (!isValidId(threadId)) return { ok: false, error: "invalid" };

  const { data: threadData } = await supabase
    .from("message_threads")
    .select("id, buyer_id, seller_id")
    .eq("id", threadId)
    .maybeSingle();
  const thread = threadData as {
    id: number;
    buyer_id: string;
    seller_id: string;
  } | null;
  // RLS yields zero rows for non-participants — no existence leak.
  if (!thread) return { ok: false, error: "not_found" };
  if (thread.buyer_id !== userId && thread.seller_id !== userId)
    return { ok: false, error: "not_found" };

  const isBuyer = thread.buyer_id === userId;
  const column = isBuyer ? buyerColumn : sellerColumn;
  const roleColumn = isBuyer ? "buyer_id" : "seller_id";

  const { data, error } = await supabase
    .from("message_threads")
    .update({ [column]: new Date().toISOString() })
    .eq("id", threadId)
    .eq(roleColumn, userId)
    .select("id");
  if (error) return { ok: false, error: "invalid" };
  if (!data || data.length === 0) return { ok: false, error: "not_found" };

  return { ok: true };
}

/**
 * Move the caller's read watermark on a thread (drives the unread badge AND
 * re-arms the email throttle — notify.ts sends again only after a read).
 * Updates ONLY the viewer's own side column.
 */
export async function markThreadRead(
  threadId: number,
): Promise<ThreadSideResult> {
  return updateViewerSideColumn(
    threadId,
    "buyer_last_read_at",
    "seller_last_read_at",
  );
}

/**
 * Hide a thread from the caller's inbox. Hide ≠ delete (MSG-04): every row
 * persists; only the viewer-side visibility flag flips.
 */
export async function hideThread(threadId: number): Promise<ThreadSideResult> {
  return updateViewerSideColumn(
    threadId,
    "buyer_hidden_at",
    "seller_hidden_at",
  );
}

export type BlockResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" | "invalid" };

// UUID shape guard for untrusted client handles (block targets are auth UUIDs).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Block a user. Owner-RLS insert on user_blocks; enforcement happens ONLY in
 * the messages INSERT policy (blocked-either-way ⇒ send rejected) — blocking
 * never hides existing history (locked decision). Idempotent: re-blocking an
 * already-blocked user succeeds.
 */
export async function blockUser(blockedId: string): Promise<BlockResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  if (typeof blockedId !== "string" || !UUID_RE.test(blockedId))
    return { ok: false, error: "invalid" };
  if (blockedId === userId) return { ok: false, error: "invalid" };

  const { error } = await supabase
    .from("user_blocks")
    .insert({ blocker_id: userId, blocked_id: blockedId });
  // 23505 = already blocked — idempotent success.
  if (error && (error as { code?: string }).code !== "23505")
    return { ok: false, error: "invalid" };

  return { ok: true };
}

/**
 * Unblock a user — owner-RLS delete on user_blocks. Idempotent: unblocking a
 * non-blocked user is a no-op success.
 */
export async function unblockUser(blockedId: string): Promise<BlockResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  if (typeof blockedId !== "string" || !UUID_RE.test(blockedId))
    return { ok: false, error: "invalid" };

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", userId)
    .eq("blocked_id", blockedId);
  if (error) return { ok: false, error: "invalid" };

  return { ok: true };
}
