import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Enforcement notification emails (ADMO-01) — best-effort Resend posture
// cloned from lib/messaging/notify.ts: raw fetch to api.resend.com, escaped
// interpolation, try/catch swallow, NEVER throws into the calling action.
// The admin_audit_log row is the record; email is a courtesy (Pattern 9).
//
// STAGING NOTE: onboarding@resend.dev only delivers to the Resend account
// address until the pre-launch domain verification — enforcement emails to
// other Staging users will be attempted and silently dropped by Resend. Do
// not flag that in UAT; swap to the verified takeoffparts.com sender before
// launch.
const FROM = "Take-Off Parts <onboarding@resend.dev>";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type EnforcementEmailAction =
  | "warn"
  | "suspend"
  | "ban"
  | "reactivate"
  | "rename";

const ACTION_LEAD: Record<EnforcementEmailAction, string> = {
  warn: "You have received a warning about your Take-Off Parts account.",
  suspend: "Your Take-Off Parts account has been suspended.",
  ban: "Your Take-Off Parts account has been banned.",
  reactivate: "Your Take-Off Parts account has been reactivated.",
  rename: "Your Take-Off Parts username has been changed by a moderator.",
};

/**
 * Best-effort enforcement email. The recipient's address is resolved HERE via
 * the service role (one sanctioned cross-user profiles_private read — the
 * notify.ts precedent) and is never returned to the caller. Returns whether
 * the send succeeded; callers ignore the result (audit row is the record).
 */
export async function sendEnforcementEmail(
  userId: string,
  details: {
    subject: string;
    action: EnforcementEmailAction;
    reason?: string;
    until?: string; // ISO — suspension expiry
    newUsername?: string;
  },
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    const admin = createAdminClient();
    const { data: priv } = await admin
      .from("profiles_private")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    const to = (priv as { email: string } | null)?.email;
    if (!to) return false;

    const untilText = details.until
      ? new Intl.DateTimeFormat("en-US", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(new Date(details.until))
      : null;

    const textLines = [
      ACTION_LEAD[details.action],
      "",
      ...(untilText ? [`Suspended until: ${untilText}`, ""] : []),
      ...(details.newUsername
        ? [`Your new username: ${details.newUsername}`, ""]
        : []),
      ...(details.reason ? [`Reason: ${details.reason}`, ""] : []),
      details.action === "suspend"
        ? "While suspended you can read your messages but cannot post, sell, or send messages. Access is restored automatically when the suspension ends."
        : details.action === "ban"
          ? "Your listings have been removed from the marketplace and you can no longer use your account."
          : details.action === "reactivate"
            ? "You can sign in and use the marketplace normally again."
            : "Please review the marketplace rules to keep your account in good standing.",
    ];

    const htmlParts = [
      `<p>${escapeHtml(ACTION_LEAD[details.action])}</p>`,
      ...(untilText
        ? [`<p><strong>Suspended until:</strong> ${escapeHtml(untilText)}</p>`]
        : []),
      ...(details.newUsername
        ? [
            `<p><strong>Your new username:</strong> ${escapeHtml(details.newUsername)}</p>`,
          ]
        : []),
      ...(details.reason
        ? [`<p><strong>Reason:</strong> ${escapeHtml(details.reason)}</p>`]
        : []),
      `<p>${escapeHtml(textLines[textLines.length - 1])}</p>`,
    ];

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      // No reply-to — never leak any address (notify.ts posture).
      body: JSON.stringify({
        from: FROM,
        to,
        subject: details.subject,
        text: textLines.join("\n"),
        html: htmlParts.join("\n"),
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("[admin/email] enforcement email failed:", err);
    return false;
  }
}
