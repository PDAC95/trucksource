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
import { isExpiringSoon } from "@/lib/listings/lifecycle";

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

// Phase-6 confirmed dimensions (FINT-03). Public reference rows only — names
// resolved from part_categories / search_terms, never any profiles_* table.
export type ListingCategory = { id: number; name: string };
export type ListingSearchTerm = { id: number; term: string };

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
  expiresAt: string | null; // 90-day clock (LIST-09); null = never set / sold
  seller: {
    username: string;
    stateProvince: string | null;
    country: string | null;
  };
  photos: ListingPhoto[];
  fitment: ListingFitment[];
  categories: ListingCategory[]; // confirmed part-categories (FINT-03)
  searchTerms: ListingSearchTerm[]; // confirmed slang search-terms (FINT-03)
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
  expires_at: string | null;
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
  listing_categories:
    | {
        category_id: number;
        part_categories: { name: string } | null;
      }[]
    | null;
  listing_search_terms:
    | {
        term_id: number;
        search_terms: { term: string } | null;
      }[]
    | null;
};

/**
 * Public listing detail (the listing page read). Joins ONLY public columns:
 * conditions.name, profiles_public (enumerated, no PII), ordered listing_photos,
 * and listing_fitment with fitment NAMES. Photo paths are resolved to public URLs.
 * Returns null when the id is not found.
 *
 * STATUS-AGNOSTIC BY DESIGN (LIST-09): getListing returns a row of ANY status
 * (active/sold/expired) because the owner edit/detail path legitimately needs to
 * read its own non-active listing. The BUYER-facing exclusion of expired/sold rows
 * is the caller's job (the public page notFound()s non-active) — RLS makes listings
 * public-read on ALL rows (Pitfall 5: status filtering is the app's job, not RLS's).
 */
export async function getListing(id: number): Promise<ListingDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, title, part_number, asking_price, shipping_option, damage_notes, is_barnyard, status, date_listed, expires_at, seller_id, " +
        "conditions:condition_id ( name ), " +
        "listing_photos ( storage_path, sort_order ), " +
        "listing_fitment ( model_id, config_id, models:model_id ( name, makes:make_id ( name ) ), configurations:config_id ( name ) ), " +
        "listing_categories ( category_id, part_categories:category_id ( name ) ), " +
        "listing_search_terms ( term_id, search_terms:term_id ( term ) )",
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

  // FINT-03 confirmed dimensions — names resolved from PUBLIC reference tables only
  // (part_categories / search_terms; no profiles_* touched, Pitfall 7). Drop any row
  // whose joined name is null (same null-tolerance as the fitment mapping above).
  const categories: ListingCategory[] = (row.listing_categories ?? [])
    .filter((c) => c.part_categories?.name)
    .map((c) => ({ id: c.category_id, name: c.part_categories!.name }));

  const searchTerms: ListingSearchTerm[] = (row.listing_search_terms ?? [])
    .filter((t) => t.search_terms?.term)
    .map((t) => ({ id: t.term_id, term: t.search_terms!.term }));

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
    expiresAt: row.expires_at,
    seller: {
      username: seller?.username ?? "",
      stateProvince: seller?.state_province ?? null,
      country: seller?.country ?? null,
    },
    photos,
    fitment,
    categories,
    searchTerms,
  };
}

export type MyListing = {
  id: number;
  title: string;
  status: string;
  coverUrl: string | null; // sort_order 0 photo, or null when no photos
  expiresAt: string | null; // 90-day clock (LIST-09); null = never set / sold
  expiringSoon: boolean; // active && within ~7 days of expiry (derived)
  saveCount: number; // how MANY buyers saved it — COUNT only, never WHO (SOCL-02)
  newCommentCount: number; // others' comments newer than the seen watermark (SOCL-01)
};

/**
 * The seller's own listings, newest first — drives the "my listings" edit list.
 * listings is a PUBLIC-read table, so it is NOT auto-scoped by RLS; we filter
 * explicitly by the getClaims seller_id. Returns the cover photo (lowest
 * sort_order) per listing. Returns [] when unauthenticated or on error.
 *
 * LIFECYCLE (LIST-09): keeps ALL statuses (active/sold/expired) — unlike the buyer
 * reads, the seller MUST see expired rows to reactivate them. Each row carries
 * expires_at + a derived expiringSoon (isExpiringSoon) so the UI can show the
 * "Expires in X days" hint + Renew only when near expiry, and a discreet counter.
 *
 * SOCIAL COUNTS (Phase 8): exactly TWO extra batched queries, no N+1:
 *   - saveCount via the my_listing_save_counts() RPC — a seller-scoped SECURITY
 *     DEFINER aggregate that returns COUNTS only; the owner-only RLS on
 *     saved_listings keeps WHO-saved structurally unreadable here.
 *   - newCommentCount: one listing_comments read (public-read table) over the
 *     owned ids, bucketed in JS against the per-listing comments_seen_at
 *     watermark (null watermark = every comment is new). The seller's OWN
 *     comments are excluded — self-replies must not badge.
 */
export async function getMyListings(): Promise<MyListing[]> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, title, status, expires_at, comments_seen_at, listing_photos ( storage_path, sort_order )",
    )
    .eq("seller_id", userId)
    .order("date_listed", { ascending: false });

  if (error || !data) return [];

  type MyListingRow = {
    id: number;
    title: string;
    status: string;
    expires_at: string | null;
    comments_seen_at: string | null;
    listing_photos: { storage_path: string; sort_order: number }[] | null;
  };
  const rows = data as unknown as MyListingRow[];
  const ids = rows.map((r) => r.id);

  // Save counts — ONE RPC call, seller-scoped inside the function (count only).
  const saveCountByListing = new Map<number, number>();
  if (ids.length > 0) {
    const { data: saveData } = await supabase.rpc("my_listing_save_counts");
    for (const s of (saveData ?? []) as {
      listing_id: number;
      save_count: number | string;
    }[]) {
      saveCountByListing.set(s.listing_id, Number(s.save_count));
    }
  }

  // New-comment counts — ONE batched read of others' comments on the owned ids,
  // bucketed per listing against its comments_seen_at watermark (null = all new).
  // v1 volumes are tiny; counting in JS keeps this a single round trip.
  const newCommentsByListing = new Map<number, number>();
  if (ids.length > 0) {
    const seenAtByListing = new Map(
      rows.map((r) => [r.id, r.comments_seen_at]),
    );
    const { data: commentData } = await supabase
      .from("listing_comments")
      .select("listing_id, created_at")
      .in("listing_id", ids)
      .neq("author_id", userId); // exclude the seller's own comments
    for (const c of (commentData ?? []) as {
      listing_id: number;
      created_at: string;
    }[]) {
      const seenAt = seenAtByListing.get(c.listing_id) ?? null;
      if (
        seenAt === null ||
        new Date(c.created_at).getTime() > new Date(seenAt).getTime()
      ) {
        newCommentsByListing.set(
          c.listing_id,
          (newCommentsByListing.get(c.listing_id) ?? 0) + 1,
        );
      }
    }
  }

  return rows.map((r) => {
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
      expiresAt: r.expires_at,
      expiringSoon: isExpiringSoon(r.status, r.expires_at),
      saveCount: saveCountByListing.get(r.id) ?? 0,
      newCommentCount: newCommentsByListing.get(r.id) ?? 0,
    };
  });
}
