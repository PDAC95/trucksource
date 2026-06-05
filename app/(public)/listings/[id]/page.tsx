import { notFound } from "next/navigation";

import { getListing } from "@/lib/listings/queries";
import { recordListingView } from "@/lib/actions/listing-view";
import { ListingDetail } from "@/components/listings/listing-detail";

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

  // Fire-and-forget the view event AFTER the listing is found, BEFORE rendering.
  // recordListingView swallows its own errors, so this can never fail the page.
  // Because the page is force-dynamic, this runs on every request.
  void recordListingView(listing.id);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <ListingDetail listing={listing} />
    </main>
  );
}
