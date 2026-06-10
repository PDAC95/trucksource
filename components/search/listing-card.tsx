import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ImageIcon, MapPin } from "lucide-react";
import type { SearchCard } from "@/lib/search/queries";

// LOCKED card content: cover photo, title + price (or "Precio a consultar" when
// price null), condition badge + State/Province, a Make+Model fitment chip, and a
// clickable username → /u/[username]. The card body links to the EXISTING plural
// /listings/[id] detail route. PII-free by construction — SearchCard carries only
// public fields (display_name/username already resolved in lib/search/queries).
//
// Server component: no interactivity beyond links. The username link is a sibling
// of the body link (not nested) so the anchor nesting stays valid.

function formatPrice(price: number | null): string {
  if (price === null) return "Precio a consultar";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

export function ListingCard({ card }: { card: SearchCard }) {
  return (
    <Card className="group/card relative flex flex-col gap-0 overflow-hidden p-0 transition-shadow hover:shadow-md">
      <Link
        href={`/listings/${card.id}`}
        className="flex flex-col outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="relative aspect-4/3 w-full overflow-hidden bg-muted">
          {card.coverPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.coverPhotoUrl}
              alt={card.title}
              className="h-full w-full object-cover transition-transform group-hover/card:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-8" />
            </div>
          )}
          {card.fitmentChip && (
            <Badge
              variant="secondary"
              className="absolute top-2 left-2 max-w-[calc(100%-1rem)] truncate"
            >
              {card.fitmentChip}
            </Badge>
          )}
        </div>

        <div className="flex flex-col gap-1.5 p-3">
          <h3 className="line-clamp-2 text-sm font-medium">{card.title}</h3>
          <p className="text-base font-semibold">{formatPrice(card.price)}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {card.conditionName && (
              <Badge variant="outline">{card.conditionName}</Badge>
            )}
            {card.stateProvince && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {card.stateProvince}
              </span>
            )}
          </div>
        </div>
      </Link>

      {card.sellerUsername && (
        <div className="border-t px-3 py-2 text-xs">
          <Link
            href={`/u/${card.sellerUsername}`}
            className="font-medium text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {card.sellerName || card.sellerUsername}
          </Link>
        </div>
      )}
    </Card>
  );
}
