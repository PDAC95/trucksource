import { NextResponse } from "next/server";

import { parseSearchParams } from "@/lib/search/params";
import { searchListings } from "@/lib/search/queries";

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

  return NextResponse.json({ cards, total, page: query.page });
}
