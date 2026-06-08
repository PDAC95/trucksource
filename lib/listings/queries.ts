// Listing read surface — the public detail read + the owner's edit list. Mirrors
// lib/garage/queries.ts: a plain async lib (no "use server") using the cookie-bound
// server client, joining ONLY public/fitment-name relations.
//
// PRIVACY (CLAUDE.md invariant #1, Pitfall 7): the seller is resolved through
// profiles_public ONLY, with ENUMERATED columns (username, state_province, country)
// — NEVER profiles_private, NEVER a `*` select. No PII can reach a listing page; the
// table split + RLS make profiles_private unreadable anyway, but the read surface
// also never asks for it.
import { createClient } from "@/lib/supabase/server";
import { listingPhotoPublicUrl } from "@/lib/listings/storage";

export type ListingPhoto = {
  path: string;
  url: string;
  sortOrder: number;
};

export type ListingFitment = {
  makeName: string;
  modelName: string;
  configName: string | null; // null = model-level fit
};

export type ListingDetail = {
  id: number;
  title: string;
  partNumber: string | null;
  askingPrice: number;
  conditionName: string;
  shippingOption: string;
  damageNotes: string | null;
  isBarnyard: boolean;
  status: string;
  dateListed: string;
  seller: {
    username: string;
    stateProvince: string | null;
    country: string | null;
  };
  photos: ListingPhoto[];
  fitment: ListingFitment[];
};

// Shape of the embedded row Supabase returns from the select below. To-one embeds
// (conditions, profiles_public, models, makes, configurations) come back as a single
// object or null; to-many (listing_photos, listing_fitment) as arrays.
type ListingDetailRow = {
  id: number;
  title: string;
  part_number: string | null;
  asking_price: number;
  shipping_option: string;
  damage_notes: string | null;
  is_barnyard: boolean;
  status: string;
  date_listed: string;
  seller_id: string;
  conditions: { name: string } | null;
  listing_photos: { storage_path: string; sort_order: number }[] | null;
  listing_fitment:
    | {
        model_id: number;
        config_id: number | null;
        models: {
          name: string;
          makes: { name: string } | null;
        } | null;
        configurations: { name: string } | null;
      }[]
    | null;
};

/**
 * Public listing detail (the listing page read). Joins ONLY public columns:
 * conditions.name, profiles_public (enumerated, no PII), ordered listing_photos,
 * and listing_fitment with fitment NAMES. Photo paths are resolved to public URLs.
 * Returns null when the id is not found.
 */
export async function getListing(id: number): Promise<ListingDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, title, part_number, asking_price, shipping_option, damage_notes, is_barnyard, status, date_listed, seller_id, " +
        "conditions:condition_id ( name ), " +
        "listing_photos ( storage_path, sort_order ), " +
        "listing_fitment ( model_id, config_id, models:model_id ( name, makes:make_id ( name ) ), configurations:config_id ( name ) )",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as ListingDetailRow;

  // seller_id references auth.users (NOT profiles_public), so PostgREST can't embed
  // the seller in the query above — resolve it with a separate enumerated read of
  // profiles_public (public columns only, never PII; Pitfall 7). Mirrors /u/[username].
  const { data: sellerRow } = await supabase
    .from("profiles_public")
    .select("username, state_province, country")
    .eq("id", row.seller_id)
    .maybeSingle();
  const seller = sellerRow as {
    username: string;
    state_province: string | null;
    country: string | null;
  } | null;

  const photos: ListingPhoto[] = (row.listing_photos ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({
      path: p.storage_path,
      url: listingPhotoPublicUrl(supabase, p.storage_path),
      sortOrder: p.sort_order,
    }));

  const fitment: ListingFitment[] = (row.listing_fitment ?? []).map((f) => ({
    makeName: f.models?.makes?.name ?? "",
    modelName: f.models?.name ?? "",
    configName: f.configurations?.name ?? null,
  }));

  return {
    id: row.id,
    title: row.title,
    partNumber: row.part_number,
    askingPrice: row.asking_price,
    conditionName: row.conditions?.name ?? "",
    shippingOption: row.shipping_option,
    damageNotes: row.damage_notes,
    isBarnyard: row.is_barnyard,
    status: row.status,
    dateListed: row.date_listed,
    seller: {
      username: seller?.username ?? "",
      stateProvince: seller?.state_province ?? null,
      country: seller?.country ?? null,
    },
    photos,
    fitment,
  };
}

export type MyListing = {
  id: number;
  title: string;
  status: string;
  coverUrl: string | null; // sort_order 0 photo, or null when no photos
};

/**
 * The seller's own listings, newest first — drives the "my listings" edit list.
 * listings is a PUBLIC-read table, so it is NOT auto-scoped by RLS; we filter
 * explicitly by the getClaims seller_id. Returns the cover photo (lowest
 * sort_order) per listing. Returns [] when unauthenticated or on error.
 */
export async function getMyListings(): Promise<MyListing[]> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("listings")
    .select("id, title, status, listing_photos ( storage_path, sort_order )")
    .eq("seller_id", userId)
    .order("date_listed", { ascending: false });

  if (error || !data) return [];

  type MyListingRow = {
    id: number;
    title: string;
    status: string;
    listing_photos: { storage_path: string; sort_order: number }[] | null;
  };

  return (data as unknown as MyListingRow[]).map((r) => {
    const cover = (r.listing_photos ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)[0];
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      coverUrl: cover
        ? listingPhotoPublicUrl(supabase, cover.storage_path)
        : null,
    };
  });
}
