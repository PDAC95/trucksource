import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getListing } from "@/lib/listings/queries";
import { recordListingView } from "@/lib/actions/listing-view";
import { getListingComments } from "@/lib/comments/queries";
import { markCommentsSeen } from "@/lib/actions/comments";
import { getSavedIds } from "@/lib/saves/queries";
import { ListingDetail } from "@/components/listings/listing-detail";
import { CommentSection } from "@/components/comments/comment-section";
import { CommentComposer } from "@/components/comments/comment-composer";
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

  // STATUS GATE (LIST-06/LIST-09, Pitfall 1): SOLD listings stay publicly
  // visible — they render with the prominent "Vendido" treatment so shared
  // links and saved items never break (LOCKED decision). Everything else
  // non-active (expired, etc.) still 404s for buyers. getListing is
  // status-agnostic (the owner edit path needs any status); this app-layer
  // gate — not RLS — is where the buyer-facing exclusion lives.
  if (listing.status !== "active" && listing.status !== "sold") {
    notFound();
  }

  const isSold = listing.status === "sold";

  // Fire-and-forget the view event ONLY for ACTIVE listings: a sold listing's
  // views are not buyer-demand signal (Research Open Q1 — deliberate; revisit
  // if sold-page traffic ever becomes interesting). recordListingView swallows
  // its own errors, so this can never fail the page.
  if (listing.status === "active") {
    void recordListingView(listing.id);
  }

  // OWNER DETECTION: if the viewer is the seller, surface the owner-only
  // lifecycle controls (Renew + the sold toggle). Compare the getClaims sub
  // against the listing's seller_id via a tiny scoped read (getListing returns
  // only PUBLIC seller fields, no seller_id). Anon viewers have no claims →
  // isOwner stays false. getClaims, never the cookie-only session reader.
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub ?? null;
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

  // Social data — parallel reads, neither depends on the other: the comment
  // thread (anon-readable) + the viewer's saved state (owner-RLS; empty Set
  // for anon, so `saved` is simply false).
  const [threads, savedIds] = await Promise.all([
    getListingComments(listing.id),
    getSavedIds([listing.id]),
  ]);

  // Owner viewing their own thread resets the unread-comments watermark that
  // powers the /sell/listings badge. Fire-and-forget: a failure here must
  // never affect the page (the badge just stays until the next visit).
  if (isOwner && threads.length > 0) {
    void markCommentsSeen(listing.id);
  }

  const isAuthenticated = userId != null;
  // Comments close when the listing is not active (sold — LOCKED; the thread
  // itself stays visible, only posting stops).
  const commentsClosed = listing.status !== "active";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <ListingDetail
        listing={listing}
        isOwner={isOwner}
        isSold={isSold}
        saved={savedIds.has(listing.id)}
        isAuthenticated={isAuthenticated}
      />

      {/* COMMENTS (SOCL-01) — thread below the detail; composer only while the
          listing is active (the section renders the closed notice when sold). */}
      <div className="mt-10 grid max-w-2xl gap-4">
        <CommentSection
          listingId={listing.id}
          threads={threads}
          viewerId={userId}
          isSeller={isOwner}
          commentsClosed={commentsClosed}
        />
        {!commentsClosed && (
          <CommentComposer
            listingId={listing.id}
            isAuthenticated={isAuthenticated}
          />
        )}
      </div>

      {/* Toasts for EVERY viewer now (comment/save/sold-toggle feedback), not
          just owners. */}
      <Toaster />
    </main>
  );
}
