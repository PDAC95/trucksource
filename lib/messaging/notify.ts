import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Phase 9 notification senders — best-effort Resend posture cloned from
// lib/verify/alert.ts: raw fetch to api.resend.com, try/catch swallow, NEVER
// throws into the calling action. The durable DB row (contact_log / reports /
// messages) is always the copy of record; email is a courtesy.
//
// FROM address: onboarding@resend.dev only delivers to the Resend account
// address until the pre-launch domain verification (known constraint — swap to
// the verified takeoffparts.com sender before launch).
const FROM = "Take-Off Parts <onboarding@resend.dev>";

// User-supplied values (usernames, listing titles, message snippets) are
// interpolated into email HTML — escape them to prevent HTML injection.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendEmail(payload: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      // NO reply-to header EVER — it would leak the counterparty's email and
      // bypass the privacy model.
      body: JSON.stringify({ from: FROM, ...payload }),
    });
    return res.ok;
  } catch (err) {
    console.error("[notify] resend send failed:", err);
    return false;
  }
}

/**
 * Admin copy of a new contact-form submission (MSG-02 locked decision: the
 * admin copy carries FULL context BY DESIGN — buyer PII included). Returns
 * true on send success so submitContact can stamp contact_log.admin_emailed_at;
 * the contact_log ROW remains the copy of record either way.
 */
export async function sendAdminContactCopy(contact: {
  contactLogId: number;
  listingId: number;
  listingTitle: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  buyerUsername: string;
  sellerUsername: string;
  messageText: string;
  createdAt: string;
}): Promise<boolean> {
  const to = process.env.ADMIN_NOTIFICATIONS_EMAIL;
  if (!to) {
    console.warn(
      "[notify] ADMIN_NOTIFICATIONS_EMAIL unset — skipping admin contact copy (contact_log row is the copy of record)",
    );
    return false;
  }
  return sendEmail({
    to,
    subject: `[Take-Off Parts] New contact #${contact.contactLogId} on listing #${contact.listingId}`,
    text: [
      `New contact submission`,
      ``,
      `Listing: #${contact.listingId} — ${contact.listingTitle}`,
      `Buyer: ${contact.buyerUsername}`,
      `Seller: ${contact.sellerUsername}`,
      ``,
      `Buyer name: ${contact.buyerName}`,
      `Buyer email: ${contact.buyerEmail}`,
      `Buyer phone: ${contact.buyerPhone ?? "(not provided)"}`,
      ``,
      `Message:`,
      contact.messageText,
      ``,
      `Submitted at: ${contact.createdAt}`,
    ].join("\n"),
  });
}

/**
 * Admin copy of a new abuse report (MSG-07). Best-effort; the reports row is
 * the durable record for the Phase-10 queue.
 */
export async function sendAdminReportCopy(report: {
  reportId: number;
  reporterUsername: string;
  targetType: "listing" | "comment" | "message";
  targetId: number;
  reason: string;
  detail?: string;
  createdAt: string;
}): Promise<boolean> {
  const to = process.env.ADMIN_NOTIFICATIONS_EMAIL;
  if (!to) {
    console.warn(
      "[notify] ADMIN_NOTIFICATIONS_EMAIL unset — skipping admin report copy (reports row is the copy of record)",
    );
    return false;
  }
  return sendEmail({
    to,
    subject: `[Take-Off Parts] New report #${report.reportId}: ${report.reason} on ${report.targetType} #${report.targetId}`,
    text: [
      `New report`,
      ``,
      `Reporter: ${report.reporterUsername}`,
      `Target: ${report.targetType} #${report.targetId}`,
      `Reason: ${report.reason}`,
      `Detail: ${report.detail ?? "(none)"}`,
      ``,
      `Submitted at: ${report.createdAt}`,
    ].join("\n"),
  });
}

const SNIPPET_MAX = 100;

/**
 * Throttled "you have a new message" email to a thread participant (MSG-03).
 *
 * Privacy: the recipient's email + opt-out flag are resolved HERE via the
 * service-role admin client — the ONE sanctioned cross-user profiles_private
 * read (near-expiry cron precedent). The email is NEVER returned to any
 * caller, and the counterparty's email never appears anywhere in the payload
 * (no reply-to).
 *
 * Throttle: at most one email per thread side until the recipient reads the
 * thread again — send only if the recipient-side *_emailed_at watermark is
 * null OR *_last_read_at > *_emailed_at. On send, stamp *_emailed_at = now().
 * Small read-then-write races are acceptable (documented ratelimit.ts
 * posture): the worst case is one duplicate email.
 */
export async function sendNewMessageEmail(input: {
  threadId: number;
  recipientId: string;
  senderUsername: string;
  listingTitle: string;
  snippet: string;
  threadUrl: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    // Thread watermarks — figure out which side the recipient is on.
    const { data: thread } = await admin
      .from("message_threads")
      .select(
        "buyer_id, seller_id, buyer_last_read_at, seller_last_read_at, buyer_emailed_at, seller_emailed_at",
      )
      .eq("id", input.threadId)
      .maybeSingle();
    if (!thread) return;

    const isBuyer = thread.buyer_id === input.recipientId;
    const isSeller = thread.seller_id === input.recipientId;
    if (!isBuyer && !isSeller) return; // not a participant — never email

    const emailedAt = isBuyer
      ? thread.buyer_emailed_at
      : thread.seller_emailed_at;
    const lastReadAt = isBuyer
      ? thread.buyer_last_read_at
      : thread.seller_last_read_at;

    // Throttle: already emailed and not read since → skip.
    if (
      emailedAt !== null &&
      (lastReadAt === null || new Date(lastReadAt) <= new Date(emailedAt))
    ) {
      return;
    }

    // Recipient PII read (service role; never returned to the caller).
    const { data: priv } = await admin
      .from("profiles_private")
      .select("email, message_email_opt_out")
      .eq("id", input.recipientId)
      .maybeSingle();
    if (!priv?.email || priv.message_email_opt_out) return;

    // Seller receiving = buyer asked; buyer receiving = seller replied.
    const subject = isSeller
      ? `${input.senderUsername} is asking about your ${input.listingTitle}`
      : `${input.senderUsername} replied about ${input.listingTitle}`;

    const snippet =
      input.snippet.length > SNIPPET_MAX
        ? `${input.snippet.slice(0, SNIPPET_MAX - 1)}…`
        : input.snippet;

    const sent = await sendEmail({
      to: priv.email,
      subject,
      text: [
        `${input.senderUsername} sent you a message about "${input.listingTitle}":`,
        ``,
        `"${snippet}"`,
        ``,
        `View message: ${input.threadUrl}`,
      ].join("\n"),
      html: [
        `<p><strong>${escapeHtml(input.senderUsername)}</strong> sent you a message about &ldquo;${escapeHtml(input.listingTitle)}&rdquo;:</p>`,
        `<blockquote>${escapeHtml(snippet)}</blockquote>`,
        `<p><a href="${escapeHtml(input.threadUrl)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">View message</a></p>`,
      ].join("\n"),
    });

    // Stamp the recipient-side watermark so the next message doesn't re-email
    // until the recipient reads the thread (markThreadRead re-arms it).
    if (sent) {
      const column = isBuyer ? "buyer_emailed_at" : "seller_emailed_at";
      await admin
        .from("message_threads")
        .update({ [column]: new Date().toISOString() })
        .eq("id", input.threadId);
    }
  } catch (err) {
    // Best-effort: notification failures NEVER reach the send-message action.
    console.error("[notify] sendNewMessageEmail failed:", err);
  }
}
