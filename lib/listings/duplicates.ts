"use server";

import { createClient } from "@/lib/supabase/server";

// Same-seller duplicate-title probe (LIST-10). This is a PURELY ADVISORY Server
// Action the create form calls on publish-attempt — it is NOT part of
// `createListing` and can NEVER block a publish. A failure (unauth, RPC error)
// degrades to "no warning" (returns []), so the worst case is the seller simply
// publishes with no reminder. The seller may legitimately keep multiple similar
// parts, so the warning reminds, never accuses, and the form always offers
// "Publish anyway".
//
// Match definition (enforced server-side by the RPC): same seller_id +
// fuzzy-similar title via pg_trgm. find_similar_own_listings is SECURITY INVOKER
// and owner-scoped (where seller_id = auth.uid() and status <> 'sold'), so the
// caller only ever sees their OWN non-sold listings. The query is backed by the
// gin (title gin_trgm_ops) index from migration 0010 (no seq scan — Pitfall 4,
// CLAUDE.md invariant #7: trigram, never LIKE '%x%').

// Trigram similarity cutoff, tuned for PRECISION to avoid false-positive fatigue
// (research Open Q2). It is passed to the RPC as a parameter, so retuning needs
// NO migration. NOTE (human-verify gate): validate against the real launch
// dataset — reordered-word variants ("Hood Peterbilt 379" vs "Peterbilt 379
// Hood") score lower on raw trigram similarity; if 0.6 misses them, consider
// word_similarity().
const DUPLICATE_SIMILARITY_THRESHOLD = 0.6;

export type SimilarListing = { id: number; title: string };

/**
 * Probe the caller's own non-sold listings for a fuzzy-similar title (LIST-10).
 * Advisory only — returns the matches the UI links to, and NEVER blocks publish:
 *   - unauthenticated  -> [] (no RPC call)
 *   - RPC error        -> [] (degrades to "no warning", never throws)
 *   - matches found    -> [{ id, title }] (sim dropped from the UI payload)
 * This action does NOT import or call createListing; the "Publish anyway" path in
 * the form calls createListing independently (gate e: probe never blocks publish).
 */
export async function findSimilarOwnListings(
  title: string,
): Promise<SimilarListing[]> {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  // Advisory only: an unauthenticated probe yields no warning (it must never
  // throw or block the form). The owner-scoped RPC would return nothing anyway.
  if (!userId) return [];

  const { data, error } = await supabase.rpc("find_similar_own_listings", {
    p_title: title,
    p_threshold: DUPLICATE_SIMILARITY_THRESHOLD,
  });

  // Degrade silently: a probe failure must NEVER block publish.
  if (error || !data) return [];

  return (data as { id: number; title: string; sim: number }[]).map((row) => ({
    id: row.id,
    title: row.title,
  }));
}
