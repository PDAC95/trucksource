"use server";

import { createClient } from "@/lib/supabase/server";
import {
  contactPreferenceSchema,
  sellerTypeSchema,
  displayNameSchema,
} from "@/lib/account/schema";
import { resolvePublicName } from "@/lib/seller/badge";

// Owner-scoped account settings mutations. LIST-07 lives here (the account-level
// contact preference), NOT on the listing form — the listing form only displays it.
// ACCT-07 (seller type) and ACCT-08 (public display name) live here too — both are
// NON-PII fields on profiles_public, written through the SAME owner-RLS boundary.
// NO path in this module ever reads profiles_private: display_name is owner-typed
// free text, NOT auto-populated from the legal private name (Pitfall 1).
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

export type UpdateSellerTypeResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" | "invalid" | "not_found" };

/**
 * Set (or clear) the caller's informational seller type (ACCT-07). A near-verbatim
 * clone of updateContactPreference. Order:
 *   1. getClaims identity (else unauthenticated)
 *   2. sellerTypeSchema re-validation (the trust boundary)
 *   3. owner-scoped update of profiles_public.seller_type
 *      (zero rows affected => not_found, no existence leak)
 * `sellerType: null` clears the badge (CONTEXT: empty = no badge). The seller type
 * is purely informational — it changes NO permissions. The owner-update RLS policy
 * on profiles_public IS the authorization boundary; NO service-role client.
 */
export async function updateSellerType(
  input: unknown,
): Promise<UpdateSellerTypeResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  const parsed = sellerTypeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { sellerType } = parsed.data;

  const { data, error } = await supabase
    .from("profiles_public")
    .update({ seller_type: sellerType })
    .eq("id", userId)
    .select("id");

  if (error) return { ok: false, error: "invalid" };
  if (!data || data.length === 0) return { ok: false, error: "not_found" };
  return { ok: true };
}

export type UpdateDisplayNameResult =
  | { ok: true; publicName: string }
  | { ok: false; error: "unauthenticated" | "invalid" | "not_found" };

/**
 * Reveal or revert the caller's opt-in public display name (ACCT-08). Order mirrors
 * updateSellerType. On success returns the RESOLVED public name (= coalesce of the
 * new display_name and the immutable username) so the form can show a preview toast.
 *
 * `displayName === null` is the REVERT path: it writes display_name = NULL and NEVER
 * touches `username`. The original anonymous handle is therefore structurally
 * preserved — the 0001 guard_username_rename trigger never fires because username is
 * unchanged, and no new handle is generated (Pitfall 2). display_name is owner-typed
 * free text; NO path here reads profiles_private (Pitfall 1).
 */
export async function updateDisplayName(
  input: unknown,
): Promise<UpdateDisplayNameResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  const parsed = displayNameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { displayName } = parsed.data;

  const { data, error } = await supabase
    .from("profiles_public")
    .update({ display_name: displayName ?? null })
    .eq("id", userId)
    .select("id, username, display_name");

  if (error) return { ok: false, error: "invalid" };
  if (!data || data.length === 0) return { ok: false, error: "not_found" };

  const row = data[0];
  return {
    ok: true,
    publicName: resolvePublicName(row.display_name, row.username),
  };
}
