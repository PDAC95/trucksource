// lib/search/queries.ts — the search READ layer the feed UI + profile grid consume.
//
// Three readers, all server-side, all PII-safe by construction:
//   - searchListings(query): calls the search_listings RPC, then BATCH-hydrates each
//     result row into a SearchCard (cover photo + Make/Model fitment chip + public
//     seller name) — zero PII, no N+1.
//   - expandSlang(raw): resolves a slang/typo term via the match_search_term RPC
//     (public.similarity, NEVER the bare % operator) to a canonical term + taxonomy
//     target, powering the "Showing results for …" transparency banner.
//   - autocomplete(prefix): term suggestions via autocomplete_terms RPC + title
//     suggestions via search_listings. No bare % / LIKE / ILIKE.
//
// PRIVACY (CLAUDE.md invariant #1 + #7, Pitfall 1/7): the RPC returns NO seller id to
// stay PII-minimal; the seller name is resolved by reading `listings` (public) for the
// result ids → seller_id, then `profiles_public` with ENUMERATED columns ONLY
// (id, username, state_province, display_name) — NEVER profiles_private, NEVER `*`.
// No select('*'), no profiles(*) embed, no LIKE/ILIKE, no bare `term %` trigram filter
// anywhere in this file (the slang/autocomplete trgm path routes through the
// match_search_term / autocomplete_terms RPCs, which use public.similarity()).
import { createClient } from "@/lib/supabase/server";
import { listingPhotoPublicUrl } from "@/lib/listings/storage";
import { resolvePublicName } from "@/lib/seller/badge";
import { getConditions } from "@/lib/listings/cascade";
import type { SearchQuery } from "@/lib/search/params";

const PAGE_SIZE = 24;

export type SearchCard = {
  id: number;
  title: string;
  price: number | null;
  conditionName: string;
  stateProvince: string | null;
  coverPhotoUrl: string | null;
  fitmentChip: string | null; // "Make Model" of the first fit, or null
  sellerName: string; // coalesce(display_name, username) — PII-free
  sellerUsername: string;
};

// The public column shape search_listings returns (07-01). total_count is a
// count(*) over() window value — identical on every row.
type SearchListingRow = {
  id: number;
  title: string;
  asking_price: number | string | null;
  condition_id: number;
  date_listed: string;
  rank: number;
  total_count: number | string;
};

/**
 * The feed / results reader. Calls the search_listings RPC, then batch-hydrates each
 * row into a SearchCard. The `total` is read from rows[0].total_count — the single
 * deterministic strategy (one query, no re-call, no cards.length approximation) that
 * backs the LOCKED "X results" count.
 */
export async function searchListings(
  query: SearchQuery,
): Promise<{ cards: SearchCard[]; total: number }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("search_listings", {
    p_q: query.q,
    p_model_id: query.modelId,
    p_config_id: query.configId,
    p_category_id: query.categoryId,
    p_condition_id: query.conditionId,
    p_fits_model_id: query.fitsModelId,
    p_fits_config_id: query.fitsConfigId,
    p_limit: PAGE_SIZE,
    p_offset: query.page * PAGE_SIZE,
  });

  if (error || !data) return { cards: [], total: 0 };

  const rows = data as unknown as SearchListingRow[];
  if (rows.length === 0) return { cards: [], total: 0 };

  // The window grand total rides on every row — read it once (rows[0]). 07-01 guarantees
  // it is identical across the filtered set; this is the "X results" source of truth.
  const total = Number(rows[0].total_count ?? 0);

  const ids = rows.map((r) => r.id);

  // --- Batch hydration (NO N+1): one read per dimension, keyed by the result ids. ---

  // 1) Cover photo: lowest sort_order per listing.
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
    // Rows arrive sort_order-ascending; the first seen per listing is the cover.
    if (!coverByListing.has(p.listing_id)) {
      coverByListing.set(
        p.listing_id,
        listingPhotoPublicUrl(supabase, p.storage_path),
      );
    }
  }

  // 2) Fitment chip: the first fit's Make + Model per listing.
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

  // 3) Seller name + state. The RPC omits seller_id (PII-minimal), so resolve it via a
  //    separate enumerated read of `listings` (public-read), then through
  //    profiles_public with ENUMERATED columns (no PII, no `*`) — mirrors getListing.
  const { data: listingSellerData } = await supabase
    .from("listings")
    .select("id, seller_id")
    .in("id", ids);
  const sellerIdByListing = new Map<number, string>();
  const sellerIds = new Set<string>();
  for (const l of (listingSellerData ?? []) as {
    id: number;
    seller_id: string;
  }[]) {
    sellerIdByListing.set(l.id, l.seller_id);
    sellerIds.add(l.seller_id);
  }

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

  // 4) conditionName via the cheap cached reference reader.
  const conditions = await getConditions();
  const conditionNameById = new Map(conditions.map((c) => [c.id, c.name]));

  const cards: SearchCard[] = rows.map((r) => {
    const sellerId = sellerIdByListing.get(r.id);
    const seller = sellerId ? sellerById.get(sellerId) : undefined;
    return {
      id: r.id,
      title: r.title,
      price: r.asking_price === null ? null : Number(r.asking_price),
      conditionName: conditionNameById.get(r.condition_id) ?? "",
      stateProvince: seller?.stateProvince ?? null,
      coverPhotoUrl: coverByListing.get(r.id) ?? null,
      fitmentChip: chipByListing.get(r.id) ?? null,
      sellerName: seller
        ? resolvePublicName(seller.displayName, seller.username)
        : "",
      sellerUsername: seller?.username ?? "",
    };
  });

  return { cards, total };
}

export type SlangExpansion = {
  canonicalTerm: string | null;
  targets: { makeId?: number; modelId?: number; configId?: number } | null;
};

/**
 * Resolve a raw search term to its canonical slang term + taxonomy target, for the
 * transparency banner ("Showing results for … (you searched: …)"). Goes through the
 * match_search_term RPC (public.similarity, search_terms_term_trgm_idx-backed) — NEVER
 * the bare `%` operator (unresolvable under the RPC's search_path=''). Pure read, no
 * side effects; the UI decides whether to show the banner.
 */
export async function expandSlang(raw: string): Promise<SlangExpansion> {
  const trimmed = raw.trim();
  if (trimmed === "") return { canonicalTerm: null, targets: null };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("match_search_term", {
    p_raw: trimmed,
  });
  if (error || !data) return { canonicalTerm: null, targets: null };

  const matches = data as unknown as { id: number; term: string }[];
  if (matches.length === 0) return { canonicalTerm: null, targets: null };

  const match = matches[0];

  // Resolve the matched term's taxonomy target (exclusive arc: make | model | config).
  const { data: targetData } = await supabase
    .from("search_term_targets")
    .select("make_id, model_id, config_id")
    .eq("search_term_id", match.id)
    .limit(1)
    .maybeSingle();

  let targets: SlangExpansion["targets"] = null;
  if (targetData) {
    const t = targetData as {
      make_id: number | null;
      model_id: number | null;
      config_id: number | null;
    };
    if (t.make_id !== null) targets = { makeId: t.make_id };
    else if (t.model_id !== null) targets = { modelId: t.model_id };
    else if (t.config_id !== null) targets = { configId: t.config_id };
  }

  return { canonicalTerm: match.term, targets };
}

export type Autocomplete = { terms: string[]; titles: string[] };

/**
 * Autocomplete suggestions for the search box: slang/common terms (via the
 * autocomplete_terms RPC, public.similarity-based, trgm-index-backed) + listing-title
 * suggestions (via search_listings with the prefix as the keyword). Read-only, public,
 * no PII, no LIKE/ILIKE, no bare `%`. Debounce is the UI's job (~200ms).
 */
export async function autocomplete(prefix: string): Promise<Autocomplete> {
  const trimmed = prefix.trim();
  if (trimmed === "") return { terms: [], titles: [] };

  const supabase = await createClient();

  // Term suggestions — the trgm RPC (public.similarity, never bare %).
  const { data: termData } = await supabase.rpc("autocomplete_terms", {
    p_prefix: trimmed,
  });
  const terms = ((termData ?? []) as { term: string }[]).map((t) => t.term);

  // Title suggestions — a small FTS prefix match on active listings via the search RPC.
  const { data: titleData } = await supabase.rpc("search_listings", {
    p_q: trimmed,
    p_model_id: null,
    p_config_id: null,
    p_category_id: null,
    p_condition_id: null,
    p_fits_model_id: null,
    p_fits_config_id: null,
    p_limit: 6,
    p_offset: 0,
  });
  const titles = ((titleData ?? []) as { title: string }[]).map((r) => r.title);

  return { terms, titles };
}
