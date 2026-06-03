// Shared Zod schemas for the verification wizard — the SAME schemas validate on
// the client (UX) and inside the Server Actions (trust boundary). This is the
// single client+server source of truth (CLAUDE.md invariant 6 / Forms pattern).
// Never duplicate these rules in a query or component.
import { z } from "zod";

/**
 * The current marketplace-terms version recorded in profiles_private
 * (terms_accepted_at + terms_version). The wizard and the acceptTerms action
 * must agree on this string so an acceptance is stamped with the version the
 * user actually saw. Bump this when the marketplace terms change.
 */
export const TERMS_VERSION = "2026-06-03";

/**
 * Step 1 — phone entry. Raw phone string only; the +1/E.164 enforcement lives in
 * toE164Plus1 (lib/verify/phone.ts) inside the Server Action — do NOT duplicate
 * that geo logic here. The field exists so client and server validate the same
 * shape before the action normalizes + region-gates.
 */
export const sendOtpSchema = z.object({
  phone: z.string().min(7),
});

/** Step 2 — OTP entry. Exactly 6 digits (Twilio Verify code length). */
export const checkOtpSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

/**
 * Step 3 — marketplace-terms acceptance. The checkbox must be literally true
 * (mirrors registerSchema.acceptTerms) and the accepted version string is
 * persisted alongside the timestamp.
 */
export const acceptTermsSchema = z.object({
  accept: z.literal(true),
  termsVersion: z.string().min(1),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type CheckOtpInput = z.infer<typeof checkOtpSchema>;
export type AcceptTermsInput = z.infer<typeof acceptTermsSchema>;
