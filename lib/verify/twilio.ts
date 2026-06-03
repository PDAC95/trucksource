import "server-only";
import twilio from "twilio";

// Server-only Twilio Verify v2 wrapper (02-RESEARCH.md Pattern 2). The OTP code
// length (6), lifetime (10 min) and max check attempts (5) are configured on the
// Verify SERVICE in the Twilio console — never in code. All three creds are
// server-only: NO NEXT_PUBLIC_ prefix, so they never reach the browser bundle.
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
);
const SERVICE = process.env.TWILIO_VERIFY_SERVICE_SID!;

/** Send a 6-digit SMS OTP to a (+1, already-validated) E.164 number. */
export async function sendVerification(toE164: string) {
  return client.verify.v2
    .services(SERVICE)
    .verifications.create({ to: toE164, channel: "sms" });
}

/**
 * Check a submitted code against the pending verification.
 * @returns true ONLY when Twilio returns status 'approved'
 *   ('pending' | 'approved' | 'canceled' | 'max_attempts_reached' | 'expired').
 */
export async function checkVerification(
  toE164: string,
  code: string,
): Promise<boolean> {
  const res = await client.verify.v2
    .services(SERVICE)
    .verificationChecks.create({ to: toE164, code });
  return res.status === "approved";
}
