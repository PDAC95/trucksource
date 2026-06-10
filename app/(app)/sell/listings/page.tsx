import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Pencil, Heart, MessageSquare } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getMyListings } from "@/lib/listings/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { RenewButton } from "@/components/listings/renew-button";
import { SoldToggle } from "./sold-toggle";
import { cn } from "@/lib/utils";

// Owner-scoped "My Listings" index — never cache one seller's list for another
// (invariant 6). Mirrors profile/garage/page.tsx.
export const dynamic = "force-dynamic";

// The LIST-05 ENTRY POINT: a seller's own listings with an Edit link per row, so the
// edit form at /sell/[id]/edit is reachable (rather than hand-typing a URL). This is
// deliberately minimal — NOT a search/filter/feed surface (that's Phase 7). Just the
// seller's own rows (cover + title + status) via getMyListings (owner-scoped reader
// from 05-03), each linking to /sell/[id]/edit.
export default async function MyListingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }

  const listings = await getMyListings();

  // Discreet attention counter (CONTEXT): listings needing the seller's attention =
  // expiring-soon OR already-expired. Reuses the data each MyListing already carries.
  const attentionCount = listings.filter(
    (l) => l.expiringSoon || l.status === "expired",
  ).length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <div className="grid gap-1.5">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              My Listings
            </h1>
            {attentionCount > 0 && (
              <Badge variant="destructive" className="font-normal">
                {attentionCount} expiring
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            Your parts for sale. Edit any one of them.
          </p>
        </div>
        {listings.length > 0 && (
          <Button asChild>
            <Link href="/sell">
              <Plus className="size-4" />
              Create listing
            </Link>
          </Button>
        )}
      </div>

      {listings.length === 0 ? (
        <div className="mt-10 grid place-items-center gap-4 rounded-lg border border-dashed py-16 text-center">
          <div className="grid gap-1.5">
            <p className="font-medium">You have no listings yet</p>
            <p className="text-muted-foreground text-sm">
              Create your first listing to start selling.
            </p>
          </div>
          <Button asChild>
            <Link href="/sell">
              <Plus className="size-4" />
              Create listing
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-8 grid gap-3">
          {listings.map((listing) => {
            const isExpired = listing.status === "expired";
            return (
              <li
                key={listing.id}
                className={cn(
                  "flex items-center gap-4 rounded-lg border p-3",
                  isExpired && "opacity-60",
                )}
              >
                <div className="bg-muted size-16 shrink-0 overflow-hidden rounded-md">
                  {listing.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={listing.coverUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-muted-foreground grid h-full w-full place-items-center text-[10px]">
                      No photo
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{listing.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        listing.status === "active"
                          ? "default"
                          : isExpired
                            ? "destructive"
                            : "secondary"
                      }
                      className="capitalize"
                    >
                      {listing.status === "sold" ? "Vendido" : listing.status}
                    </Badge>

                    {/* SOCL-02 seller-facing count — how MANY buyers saved it,
                        never WHO. Quiet rows: shown only when > 0. */}
                    {listing.saveCount > 0 && (
                      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                        <Heart className="size-3" />
                        {listing.saveCount}{" "}
                        {listing.saveCount === 1 ? "guardado" : "guardados"}
                      </span>
                    )}

                    {/* SOCL-01 in-app indicator (LOCKED: not a notification
                        system). Links to the listing page, where viewing as
                        owner fires markCommentsSeen and clears the badge. */}
                    {listing.newCommentCount > 0 && (
                      <Link href={`/listings/${listing.id}`}>
                        <Badge className="gap-1">
                          <MessageSquare className="size-3" />
                          {listing.newCommentCount}{" "}
                          {listing.newCommentCount === 1
                            ? "comentario nuevo"
                            : "comentarios nuevos"}
                        </Badge>
                      </Link>
                    )}
                  </div>
                </div>

                {/* LIST-06: confirmed reversible sold/available toggle. Renders
                    nothing for expired rows — RenewButton owns that path. */}
                <SoldToggle listingId={listing.id} status={listing.status} />

                {/* Self-hides on healthy active rows; shows Renew (near-expiry) or
                    Reactivate (expired). */}
                <RenewButton
                  listingId={listing.id}
                  status={listing.status}
                  expiresAt={listing.expiresAt}
                />

                <Button asChild variant="outline" size="sm">
                  <Link href={`/sell/${listing.id}/edit`}>
                    <Pencil className="size-4" />
                    Edit
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Toaster />
    </div>
  );
}
