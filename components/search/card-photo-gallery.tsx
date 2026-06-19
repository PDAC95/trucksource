"use client";

import * as React from "react";
import Link from "next/link";
import { ImageIcon, Images } from "lucide-react";

// Swipeable photo strip for a listing card. A scroll-snap rail (native touch
// swipe / trackpad) where each slide links to the listing detail; a tap navigates,
// a horizontal drag scrolls. A bottom-right pill shows current/total and updates
// as you swipe. With one photo it's a plain image; with none, a placeholder.
export function CardPhotoGallery({
  photos,
  alt,
  href,
}: {
  photos: string[];
  alt: string;
  href: string;
}) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = React.useState(0);
  const count = photos.length;

  function onScroll() {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((prev) => (prev === i ? prev : i));
  }

  if (count === 0) {
    return (
      <Link
        href={href}
        className="flex h-full w-full items-center justify-center bg-white/[0.02] text-muted-foreground"
        aria-label={alt}
      >
        <ImageIcon className="size-10" />
      </Link>
    );
  }

  return (
    <>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((src, i) => (
          <Link
            key={i}
            href={href}
            tabIndex={i === 0 ? 0 : -1}
            className="relative h-full w-full shrink-0 snap-center outline-none"
            aria-label={alt}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={i === 0 ? alt : ""}
              className="h-full w-full object-cover"
              loading="lazy"
              draggable={false}
            />
          </Link>
        ))}
      </div>

      {count > 1 && (
        <div className="pointer-events-none absolute right-3 bottom-3 z-10 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-medium text-foreground ring-1 ring-white/15 backdrop-blur-sm">
          <Images className="size-3" />
          {index + 1}/{count}
        </div>
      )}
    </>
  );
}
