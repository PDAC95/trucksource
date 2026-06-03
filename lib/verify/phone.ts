import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * +1-only E.164 normalizer — the geo allowlist's first, free line of defense.
 *
 * Rejects any non-North-American (+1) number LOCALLY, before any Twilio call is
 * ever made, so a bot/over-region request never costs an SMS. Defense-in-depth:
 * Twilio Verify Geo Permissions (US/CA only) is the provider-side backstop.
 *
 * @param raw User-entered phone string (E.164, bare 10-digit, or formatted).
 * @returns The E.164 string iff the number is a valid US/Canada (+1) number, else null.
 */
export function toE164Plus1(raw: string): string | null {
  // Default region 'US' lets bare 10-digit input resolve to a NANP number.
  const p = parsePhoneNumberFromString(raw, "US");
  if (!p || !p.isValid()) return null;
  if (p.countryCallingCode !== "1") return null; // +1 only (NANP)
  if (p.country !== "US" && p.country !== "CA") return null; // tighten to US/CA
  return p.number; // E.164, e.g. "+15125550123"
}
