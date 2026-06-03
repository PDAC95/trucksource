import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// The global daily SMS spend cap (PITFALLS #10, toll fraud). Read from env so it
// is tunable WITHOUT a redeploy; conservative numeric default of 200. A Twilio
// usage-trigger billing alert at a matching $ amount is the provider-side backstop.
function dailyCap(): number {
  const n = Number.parseInt(process.env.OTP_SEND_DAILY_CAP ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 200;
}

// Policy windows (CONTEXT: 3 sends/hr, 5 sends/day per phone — and a PARALLEL
// per-IP cap so phone-rotation behind one IP is throttled, PITFALL #5).
const PHONE_HOUR_MAX = 3;
const PHONE_DAY_MAX = 5;
const IP_HOUR_MAX = 3;
const IP_DAY_MAX = 5;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type SendBudgetResult =
  | { ok: true }
  | { ok: false; reason: "rate_limited" | "spend_cap" };

/**
 * Atomically-ish consume one OTP send "budget" unit for {userId, e164, ip}.
 *
 * Uses the service-role admin client because otp_send_attempts has RLS enabled
 * with NO policy (service-role-only; the anon/auth key can never touch it).
 *
 * Order of counters — spend cap FIRST so an over-budget request is rejected
 * before any per-key arithmetic:
 *   1. GLOBAL spend cap (all users, 24h)  -> 'spend_cap'
 *   2. per-phone hour / day               -> 'rate_limited'
 *   3. per-IP   hour / day                -> 'rate_limited'
 *   4. all pass -> insert one attempt row, return { ok: true }
 *
 * Race note: counts then insert is NOT a single transaction, so two concurrent
 * sends could each read just-under-limit and both insert. The caps are
 * deliberately conservative and Twilio Verify's own programmable rate limits +
 * Fraud Guard are the backstop, so the small over-count window is acceptable at
 * launch scale. Revisit (advisory lock / Upstash) only if write contention shows.
 */
export async function consumeSendBudget({
  userId,
  e164,
  ip,
}: {
  userId: string;
  e164: string;
  ip: string;
}): Promise<SendBudgetResult> {
  const admin = createAdminClient();
  const now = Date.now();
  const sinceHour = new Date(now - HOUR_MS).toISOString();
  const sinceDay = new Date(now - DAY_MS).toISOString();

  // Count attempts in a window, optionally scoped to one phone or IP.
  // head:true + count:'exact' returns the count without transferring rows.
  async function count(
    since: string,
    scope?: { phone_e164: string } | { ip: string },
  ): Promise<number> {
    let query = admin
      .from("otp_send_attempts")
      .select("id", { count: "exact", head: true })
      .gt("created_at", since);
    if (scope && "phone_e164" in scope) {
      query = query.eq("phone_e164", scope.phone_e164);
    } else if (scope && "ip" in scope) {
      query = query.eq("ip", scope.ip);
    }
    const { count: c } = await query;
    return c ?? 0;
  }

  // 1) GLOBAL spend cap (all users, last 24h).
  const globalDay = await count(sinceDay);
  if (globalDay >= dailyCap()) return { ok: false, reason: "spend_cap" };

  // 2) per-phone hour / day.
  const phoneHour = await count(sinceHour, { phone_e164: e164 });
  if (phoneHour >= PHONE_HOUR_MAX) return { ok: false, reason: "rate_limited" };

  const phoneDay = await count(sinceDay, { phone_e164: e164 });
  if (phoneDay >= PHONE_DAY_MAX) return { ok: false, reason: "rate_limited" };

  // 3) per-IP hour / day (parallel cap — PITFALL #5).
  const ipHour = await count(sinceHour, { ip });
  if (ipHour >= IP_HOUR_MAX) return { ok: false, reason: "rate_limited" };

  const ipDay = await count(sinceDay, { ip });
  if (ipDay >= IP_DAY_MAX) return { ok: false, reason: "rate_limited" };

  // 4) All windows clear: record this attempt and allow the (paid) send.
  await admin
    .from("otp_send_attempts")
    .insert({ user_id: userId, phone_e164: e164, ip });

  return { ok: true };
}
