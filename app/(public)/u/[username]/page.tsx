import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicProfileHeader } from "@/components/profile/public-profile-header";
import { EmptyListings } from "@/components/profile/empty-listings";
import { ProfileListingsGrid } from "@/components/profile/profile-listings-grid";
import { ProfileSort } from "@/components/profile/profile-sort";
import { resolvePublicName, type SellerType } from "@/lib/seller/badge";
import { listingPhotoPublicUrl } from "@/lib/listings/storage";
import { getConditions } from "@/lib/listings/cascade";
import type { SearchCard } from "@/lib/search/queries";

// Public, anon-readable surface. Reads profiles_public ONLY (zero PII) for the
// header, then the seller's ACTIVE listings from the public-read `listings` table
// (enumerated columns, never `*`, never profiles_private). No PII columns exist on
// any table read here, so nothing can leak.
// Anon-safe → do NOT mark force-dynamic; default caching is fine. The sort lives in
// the URL (?sort) so the sorted view stays cacheable + shareable.

type ProfileSortValue = "recent" | "price";

function coerceSort(raw: string | undefined): ProfileSortValue {
  return raw === "price" ? "price" : "recent";
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { username } = await params;
  const { sort: sortRaw } = await searchParams;
  const sort = coerceSort(sortRaw);
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

  // Active-listings count is DERIVED, not stored (PRIV-03).
  const { data: activeCount } = await supabase.rpc("active_listing_count", {
    profile_id: profile.id,
  });
  const count = activeCount ?? 0;

  // Verified Seller badge (VERF-04) is a SECURITY DEFINER boolean — recomputed each read.
  const { data: verified } = await supabase.rpc("is_verified_seller", {
    profile_id: profile.id,
  });

  // ACCT-08: the public name = coalesce(display_name, username).
  const publicName = resolvePublicName(profile.display_name, profile.username);
  const sellerType = (profile.seller_type ?? null) as SellerType | null;

  // --- Seller's active listings (SRCH-01). The grid the buyer came to see (LOCKED). ---
  // listings is PUBLIC-read so RLS doesn't auto-scope; the explicit seller_id filter +
  // status='active' + not-expired clause does. Enumerate columns — NEVER `*`, never
  // profiles_private. recent = date_listed desc (default); price = asking_price asc.
  const { data: listingRows } = await supabase
    .from("listings")
    .select("id, title, asking_price, condition_id, date_listed")
    .eq("seller_id", profile.id)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order(sort === "price" ? "asking_price" : "date_listed", {
      ascending: sort === "price",
    });

  const cards = await hydrateProfileCards(
    supabase,
    (listingRows ?? []) as ProfileListingRow[],
    publicName,
    profile.username,
    profile.state_province,
  );

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

      {cards.length > 0 ? (
        <section
          aria-label="Active listings"
          className="mt-6 flex flex-col gap-4"
        >
          <div className="flex items-center justify-end">
            <ProfileSort current={sort} />
          </div>
          <ProfileListingsGrid cards={cards} />
        </section>
      ) : (
        <div className="mt-6">
          <EmptyListings />
        </div>
      )}
    </main>
  );
}

type ProfileListingRow = {
  id: number;
  title: string;
  asking_price: number | string | null;
  condition_id: number;
  date_listed: string;
};

/**
 * Batch-hydrate the seller's active listings into the same SearchCard shape as the
 * feed (cover photo + Make/Model chip + condition name), with NO N+1. The seller name
 * + state on every card is THIS profile's already-resolved publicName/username/state —
 * no extra profiles_public read needed. Photos via listingPhotoPublicUrl, chip via a
 * batched listing_fitment→models→makes read, condition via the cached reference reader.
 */
async function hydrateProfileCards(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: ProfileListingRow[],
  sellerName: string,
  sellerUsername: string,
  stateProvince: string | null,
): Promise<SearchCard[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  // Cover photo: lowest sort_order per listing.
  const { data: photoData } = await supabase
    .from("listing_photos")
    .select("listing_id, storage_path, sort_order")
    .in("listing_id", ids)
    .order("sort_order", { ascending: true });
  const coverByListing = new Map<number, string>();
  for (const p of (photoData ?? []) as {
    listing_id: number;
    storage_path: string;
    sort_order: number;
  }[]) {
    if (!coverByListing.has(p.listing_id)) {
      coverByListing.set(
        p.listing_id,
        listingPhotoPublicUrl(supabase, p.storage_path),
      );
    }
  }

  // Fitment chip: the first fit's Make + Model per listing.
  const { data: fitData } = await supabase
    .from("listing_fitment")
    .select(
      "listing_id, model_id, models:model_id ( name, makes:make_id ( name ) )",
    )
    .in("listing_id", ids);
  type FitRow = {
    listing_id: number;
    models: { name: string; makes: { name: string } | null } | null;
  };
  const chipByListing = new Map<number, string>();
  for (const f of (fitData ?? []) as unknown as FitRow[]) {
    if (chipByListing.has(f.listing_id)) continue; // first fit only
    const make = f.models?.makes?.name ?? "";
    const model = f.models?.name ?? "";
    const chip = `${make} ${model}`.trim();
    if (chip) chipByListing.set(f.listing_id, chip);
  }

  // conditionName via the cheap cached reference reader.
  const conditions = await getConditions();
  const conditionNameById = new Map(conditions.map((c) => [c.id, c.name]));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    price: r.asking_price === null ? null : Number(r.asking_price),
    conditionName: conditionNameById.get(r.condition_id) ?? "",
    stateProvince,
    coverPhotoUrl: coverByListing.get(r.id) ?? null,
    photoUrls: [coverByListing.get(r.id)].filter(Boolean) as string[],
    fitmentChip: chipByListing.get(r.id) ?? null,
    sellerName,
    sellerUsername,
  }));
}
