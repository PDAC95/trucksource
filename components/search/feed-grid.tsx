"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { ListingCard } from "@/components/search/listing-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SearchCard } from "@/lib/search/queries";

const PAGE_SIZE = 24;

// Responsive grid (2–4 cols by width) of result cards with IntersectionObserver
// infinite scroll. The FIRST page is rendered server-side (passed as `cards`); when
// the sentinel scrolls into view we fetch the NEXT page from /api/search using the
// CURRENT url params (so the grow is consistent with the active query) and append.
//
// We do NOT push page+1 into the URL — that would trigger a full RSC navigation and
// reset scroll. Appending client-side keeps scroll position; back/forward still works
// because the canonical query (q + facets) stays in the URL. `total` bounds the
// fetch loop so we stop once everything is loaded.

export function FeedGrid({
  cards: initialCards,
  total,
  initialSavedIds = [],
  isAuthenticated = false,
}: {
  cards: SearchCard[];
  total: number;
  // Saved state plumbing (08-05): the SERVER resolves which of the first page's
  // ids the viewer has saved (arrays, not Sets — Sets don't serialize across the
  // RSC boundary); each /api/search page response carries its own savedIds which
  // we merge so hearts stay correct across infinite scroll.
  initialSavedIds?: number[];
  isAuthenticated?: boolean;
}) {
  const searchParams = useSearchParams();
  // Reset to the server-provided first page whenever the query (searchParams) changes.
  const queryKey = searchParams.toString();
  // Track appended (page > 0) cards separately from the server-rendered first page.
  // Resetting on query change is done by KEYING this component on queryKey in the
  // parent render path is not available here, so we reset via a render-time guard:
  // when queryKey changes we drop appended state synchronously (no effect, no lint
  // set-state-in-effect violation).
  const [appended, setAppended] = React.useState<SearchCard[]>([]);
  const [appendedSavedIds, setAppendedSavedIds] = React.useState<number[]>([]);
  const [page, setPage] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [explicitDone, setExplicitDone] = React.useState(false);
  const [lastKey, setLastKey] = React.useState(queryKey);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  // Synchronous render-time reset when the active query changes (React-sanctioned
  // "adjusting state when a prop changes" pattern — set during render, not in an effect;
  // tracked via state, not a ref, so the lint refs rule stays happy).
  if (lastKey !== queryKey) {
    setLastKey(queryKey);
    setAppended([]);
    setAppendedSavedIds([]);
    setPage(0);
    setExplicitDone(false);
  }

  const cards = React.useMemo(
    () => [...initialCards, ...appended],
    [initialCards, appended],
  );
  // Derived Set (useMemo, never written during render — strict react-hooks gate).
  const savedSet = React.useMemo(
    () => new Set([...initialSavedIds, ...appendedSavedIds]),
    [initialSavedIds, appendedSavedIds],
  );
  const done = explicitDone || cards.length >= total;

  const loadMore = React.useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    try {
      const nextPage = page + 1;
      const params = new URLSearchParams(queryKey);
      params.set("page", String(nextPage));
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) {
        setExplicitDone(true);
        return;
      }
      const data = (await res.json()) as {
        cards: SearchCard[];
        savedIds?: number[];
      };
      setAppended((prev) => [...prev, ...data.cards]);
      const pageSavedIds = data.savedIds ?? [];
      if (pageSavedIds.length > 0) {
        setAppendedSavedIds((prev) => [...prev, ...pageSavedIds]);
      }
      setPage(nextPage);
      if (data.cards.length < PAGE_SIZE) setExplicitDone(true);
    } catch {
      setExplicitDone(true);
    } finally {
      setLoading(false);
    }
  }, [loading, done, page, queryKey]);

  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || done) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, done]);

  return (
    <div>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {cards.map((card) => (
          <li key={card.id}>
            <ListingCard
              card={card}
              saveState={{
                initiallySaved: savedSet.has(card.id),
                isAuthenticated,
              }}
            />
          </li>
        ))}
      </ul>

      {!done && (
        <div
          ref={sentinelRef}
          aria-hidden="true"
          className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
        >
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-4/3 w-full rounded-xl" />
            ))}
        </div>
      )}
    </div>
  );
}
