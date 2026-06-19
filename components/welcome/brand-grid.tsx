import Link from "next/link";
import Image from "next/image";

import { FEED_PATH } from "@/lib/search/params";
import { cn } from "@/lib/utils";

export type BrandItem = {
  id: number;
  name: string;
  // Resolved server-side: a /brands/<slug>.* path when a logo asset exists,
  // else null → the card falls back to the brand name rendered in neon text.
  logoSrc: string | null;
};

// The neon brand "signage" grid on the welcome landing. Each card is a lit box
// (alternating red/cyan, matching the brand's two neon families) that links to
// the feed pre-filtered to that make: /browse?make=<id>. Presentational — no
// client state; the cards are plain links.
export function BrandGrid({ brands }: { brands: BrandItem[] }) {
  if (brands.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      {brands.map((brand, i) => {
        const cyan = i % 2 === 1;
        return (
          <Link
            key={brand.id}
            href={`${FEED_PATH}?make=${brand.id}`}
            aria-label={`Browse ${brand.name} parts`}
            className={cn(
              "group flex h-24 items-center justify-center rounded-xl border-2 bg-black/40 px-4 transition-all duration-200 sm:h-28",
              cyan
                ? "border-neon-cyan/60 hover:border-neon-cyan hover:shadow-glow-cyan"
                : "border-neon-red/60 hover:border-neon-red hover:shadow-glow-red",
            )}
          >
            {brand.logoSrc ? (
              <Image
                src={brand.logoSrc}
                alt={brand.name}
                width={220}
                height={88}
                className="max-h-16 w-auto object-contain"
              />
            ) : (
              <span
                style={{ fontFamily: "var(--ff-godsown)" }}
                className={cn(
                  "text-center text-2xl tracking-wide uppercase transition-all sm:text-3xl",
                  cyan
                    ? "text-neon-cyan [text-shadow:var(--text-shadow-neon-cyan)]"
                    : "text-neon-red [text-shadow:var(--text-shadow-neon-red)]",
                )}
              >
                {brand.name}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
