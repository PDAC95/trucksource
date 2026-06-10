import Image from "next/image";
import Link from "next/link";

import type { ListingDetail } from "@/lib/listings/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RenewButton } from "@/components/listings/renew-button";
import { SoldToggle } from "@/components/listings/sold-toggle";
import { SaveButton } from "@/components/search/save-button";

// Buyer-facing listing view. Server Component — it renders ONLY a ListingDetail,
// which getListing already restricts to public columns + profiles_public (no PII,
// Pitfall 7). The seller is shown by PUBLIC identity only: username (link to the
// public profile), state/province, country. No private contact details (real
// name, telephone, email, street address) reach this component because they never
// reach ListingDetail.
//
// Contact: a placeholder "Contact seller" affordance only — the real contact flow
// is Phase 9 (contact persists before chat opens). Wiring it is out of scope here.

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function shippingLabel(option: string): string {
  switch (option) {
    case "shipping_available":
      return "Shipping available";
    case "local_pickup":
      return "Local pickup only";
    case "shipping_assistance":
      return "Shipping assistance requested";
    default:
      return option;
  }
}

function fitmentLabel(f: ListingDetail["fitment"][number]): string {
  return [f.makeName, f.modelName, f.configName].filter(Boolean).join(" ");
}

export function ListingDetail({
  listing,
  isOwner = false,
  isSold = false,
  saved = false,
  isAuthenticated = false,
}: {
  listing: ListingDetail;
  isOwner?: boolean;
  isSold?: boolean;
  saved?: boolean;
  isAuthenticated?: boolean;
}) {
  const cover = listing.photos[0];
  const rest = listing.photos.slice(1);
  const sellerLocation = [listing.seller.stateProvince, listing.seller.country]
    .filter(Boolean)
    .join(", ");

  return (
    <article className="grid gap-8 lg:grid-cols-2">
      {/* PHOTO GALLERY — cover first (sort_order 0), then the rest. */}
      <div className="grid gap-3">
        {cover ? (
          <div className="bg-muted relative aspect-square overflow-hidden rounded-lg">
            <Image
              src={cover.url}
              alt={listing.title}
              fill
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
            {/* SOLD overlay (LIST-06): the state must be unmissable on the
                gallery itself — a subtle tint + a centered Vendido tag. The
                photos stay visible underneath (historical context). */}
            {isSold && (
              <div className="bg-background/50 absolute inset-0 z-10 grid place-items-center">
                <span className="bg-destructive text-white rounded-md px-4 py-1.5 text-lg font-semibold shadow-md">
                  Vendido
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-muted text-muted-foreground grid aspect-square place-items-center rounded-lg text-sm">
            No photos
          </div>
        )}

        {rest.length > 0 && (
          <div className="grid grid-cols-4 gap-3">
            {rest.map((p) => (
              <div
                key={p.path}
                className="bg-muted relative aspect-square overflow-hidden rounded-md"
              >
                <Image
                  src={p.url}
                  alt={listing.title}
                  fill
                  sizes="(min-width: 1024px) 12vw, 25vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DETAILS */}
      <div className="grid content-start gap-5">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Prominent SOLD badge (LIST-06): sold listings render publicly
                with this label instead of 404ing (LOCKED). Price stays visible
                below — historical context for buyers landing on a shared link. */}
            {isSold && <Badge variant="destructive">Vendido</Badge>}
            <Badge variant="secondary">{listing.conditionName}</Badge>
            {listing.isBarnyard && <Badge>The Barnyard</Badge>}
            {!isSold && listing.status !== "active" && (
              <Badge variant="outline">{listing.status}</Badge>
            )}
          </div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {listing.title}
            </h1>
            {/* Save heart (SOCL-02) — non-owner viewers only. Saving a SOLD
                listing is allowed: saves don't break on sold (LOCKED). */}
            {!isOwner && (
              <SaveButton
                listingId={listing.id}
                initiallySaved={saved}
                isAuthenticated={isAuthenticated}
              />
            )}
          </div>
          <p className="text-3xl font-bold">
            {usdFormatter.format(listing.askingPrice)}
          </p>
        </div>

        {/* OWNER-ONLY lifecycle controls: Renew (LIST-09 — self-hides on a
            healthy active listing) + the reversible sold toggle (LIST-06 —
            self-hides on expired; reactivation belongs to RenewButton). The
            buyer view never renders either. */}
        {isOwner && (
          <div className="flex flex-wrap items-center gap-3">
            <RenewButton
              listingId={listing.id}
              status={listing.status}
              expiresAt={listing.expiresAt}
            />
            <SoldToggle listingId={listing.id} status={listing.status} />
          </div>
        )}

        <dl className="grid gap-3 text-sm">
          {listing.partNumber && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Part #</dt>
              <dd className="font-medium">{listing.partNumber}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd className="font-medium">
              {shippingLabel(listing.shippingOption)}
            </dd>
          </div>
        </dl>

        {/* FITMENT — the combos this part fits, as badges. */}
        {listing.fitment.length > 0 && (
          <div className="grid gap-2">
            <h2 className="text-muted-foreground text-sm font-medium">Fits</h2>
            <div className="flex flex-wrap gap-2">
              {listing.fitment.map((f, i) => (
                <Badge key={i} variant="outline">
                  {fitmentLabel(f)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* PART CATEGORIES (FINT-03) — confirmed taxonomy tags, as badges. Renders
            only when present so it stays invisible for category-less listings. */}
        {listing.categories.length > 0 && (
          <div className="grid gap-2">
            <h2 className="text-muted-foreground text-sm font-medium">
              Part categories
            </h2>
            <div className="flex flex-wrap gap-2">
              {listing.categories.map((c) => (
                <Badge key={c.id} variant="outline">
                  {c.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* SEARCH TERMS (FINT-03) — confirmed trucker-slang tags. Makes the accepted
            suggestions visible before Phase-7 search exists. */}
        {listing.searchTerms.length > 0 && (
          <div className="grid gap-2">
            <h2 className="text-muted-foreground text-sm font-medium">
              Also tagged
            </h2>
            <div className="flex flex-wrap gap-2">
              {listing.searchTerms.map((t) => (
                <Badge key={t.id} variant="outline">
                  {t.term}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* DAMAGE NOTES */}
        {listing.damageNotes && (
          <div className="grid gap-2">
            <h2 className="text-muted-foreground text-sm font-medium">
              Damage notes
            </h2>
            <p className="text-sm whitespace-pre-wrap">{listing.damageNotes}</p>
          </div>
        )}

        {/* SELLER — PUBLIC identity ONLY (no PII). */}
        <div className="grid gap-2 rounded-lg border p-4">
          <h2 className="text-muted-foreground text-sm font-medium">Seller</h2>
          <Link
            href={`/u/${listing.seller.username}`}
            className="font-medium hover:underline"
          >
            {listing.seller.username}
          </Link>
          {sellerLocation && (
            <p className="text-muted-foreground text-sm">{sellerLocation}</p>
          )}
          {/* Placeholder only — the contact→chat flow arrives in Phase 9. */}
          <Button className="mt-2 w-fit" disabled>
            Contact seller
          </Button>
        </div>
      </div>
    </article>
  );
}
