import Link from "next/link";

import { MapPin } from "lucide-react";
import { SaveButton } from "@/components/search/save-button";
import { CardPhotoGallery } from "@/components/search/card-photo-gallery";
import type { SearchCard } from "@/lib/search/queries";

// LOCKED card content: cover photo, title + price (or "Ask for price" when
// price null), condition badge + State/Province, a Make+Model fitment chip, and a
// clickable username → /u/[username]. The card links to the EXISTING plural
// /listings/[id] detail route. PII-free by construction — SearchCard carries only
// public fields (display_name/username already resolved in lib/search/queries).
//
// Aesthetic (v1.1 "neon catalog"): image-forward. The cover photo fills the card
// top as a SWIPEABLE gallery. Top-left stacks the fitment part-plate + the
// condition stamp; bottom-left is the price tag; bottom-right (from the gallery)
// is the photo-count indicator. Title + seller/location ride a quiet rail below.
// Hover lifts the panel and lights a cyan glow.
//
// ADDITIVE props (both optional): saveState → heart overlay; statusBadge → a
// lifecycle stamp ("Sold"/"Expired") for the /saved grid.

function formatPrice(price: number | null): string {
  if (price === null) return "Ask for price";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

export function ListingCard({
  card,
  saveState,
  statusBadge,
}: {
  card: SearchCard;
  saveState?: { initiallySaved: boolean; isAuthenticated: boolean };
  statusBadge?: string;
}) {
  const hasPrice = card.price !== null;
  const href = `/listings/${card.id}`;

  return (
    <div className="group/card relative flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-white/10 transition-all duration-300 hover:-translate-y-1 hover:ring-neon-cyan/45 hover:shadow-[0_22px_50px_-20px_oklch(0.78_0.13_195/0.6)]">
      {saveState && (
        <div className="absolute top-3 right-3 z-30">
          <SaveButton
            listingId={card.id}
            initiallySaved={saveState.initiallySaved}
            isAuthenticated={saveState.isAuthenticated}
            size="sm"
          />
        </div>
      )}

      {/* Photo area: swipeable gallery + static overlays (overlays are
          pointer-events-none so a tap falls through to the slide link). */}
      <div className="relative aspect-5/4 w-full overflow-hidden">
        <CardPhotoGallery
          photos={card.photoUrls}
          alt={card.title}
          href={href}
        />

        {statusBadge && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/65 backdrop-blur-[1px]">
            <span className="rounded-md border border-foreground/40 bg-background/80 px-3 py-1 font-mono text-xs font-semibold tracking-[0.15em] uppercase">
              {statusBadge}
            </span>
          </div>
        )}

        {/* legibility scrim for the plates/price */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-black/20" />

        {/* top-left stack: fitment part-plate, then condition stamp beneath it */}
        <div className="pointer-events-none absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-1.5">
          {card.fitmentChip && (
            <span className="max-w-full truncate rounded-md bg-black/65 px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.12em] text-neon-cyan uppercase ring-1 ring-neon-cyan/30 backdrop-blur-sm">
              {card.fitmentChip}
            </span>
          )}
          {card.conditionName && (
            <span className="rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-neon-cyan uppercase ring-1 ring-neon-cyan/35 backdrop-blur-sm">
              {card.conditionName}
            </span>
          )}
        </div>

        {/* bottom-left: price tag */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-10">
          <span
            className={
              hasPrice
                ? "rounded-lg bg-black/65 px-2.5 py-1 font-heading text-2xl leading-none font-bold tracking-tight text-foreground tabular-nums ring-1 ring-white/15 backdrop-blur-sm"
                : "rounded-lg bg-black/65 px-2.5 py-1.5 text-sm text-foreground/90 italic ring-1 ring-white/15 backdrop-blur-sm"
            }
          >
            {formatPrice(card.price)}
          </span>
        </div>
      </div>

      <Link
        href={href}
        className="p-3.5 outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/50"
      >
        <h3 className="line-clamp-2 text-sm leading-snug font-medium text-foreground/90">
          {card.title}
        </h3>
      </Link>

      {(card.sellerUsername || card.stateProvince) && (
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.08] px-3.5 py-2.5 text-xs text-muted-foreground">
          {card.sellerUsername ? (
            <Link
              href={`/u/${card.sellerUsername}`}
              className="truncate font-medium outline-none transition-colors hover:text-neon-cyan hover:underline focus-visible:ring-2 focus-visible:ring-neon-cyan/50"
            >
              {card.sellerName || card.sellerUsername}
            </Link>
          ) : (
            <span />
          )}
          {card.stateProvince && (
            <span className="inline-flex shrink-0 items-center gap-1">
              <MapPin className="size-3" />
              {card.stateProvince}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
