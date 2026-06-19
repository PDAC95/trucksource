// lib/saves/queries.ts — the saved-listings read surface (SOCL-02).
//
// Two readers, both server-side, both owner-scoped by RLS (saved_listings has
// owner-only select/insert/delete — migration 0015 — so the cookie-bound client
// only ever sees the caller's own saves; unauthenticated reads come back empty).
//
// HYDRATION RULE (LOCKED): getMySavedListings does NOT route through the
// Phase-7 search RPC — that RPC filters status='active' and would SILENTLY DROP
// sold/expired saves, violating the locked "saved items remain with a badge"
// decision. Instead it batch-hydrates the saved ids directly off the public-read
// `listings` table (ANY status) exactly like lib/search/queries.ts / the 07-04
// profile grid: one read per dimension, keyed by the saved ids — no N+1
// (Pitfall 5).
//
// PRIVACY (CLAUDE.md invariant #1, Pitfall 7): seller resolution goes through
// profiles_public with ENUMERATED columns ONLY (id, username, state_province,
// display_name) — NEVER profiles_private, NEVER `*`.
import { createClient } from "@/lib/supabase/server";
import { listingPhotoPublicUrl } from "@/lib/listings/storage";
import { resolvePublicName } from "@/lib/seller/badge";
import { getConditions } from "@/lib/listings/cascade";
import type { SearchCard } from "@/lib/search/queries";

// The saved-page card: the feed card shape + the lifecycle fields the saved page
// needs to badge sold/expired rows instead of dropping them.
export type SavedCard = SearchCard & {
  status: string; // EFFECTIVE status: "active" | "sold" | "expired" (derived)
  expiresAt: string | null;
  savedAt: string;
};

// The enumerated listings row the hydration reads (public columns only).
type SavedListingRow = {
  id: number;
  title: string;
  asking_price: number | string | null;
  condition_id: number;
  status: string;
  expires_at: string | null;
  date_listed: string;
  seller_id: string;
};

// Effective status for the saved-page badge: a row the cron hasn't flipped yet
// but whose clock has lapsed reads as expired (same derivation the buyer page
// uses); sold wins over expiry.
function effectiveStatus(status: string, expiresAt: string | null): string {
  if (status === "sold") return "sold";
  if (status === "expired") return "expired";
  if (
    status === "active" &&
    expiresAt !== null &&
    new Date(expiresAt).getTime() <= Date.now()
  )
    return "expired";
  return status;
}

/**
 * The caller's saved listings, hydrated into the feed-card shape, newest-saved
 * first. KEEPS sold/expired rows (with their effective status) — the saved page
 * badges them; it never silently drops a save. Returns [] when unauthenticated
 * or on error (owner RLS already scopes the read to the caller).
 */
export async function getMySavedListings(): Promise<SavedCard[]> {
  const supabase = await createClient();

  // 1) The caller's saves, newest first (owner RLS scopes; anon -> empty/error).
  const { data: savedData, error } = await supabase
    .from("saved_listings")
    .select("listing_id, created_at")
    .order("created_at", { ascending: false });

  if (error || !savedData || savedData.length === 0) return [];

  const saves = savedData as { listing_id: number; created_at: string }[];
  const ids = saves.map((s) => s.listing_id);
  const savedAtById = new Map(saves.map((s) => [s.listing_id, s.created_at]));

  // --- Batch hydration (NO N+1): one read per dimension, keyed by the ids. ---

  // 2) The listings themselves — DIRECT enumerated read, ANY status (sold AND
  //    expired rows included; see the hydration rule above). seller_id rides
  //    along for the seller resolution (public-read column, mirrors searchListings).
  const { data: listingData } = await supabase
    .from("listings")
    .select(
      "id, title, asking_price, condition_id, status, expires_at, date_listed, seller_id",
    )
    .in("id", ids);
  const listingById = new Map<number, SavedListingRow>();
  for (const l of (listingData ?? []) as SavedListingRow[]) {
    listingById.set(l.id, l);
  }

  // 3) Cover photo: lowest sort_order per listing.
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

  // 4) Fitment chip: the first fit's Make + Model per listing.
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

  // 5) Seller name + state via profiles_public — ENUMERATED columns, never PII.
  const sellerIds = new Set<string>();
  for (const l of listingById.values()) sellerIds.add(l.seller_id);
  const sellerById = new Map<
    string,
    {
      username: string;
      displayName: string | null;
      stateProvince: string | null;
    }
  >();
  if (sellerIds.size > 0) {
    const { data: sellerData } = await supabase
      .from("profiles_public")
      .select("id, username, state_province, display_name")
      .in("id", Array.from(sellerIds));
    for (const s of (sellerData ?? []) as {
      id: string;
      username: string;
      state_province: string | null;
      display_name: string | null;
    }[]) {
      sellerById.set(s.id, {
        username: s.username,
        displayName: s.display_name,
        stateProvince: s.state_province,
      });
    }
  }

  // 6) conditionName via the cheap cached reference reader.
  const conditions = await getConditions();
  const conditionNameById = new Map(conditions.map((c) => [c.id, c.name]));

  // Assemble in the SAVED order (newest-saved first), skipping only ids whose
  // listing row vanished entirely (hard-deleted; FK cascade removes the save).
  const cards: SavedCard[] = [];
  for (const id of ids) {
    const row = listingById.get(id);
    if (!row) continue;
    const seller = sellerById.get(row.seller_id);
    cards.push({
      id: row.id,
      title: row.title,
      price: row.asking_price === null ? null : Number(row.asking_price),
      conditionName: conditionNameById.get(row.condition_id) ?? "",
      stateProvince: seller?.stateProvince ?? null,
      coverPhotoUrl: coverByListing.get(row.id) ?? null,
      photoUrls: [coverByListing.get(row.id)].filter(Boolean) as string[],
      fitmentChip: chipByListing.get(row.id) ?? null,
      sellerName: seller
        ? resolvePublicName(seller.displayName, seller.username)
        : "",
      sellerUsername: seller?.username ?? "",
      status: effectiveStatus(row.status, row.expires_at),
      expiresAt: row.expires_at,
      savedAt: savedAtById.get(id) ?? row.date_listed,
    });
  }
  return cards;
}

/**
 * Which of the given listing ids has the caller saved? One owner-RLS read,
 * batched (`.in`), for painting initial heart state across a page of cards.
 * Empty Set when unauthenticated, on error, or when listingIds is empty.
 */
export async function getSavedIds(listingIds: number[]): Promise<Set<number>> {
  if (listingIds.length === 0) return new Set();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_listings")
    .select("listing_id")
    .in("listing_id", listingIds);

  if (error || !data) return new Set();
  return new Set((data as { listing_id: number }[]).map((r) => r.listing_id));
}
