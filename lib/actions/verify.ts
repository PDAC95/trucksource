"use server";

import { headers } from "next/headers";
import { checkBotId } from "botid/server";
import { createClient } from "@/lib/supabase/server";
import { toE164Plus1 } from "@/lib/verify/phone";
import { consumeSendBudget } from "@/lib/verify/ratelimit";
import { sendVerification, checkVerification } from "@/lib/verify/twilio";
import { alertSpendCap, logAbuse } from "@/lib/verify/alert";
import {
  sendOtpSchema,
  checkOtpSchema,
  acceptTermsSchema,
} from "@/lib/verify/schema";

// The hardened verification pipeline (02-RESEARCH.md Pattern 1). The OTP *send*
// path is reachable by not-yet-trusted users, so it is an SMS-pumping toll-fraud
// target (PITFALLS #10). Guard ORDER is load-bearing: every guard runs BEFORE the
// paid Twilio call, and the first failure short-circuits — so a bot / over-limit /
// out-of-region request costs ZERO SMS.
//
// All three actions identify the caller via getClaims() (never getSession — it
// trusts unverified cookie data) and write to the caller's OWN profiles_private
// row through the cookie-bound user client, so owner RLS scopes every PII write.
// Only the abuse store (ratelimit/alert) uses the service-role admin client.

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export type SendOtpResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "blocked"
        | "unauthenticated"
        | "invalid"
        | "region_unsupported"
        | "rate_limited"
        | "spend_cap";
    };

/**
 * Send a phone OTP. Order (first failure returns before Twilio):
 *   1. BotID    2. auth(getClaims)   3. Zod + +1/E.164 geo
 *   4/5. atomic rate-limit (phone+IP) + global spend cap   6. persist phone + Twilio send
 */
export async function sendOtp(input: unknown): Promise<SendOtpResult> {
  // 1) BOT CHECK — invisible, before anything paid happens.
  const { isBot } = await checkBotId();
  if (isBot) {
    const ip = await clientIp();
    await logAbuse("bot_blocked", { ip });
    return { ok: false, error: "blocked" };
  }

  // 2) AUTH — verification is a post-signup step. getClaims, never getSession.
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  // 3) VALIDATE + NORMALIZE + GEO (+1 only) — same Zod schema as the client.
  const parsed = sendOtpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const e164 = toE164Plus1(parsed.data.phone);
  if (!e164) {
    const ip = await clientIp();
    await logAbuse("region_blocked", { userId, ip });
    return { ok: false, error: "region_unsupported" };
  }

  // 4/5) RATE LIMIT (phone + IP) + GLOBAL SPEND CAP — atomic-ish in Postgres.
  const ip = await clientIp();
  const gate = await consumeSendBudget({ userId, e164, ip });
  if (!gate.ok) {
    if (gate.reason === "spend_cap") {
      await alertSpendCap({ userId, e164, ip });
    } else {
      await logAbuse("rate_limited", { userId, e164, ip });
    }
    return { ok: false, error: gate.reason };
  }

  // 6) ONLY NOW pay for the SMS. Persist the (unverified) phone to the caller's
  // own profiles_private first (owner RLS via the user client) so resume-on-abandon
  // knows the number, then send.
  await supabase
    .from("profiles_private")
    .update({ phone: e164 })
    .eq("id", userId);
  await sendVerification(e164);
  return { ok: true };
}

export type CheckOtpResult =
  | { ok: true }
  | {
      ok: false;
      error: "unauthenticated" | "invalid" | "no_pending" | "invalid_code";
    };

/**
 * Verify a submitted code against the caller's pending phone. Sets
 * phone_verified_at ONLY when Twilio returns 'approved'.
 */
export async function checkOtp(input: unknown): Promise<CheckOtpResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  const parsed = checkOtpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  // Read the caller's current (unverified) phone — owner RLS via the user client.
  const { data: row } = await supabase
    .from("profiles_private")
    .select("phone")
    .eq("id", userId)
    .single();
  const phone = row?.phone;
  if (!phone) return { ok: false, error: "no_pending" };

  const approved = await checkVerification(phone, parsed.data.code);
  if (!approved) return { ok: false, error: "invalid_code" };

  // Approved: stamp phone_verified_at for the owner.
  await supabase
    .from("profiles_private")
    .update({ phone_verified_at: new Date().toISOString() })
    .eq("id", userId);
  return { ok: true };
}

export type AcceptTermsResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" | "invalid" };

/**
 * Persist marketplace-terms acceptance (VERF-03): marketplace_terms_accepted_at +
 * terms_version for the owner only.
 */
export async function acceptTerms(input: unknown): Promise<AcceptTermsResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  const parsed = acceptTermsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  await supabase
    .from("profiles_private")
    .update({
      marketplace_terms_accepted_at: new Date().toISOString(),
      terms_version: parsed.data.termsVersion,
    })
    .eq("id", userId);
  return { ok: true };
}
