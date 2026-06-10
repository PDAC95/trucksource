import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";

import type { SearchCard } from "@/lib/search/queries";
import { Badge } from "@/components/ui/badge";

// The seller's active-listings grid on /u/[username]. LOCKED: the profile is the
// listings grid — that's what the buyer came to see. Same responsive card shape as
// the feed (photo + fitment chip + price), NO facet panel (list + sort only).
//
// This mirrors the feed SearchCard shape (lib/search/queries.ts) so the visual is
// identical to the feed without taking a build-time dependency on the parallel
// 07-03 <ListingCard> (which is not yet committed). It renders ONLY public,
// PII-free fields already present on SearchCard — no extra reads.

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function priceLabel(price: number | null): string {
  return price === null || price === 0
    ? "Precio a consultar"
    : usdFormatter.format(price);
}

export function ProfileListingsGrid({ cards }: { cards: SearchCard[] }) {
  return (
    <ul
      aria-label="Listings activos"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {cards.map((card) => (
        <li key={card.id}>
          <Link
            href={`/listings/${card.id}`}
            className="group flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
              {card.coverPhotoUrl ? (
                <Image
                  src={card.coverPhotoUrl}
                  alt={card.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform group-hover:scale-[1.02]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageOff className="size-8" aria-hidden />
                </div>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-2 p-3">
              {card.fitmentChip && (
                <Badge variant="secondary" className="w-fit">
                  {card.fitmentChip}
                </Badge>
              )}
              <h3 className="line-clamp-2 text-sm font-medium leading-snug">
                {card.title}
              </h3>
              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <span className="text-base font-semibold">
                  {priceLabel(card.price)}
                </span>
                {card.conditionName && (
                  <span className="text-xs text-muted-foreground">
                    {card.conditionName}
                  </span>
                )}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
