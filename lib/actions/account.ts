"use server";

import { createClient } from "@/lib/supabase/server";
import { contactPreferenceSchema } from "@/lib/account/schema";

// Owner-scoped account settings mutations. LIST-07 lives here (the account-level
// contact preference), NOT on the listing form — the listing form only displays it.
//
// IDENTITY: the caller is derived via getClaims() — never the cookie-only session
// reader (which trusts unverified cookie data). The write goes through the
// cookie-bound user client, so the owner-update policy on profiles_public
// (`(select auth.uid()) = id`, from 0001) scopes it to the caller's own row.
// There is NO service-role/admin client here — this is owner data only.

export type UpdateContactPreferenceResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" | "invalid" | "not_found" };

/**
 * Set the caller's account-level contact preference (LIST-07). Order:
 *   1. getClaims identity (else unauthenticated)
 *   2. contactPreferenceSchema re-validation (the trust boundary)
 *   3. owner-scoped update of profiles_public.contact_preference
 *      (zero rows affected => not_found, no existence leak)
 * The owner-update RLS policy on profiles_public IS the authorization boundary.
 */
export async function updateContactPreference(
  input: unknown,
): Promise<UpdateContactPreferenceResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  const parsed = contactPreferenceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { contactPreference } = parsed.data;

  const { data, error } = await supabase
    .from("profiles_public")
    .update({ contact_preference: contactPreference })
    .eq("id", userId)
    .select("id");

  if (error) return { ok: false, error: "invalid" };
  if (!data || data.length === 0) return { ok: false, error: "not_found" };
  return { ok: true };
}
