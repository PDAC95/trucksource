import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getListing } from "@/lib/listings/queries";
import { recordListingView } from "@/lib/actions/listing-view";
import { ListingDetail } from "@/components/listings/listing-detail";
import { Toaster } from "@/components/ui/sonner";

// force-dynamic so recordListingView runs on every view — invariant #8, the view
// event is non-reconstructible; mirrors the force-dynamic owner pages in this
// phase. A fire-and-forget call inside a STATICALLY CACHED RSC would not run on
// cached renders, so view events would silently undercount. Rendering per-request
// guarantees the per-view event always fires.
export const dynamic = "force-dynamic";

// Public buyer-facing listing detail page (the createListing publish redirect
// target). Anon-readable: listings is a public-read table. getListing reads ONLY
// public columns + profiles_public (enumerated) — it never touches the private
// profile table, so no PII can reach the RSC payload (Pitfall 7).
export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await getListing(Number(id));
  if (!listing) {
    notFound();
  }

  // STATUS GATE (LIST-09, Pitfall 5): expired AND sold listings are invisible to
  // buyers. getListing is status-agnostic (the owner edit path needs any status);
  // the public page is where the buyer-facing exclusion lives. RLS makes listings
  // public-read on ALL rows, so this app-layer filter — not RLS — hides dead
  // inventory. notFound() before logging so a view is only recorded for a visible
  // (active) listing.
  if (listing.status !== "active") {
    notFound();
  }

  // Fire-and-forget the view event AFTER the listing is found, BEFORE rendering.
  // recordListingView swallows its own errors, so this can never fail the page.
  // Because the page is force-dynamic, this runs on every request.
  void recordListingView(listing.id);

  // OWNER DETECTION (LIST-09): if the viewer is the seller, surface the owner-only
  // Renew control. Compare the getClaims sub against the listing's seller_id via a
  // tiny scoped read (getListing returns only PUBLIC seller fields, no seller_id).
  // Anon viewers have no claims → isOwner stays false. getClaims, never getSession.
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  let isOwner = false;
  if (userId) {
    const { data: ownRow } = await supabase
      .from("listings")
      .select("id")
      .eq("id", listing.id)
      .eq("seller_id", userId)
      .maybeSingle();
    isOwner = ownRow != null;
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <ListingDetail listing={listing} isOwner={isOwner} />
      {isOwner && <Toaster />}
    </main>
  );
}
