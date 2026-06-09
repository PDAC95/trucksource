import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Pencil } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getMyListings } from "@/lib/listings/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { RenewButton } from "@/components/listings/renew-button";
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
                  <Badge
                    variant={
                      listing.status === "active"
                        ? "default"
                        : isExpired
                          ? "destructive"
                          : "secondary"
                    }
                    className="mt-1 capitalize"
                  >
                    {listing.status}
                  </Badge>
                </div>

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
