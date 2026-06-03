import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Interim admin-alert path for the OTP spend cap and other abuse signals.
// abuse_events is a service-role-only table (RLS on, no policy), so all writes go
// through the admin client. Phase 10 surfaces abuse_events in the admin console;
// until then the durable DB row + a Resend email to ABUSE_ALERT_EMAIL are the alert.

/**
 * Spend-cap breach handler: (1) write a durable abuse_events row, (2) best-effort
 * email the admin via the Resend HTTP API. The email is wrapped so a Resend
 * failure NEVER throws into the calling action — the DB row is the durable record.
 */
export async function alertSpendCap({
  userId,
  e164,
  ip,
}: {
  userId: string;
  e164: string;
  ip: string;
}): Promise<void> {
  const admin = createAdminClient();

  // 1) Durable record (Phase-10 admin queue).
  try {
    await admin.from("abuse_events").insert({
      kind: "spend_cap",
      user_id: userId,
      phone_e164: e164,
      ip,
      detail: { at: new Date().toISOString() },
    });
  } catch {
    // Swallow: alerting must never throw into the OTP action.
  }

  // 2) Best-effort admin email (interim; Phase 10 replaces with the admin console).
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: process.env.ABUSE_ALERT_EMAIL,
        subject: "[Take-Off Parts] OTP spend cap reached",
        text: `Spend cap hit. user=${userId} ip=${ip}`,
      }),
    });
  } catch {
    // Swallow: a Resend outage must not break the (already-blocked) send path.
  }
}

/**
 * Best-effort abuse logger for bot_blocked / region_blocked / rate_limited records.
 * Errors are swallowed — logging must never interfere with the guard short-circuit.
 */
export async function logAbuse(
  kind: "bot_blocked" | "region_blocked" | "rate_limited",
  fields: {
    userId?: string | null;
    e164?: string | null;
    ip?: string | null;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("abuse_events").insert({
      kind,
      user_id: fields.userId ?? null,
      phone_e164: fields.e164 ?? null,
      ip: fields.ip ?? null,
      detail: fields.detail ?? { at: new Date().toISOString() },
    });
  } catch {
    // Swallow: best-effort only.
  }
}
