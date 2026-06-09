import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicProfileHeader } from "@/components/profile/public-profile-header";
import { EmptyListings } from "@/components/profile/empty-listings";
import { resolvePublicName, type SellerType } from "@/lib/seller/badge";

// Public, anon-readable surface. Reads profiles_public ONLY (zero PII) and the
// derived active-listings count via the active_listing_count RPC (not a stored
// column). No PII columns exist on this table, so there is nothing to leak.
// Anon-safe → do NOT mark force-dynamic; default caching is fine.

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();

  // Enumerate exactly the allowed public facts (+ id for the RPC). display_name and
  // seller_type are owner-chosen NON-PII columns (ACCT-07/08) — adding them keeps this
  // read PII-free. NEVER select('*'), never join profiles_private.
  const { data: profile } = await supabase
    .from("profiles_public")
    .select(
      "id, username, state_province, country, member_since, display_name, seller_type",
    )
    .eq("username", username)
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  // Active-listings count is DERIVED, not stored (PRIV-03). Returns 0 in Phase 1;
  // the function body is rewritten in Phase 5 once listings exist.
  const { data: activeCount } = await supabase.rpc("active_listing_count", {
    profile_id: profile.id,
  });
  const count = activeCount ?? 0;

  // Verified Seller badge (VERF-04) is a SECURITY DEFINER boolean — recomputed
  // each read, so clearing any signal (email/phone/marketplace terms) auto-revokes
  // it. Like active_listing_count, it exposes only the derived boolean, never PII.
  const { data: verified } = await supabase.rpc("is_verified_seller", {
    profile_id: profile.id,
  });

  // ACCT-08: the public name = coalesce(display_name, username). Reverting to anonymous
  // (display_name = null) structurally returns the original handle — username is never
  // mutated. The legal private name is never read here.
  const publicName = resolvePublicName(profile.display_name, profile.username);
  const sellerType = (profile.seller_type ?? null) as SellerType | null;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <PublicProfileHeader
        publicName={publicName}
        sellerType={sellerType}
        stateProvince={profile.state_province}
        country={profile.country}
        memberSince={profile.member_since}
        activeListingCount={count}
        verified={Boolean(verified)}
      />
      {/* Phase 1 has no listings yet — the grid arrives in Phase 5. */}
      <EmptyListings />
    </main>
  );
}
