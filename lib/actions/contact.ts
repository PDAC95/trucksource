"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { contactSchema } from "@/lib/messaging/schema";
import { getExistingThreadId } from "@/lib/messaging/queries";
import {
  sendAdminContactCopy,
  sendNewMessageEmail,
} from "@/lib/messaging/notify";
import { resolvePublicName } from "@/lib/seller/badge";
import { requirePhoneVerified } from "@/lib/verify/gate";

// submitContact — the invariant-#5 spine (MSG-02/03/05).
//
// THE ORDER IS THE INVARIANT (CLAUDE.md #5, 09-RESEARCH Pattern 3): validate →
// contact_log insert (BLOCKING) → admin copy (best-effort) → thread → first
// message. The contact record persists and the admin copy is attempted BEFORE
// any thread or message row exists; the unit test asserts the call order.
//
// IDENTITY: getClaims() only (invariant #6 — never the cookie-only session
// reader). Writes go through the cookie-bound client, so RLS (0016) is the
// authorization boundary: contact_log buyer-insert, threads buyer-insert,
// messages participant-insert. There is NO service-role/admin client here —
// notify.ts owns the only sanctioned admin reads/writes (grep-gated).
//
// Steps 6→9 are sequential best-effort inserts (05-RESEARCH Open Q3 posture;
// an atomic RPC is a documented future upgrade). The failure mode that matters
// is benign: contact persisted but thread missing → the buyer retries and
// steps 5/8 dedupe against unique(listing_id, buyer_id).

// MSG-rate-limit: a buyer may open at most this many NEW contacts per trailing
// 24h (head-count on contact_log; re-contacts dedupe at step 5 first).
const CONTACT_DAILY_LIMIT = 10;
const CONTACT_WINDOW_MS = 24 * 60 * 60 * 1000;

export type SubmitContactResult =
  | { ok: true; threadId: number; existing?: boolean }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "not_verified"
        | "invalid"
        | "rate_limited"
        | "contacts_closed"
        | "not_found";
    };

/**
 * Contact a seller about a listing: persist the contact record, copy the
 * admin, open (or rejoin) the private thread, send the first message.
 *
 * Guard ORDER (Pattern 3 — each step numbered below; the unit test asserts
 * contact-before-thread and the failure short-circuit):
 *   1. getClaims identity (else unauthenticated)
 *   2. contactSchema re-validation (same schema as the client)
 *   3. rate limit: >= CONTACT_DAILY_LIMIT contacts in 24h → rate_limited
 *   4. listing pre-check: missing → not_found; not active → contacts_closed;
 *      own listing → invalid
 *   5. existing-thread dedupe → return the thread id, NO new rows of any kind
 *   6. INSERT contact_log — BLOCKING: any failure ends the action here
 *   7. admin copy email — attempted NOW, before the thread; best-effort
 *   8. INSERT message_threads (raced duplicate re-reads the existing thread)
 *   9. INSERT the first messages row (sender = buyer, body = form message)
 *  10. seller new-message email — best-effort, throttled in notify.ts
 *  11. revalidate + return { threadId }
 */
export async function submitContact(
  input: unknown,
): Promise<SubmitContactResult> {
  const supabase = await createClient();

  // 1) IDENTITY — getClaims, never the cookie-only session reader.
  const { data: claims } = await supabase.auth.getClaims();
  const buyerId = claims?.claims?.sub;
  if (!buyerId) return { ok: false, error: "unauthenticated" };

  // 2) SCHEMA RE-VALIDATION — the server-side trust boundary.
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  // 1.5) TRUST BOUNDARY (Phase 17): contacting requires a phone-verified buyer
  //      (phone ONLY — buyers don't accept selling terms). Fails fast, BEFORE
  //      the rate-limit count and BEFORE the invariant-#5 contact_log write, so
  //      an unverified buyer creates nothing. The anon key is public, so the
  //      server is the authority (CLAUDE.md #2/#3); the /verify redirect is UX.
  if (!(await requirePhoneVerified(supabase, buyerId)))
    return { ok: false, error: "not_verified" };

  // 3) RATE LIMIT — head-count of the buyer's own contacts in the window.
  const windowStart = new Date(Date.now() - CONTACT_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("contact_log")
    .select("id", { count: "exact", head: true })
    .eq("buyer_id", buyerId)
    .gte("created_at", windowStart);
  if ((count ?? 0) >= CONTACT_DAILY_LIMIT)
    return { ok: false, error: "rate_limited" };

  // 4) LISTING PRE-CHECK — enumerated columns; clean errors (RLS re-enforces).
  const { data: listing } = await supabase
    .from("listings")
    .select("id, status, seller_id, title")
    .eq("id", v.listingId)
    .maybeSingle();
  if (!listing) return { ok: false, error: "not_found" };
  const l = listing as {
    id: number;
    status: string;
    seller_id: string;
    title: string;
  };
  if (l.status !== "active") return { ok: false, error: "contacts_closed" };
  if (l.seller_id === buyerId) return { ok: false, error: "invalid" };

  // 5) EXISTING-THREAD DEDUPE — re-contact resolves to the existing thread;
  //    zero inserts of any kind (locked: no second form, no duplicate contact).
  const existingId = await getExistingThreadId(v.listingId, buyerId);
  if (existingId !== null)
    return { ok: true, threadId: existingId, existing: true };

  // 6) CONTACT_LOG INSERT — BLOCKING. The contact record MUST persist before
  //    anything else exists (invariant #5). Failure → nothing else happens.
  const { data: contactRow, error: contactError } = await supabase
    .from("contact_log")
    .insert({
      listing_id: v.listingId,
      buyer_id: buyerId,
      seller_id: l.seller_id,
      buyer_name: v.name,
      buyer_email: v.email,
      buyer_phone: v.phone ?? null,
      message_text: v.message,
    })
    .select("id, created_at")
    .single();
  if (contactError || !contactRow) return { ok: false, error: "invalid" };
  const contact = contactRow as { id: number; created_at: string };

  // Public-name resolution for the emails (steps 7 + 10) — profiles_public
  // enumerated, public-only columns; never the PII table.
  const nameById = new Map<string, string>();
  const { data: profileData } = await supabase
    .from("profiles_public")
    .select("id, username, display_name")
    .in("id", [buyerId, l.seller_id]);
  for (const p of (profileData ?? []) as {
    id: string;
    username: string;
    display_name: string | null;
  }[]) {
    nameById.set(p.id, resolvePublicName(p.display_name, p.username));
  }

  // 7) ADMIN COPY — attempted NOW, before the thread (invariant #5 ordering).
  //    Best-effort: notify.ts swallows failures and stamps admin_emailed_at on
  //    success via the admin client (contact_log is client-immutable). The
  //    contact_log ROW is the copy of record either way.
  try {
    await sendAdminContactCopy({
      contactLogId: contact.id,
      listingId: l.id,
      listingTitle: l.title,
      buyerName: v.name,
      buyerEmail: v.email,
      buyerPhone: v.phone,
      buyerUsername: nameById.get(buyerId) ?? "",
      sellerUsername: nameById.get(l.seller_id) ?? "",
      messageText: v.message,
      createdAt: contact.created_at,
    });
  } catch (err) {
    // Best-effort by contract; the durable row already exists.
    console.error("[contact] admin copy failed:", err);
  }

  // 8) THREAD INSERT — contact_log_id is NOT NULL in the schema, so invariant
  //    #5 is structural. A raced duplicate (unique(listing_id, buyer_id))
  //    re-reads the winner's thread and skips the message insert.
  let threadId: number;
  let racedDuplicate = false;
  const { data: threadRow, error: threadError } = await supabase
    .from("message_threads")
    .insert({
      listing_id: v.listingId,
      buyer_id: buyerId,
      seller_id: l.seller_id,
      contact_log_id: contact.id,
    })
    .select("id")
    .single();
  if (threadError || !threadRow) {
    const raced = await getExistingThreadId(v.listingId, buyerId);
    if (raced === null) return { ok: false, error: "invalid" };
    threadId = raced;
    racedDuplicate = true;
  } else {
    threadId = (threadRow as { id: number }).id;
  }

  if (!racedDuplicate) {
    // 9) FIRST MESSAGE — sender = buyer, body = the form message. Best-effort
    //    past this point: the thread exists; a failed first message is
    //    recoverable in the chat UI.
    await supabase.from("messages").insert({
      thread_id: threadId,
      sender_id: buyerId,
      body: v.message,
    });

    // 10) SELLER EMAIL — throttled + best-effort inside notify.ts.
    await sendNewMessageEmail({
      threadId,
      recipientId: l.seller_id,
      senderUsername: nameById.get(buyerId) ?? "",
      listingTitle: l.title,
      snippet: v.message,
      threadUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/messages/${threadId}`,
    });
  }

  // 11) REVALIDATE + RETURN — the client routes to /messages/[threadId].
  revalidatePath("/messages");
  return { ok: true, threadId };
}
