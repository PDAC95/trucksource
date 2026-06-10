"use server";

import { createClient } from "@/lib/supabase/server";

// SRCH-05 instrumentation: the search-event stream (clone of recordListingView).
//
// A criteria-bearing search is non-reconstructible after the fact, so it is logged NOW
// (Phase 7) and consumed by Phase 10 analytics. Like the listing-view stream this is
// BEST-EFFORT: it must NEVER block or fail a search render. We swallow any error so a
// logging hiccup can't take down the feed/results page.
//
// PRIVACY: the only thing recorded is the raw + normalized (slang-expanded) term, the
// applied facets, the result count, and the searcher's auth id (or NULL for anon). NO
// IP, NO PII (Pitfall). search_events has exactly one INSERT policy and no select policy,
// so the raw stream is service-role-readable only (P10). getClaims, NEVER getSession.

/**
 * Record a single search event (best-effort). Capture list (SRCH-05): raw term +
 * normalized/expanded term + applied facets + result count + searcher (auth.uid or
 * null) + timestamp (created_at default). Errors are swallowed; the event row is the
 * record, never a blocker.
 */
export async function recordSearchEvent(input: {
  rawTerm: string | null;
  normalizedTerm: string | null; // expandSlang canonical term (or same as raw)
  facets: Record<string, number | null>;
  resultCount: number;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub ?? null; // NULL = anon searcher

    await supabase.from("search_events").insert({
      raw_term: input.rawTerm,
      normalized_term: input.normalizedTerm,
      facets: input.facets,
      result_count: input.resultCount,
      searcher_id: userId,
    });
  } catch {
    // Best-effort: never block render on a logging failure.
  }
}
