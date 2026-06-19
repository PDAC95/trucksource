import type { createClient } from "@/lib/supabase/server";

// Phase 17 trust-boundary gates — the server-action authority for the
// just-in-time verification flow. The anon key is public, so these owner-row
// reads (NOT the UI redirect) are the real authorization boundary
// (CLAUDE.md invariants #2/#3/#6). Both helpers read the CALLER'S OWN
// profiles_private row via the passed-in cookie-bound client (owner RLS,
// auth.uid() = id) — no service-role, no new columns, existing flags only.
//
// This intentionally does NOT call the is_verified_seller() RPC: that fn also
// re-checks email_confirmed_at, but the (app) layout already auth-gates every
// reachable caller (no claims → /login), so the email arm is always satisfied.
// Reading the flags directly is one round-trip and mirrors the existing owner
// read in app/(app)/verify/page.tsx.

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Contact gate: phone-verified only. Buyers don't accept selling terms.
export async function requirePhoneVerified(
  supabase: ServerClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles_private")
    .select("phone_verified_at")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(data?.phone_verified_at);
}

// Sell gate: phone + marketplace terms (= is_verified_seller minus the email
// arm, which the (app) layout already gates). Read both columns directly — one
// round-trip.
export async function requireVerifiedSeller(
  supabase: ServerClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles_private")
    .select("phone_verified_at, marketplace_terms_accepted_at")
    .eq("id", userId)
    .maybeSingle();
  return (
    Boolean(data?.phone_verified_at) &&
    Boolean(data?.marketplace_terms_accepted_at)
  );
}
