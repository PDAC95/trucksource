"use server";

import { createClient } from "@/lib/supabase/server";

// Invariant #8 instrumentation: the listing-view event stream.
//
// A listing view is non-reconstructible after the fact, so it is logged NOW
// (Phase 5) and consumed by Phase 10 analytics. The event row is the durable
// record — like the abuse-alert pattern, this is BEST-EFFORT: it must NEVER block
// or fail the page render. We swallow any error so a logging hiccup can't take
// down a public listing page.
//
// PRIVACY: the only thing recorded is listing_id + the viewer's auth id (or NULL
// for an anon viewer). NO IP, NO PII (Pitfall) — listing_view_events has exactly
// one INSERT policy (anon + authenticated) and no select policy, so the raw stream
// is service-role-readable only.

/**
 * Record a single listing-view event (best-effort). The page is force-dynamic, so
 * this runs on EVERY view — that is what makes the count non-reconstructible-safe.
 * Errors are swallowed; the event row is the record, never a blocker.
 */
export async function recordListingView(listingId: number): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const viewerId = claims?.claims?.sub ?? null; // NULL = anon viewer

    await supabase
      .from("listing_view_events")
      .insert({ listing_id: listingId, viewer_id: viewerId });
  } catch {
    // Best-effort: never block the page render on a logging failure.
  }
}
