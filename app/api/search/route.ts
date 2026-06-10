import { NextResponse } from "next/server";

import { parseSearchParams } from "@/lib/search/params";
import { searchListings } from "@/lib/search/queries";
import { getSavedIds } from "@/lib/saves/queries";

// Paginated search read for the client-side infinite-scroll appender. The feed grid
// fetches `?<same params>&page=N` to append the next page WITHOUT a full navigation
// (the URL's page param stays put so back/forward + scroll restoration behave). This
// is a READ-ONLY mirror of the page's searchListings call — it does NOT log a
// search_event (the page already logged it on the criteria-bearing render; appending
// further pages of the same query must not double-count).
//
// PII-free by construction: searchListings returns only SearchCard public fields.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sp: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) sp[key] = value;

  const query = parseSearchParams(sp);
  const { cards, total } = await searchListings(query);

  // SOCL-02: per-page saved state for the infinite-scroll hearts. The route runs
  // with the request cookies → owner RLS, so getSavedIds returns only the CALLER's
  // saves (and a cheap empty Set for anon). Arrays for JSON serialization.
  const savedIds = Array.from(await getSavedIds(cards.map((c) => c.id)));

  return NextResponse.json({ cards, total, page: query.page, savedIds });
}
