import { createClient } from "@/lib/supabase/server";
import {
  parseSearchParams,
  hasCriteria,
  type SearchQuery,
} from "@/lib/search/params";
import { searchListings, expandSlang } from "@/lib/search/queries";
import { recordSearchEvent } from "@/lib/search/events";
import { getSavedIds } from "@/lib/saves/queries";
import { getConditions, getRootCategories } from "@/lib/listings/cascade";
import { getModels, getConfigs } from "@/lib/garage/cascade";
import { listMyTrucks } from "@/lib/garage/queries";
import type { CascadeOption } from "@/lib/garage/cascade";

import { FacetSidebar } from "@/components/search/facet-sidebar";
import { BrowseToolbarMobile } from "@/components/search/browse-toolbar-mobile";
import { BrowseSortSearch } from "@/components/search/browse-sort-search";
import type { FitsState } from "@/components/search/fits-my-truck-control";
import {
  ActiveFilterChips,
  type ActiveChip,
} from "@/components/search/active-filter-chips";
import { SlangBanner } from "@/components/search/slang-banner";
import { FeedGrid } from "@/components/search/feed-grid";
import { EmptyResults } from "@/components/search/empty-results";
import { Toaster } from "@/components/ui/sonner";

// The anon-open marketplace feed/search at /browse — the differentiator's payoff.
// LOCKED: the feed and search are the SAME screen, fully open to anonymous visitors
// (no login gate). An empty SearchQuery IS the feed (newest-first); adding a
// keyword/facet turns it into results — same URL, same render path. The welcome
// landing at "/" routes here for "Browse all", brand picks, header search, and fits.
//
// force-dynamic so the per-request searchParams + the recordSearchEvent side-effect
// always run. A statically cached render would (a) freeze the feed and (b) silently
// undercount search events (Pitfall 4 — events are non-reconstructible).
export const dynamic = "force-dynamic";

export default async function FeedSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const query = parseSearchParams(sp);

  const { cards, total } = await searchListings(query);

  // Slang transparency: only when the query carries a keyword. expandSlang resolves the
  // canonical term for the "Showing results for …" banner (never silently swaps).
  // The `exact` escape hatch (from the banner) suppresses expansion entirely.
  const isExact = first(sp.exact) === "1";
  const slang = query.q && !isExact ? await expandSlang(query.q) : null;

  // SRCH-05: log every criteria-bearing search (best-effort, never blocks render).
  if (hasCriteria(query)) {
    void recordSearchEvent({
      rawTerm: query.q,
      normalizedTerm: slang?.canonicalTerm ?? query.q,
      facets: {
        makeId: query.makeId,
        modelId: query.modelId,
        configId: query.configId,
        categoryId: query.categoryId,
        conditionId: query.conditionId,
        fitsModelId: query.fitsModelId,
      },
      resultCount: total,
    });
  }

  // --- Facet option data for the sidebar + chip labels ---
  const supabase = await createClient();
  const { data: makesData } = await supabase
    .from("makes")
    .select("id, name")
    .order("name");
  const makes = (makesData ?? []) as CascadeOption[];
  const conditions = await getConditions();
  const rootCategories = await getRootCategories();

  // --- Fits-my-truck three-state resolution (getClaims, never getSession) ---
  const { data: claims } = await supabase.auth.getClaims();
  const isAuthenticated = !!claims?.claims;
  let fitsState: FitsState;
  if (!isAuthenticated) {
    fitsState = { variant: "anon" };
  } else {
    const myTrucks = await listMyTrucks();
    fitsState =
      myTrucks.length === 0
        ? { variant: "empty" }
        : { variant: "has", trucks: myTrucks };
  }
  // Saved trucks for the "Your truck" pills (filters panel + mobile toolbar).
  const trucks = fitsState.variant === "has" ? fitsState.trucks : [];

  // SOCL-02: initial heart state for the first page of cards — one batched
  // owner-RLS read; anon viewers skip it (hearts render the login invite). Passed
  // as an ARRAY (Sets don't serialize into client components).
  const savedIds = isAuthenticated
    ? Array.from(await getSavedIds(cards.map((c) => c.id)))
    : [];

  // --- Resolve active-filter chip labels (page has the names; chips own URL removal) ---
  const chips = await buildChips(query, supabase, {
    makes,
    conditions,
  });

  // Slang banner: show when the canonical term differs from what the user typed.
  const showSlangBanner =
    !!query.q &&
    !isExact &&
    !!slang?.canonicalTerm &&
    slang.canonicalTerm.toLowerCase() !== query.q.toLowerCase();

  return (
    <main className="parts-bg flex-1">
      <div className="w-full px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-col gap-4">
          {/* Desktop: Sort + search lupa (no always-on search bar) */}
          <BrowseSortSearch />
          {/* Mobile action rail: Filters · Add a truck · Sort · Search */}
          <BrowseToolbarMobile
            makes={makes}
            conditions={conditions}
            rootCategories={rootCategories}
            trucks={trucks}
            addHref={isAuthenticated ? "/profile/garage" : "/login"}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <div className="hidden flex-col gap-4 lg:flex">
            <FacetSidebar
              makes={makes}
              conditions={conditions}
              rootCategories={rootCategories}
              trucks={trucks}
            />
          </div>

          <div className="flex flex-col gap-4">
            {showSlangBanner && query.q && (
              <SlangBanner raw={query.q} canonical={slang?.canonicalTerm} />
            )}

            <ActiveFilterChips chips={chips} total={total} />

            {cards.length === 0 ? (
              <EmptyResults />
            ) : (
              <FeedGrid
                cards={cards}
                total={total}
                initialSavedIds={savedIds}
                isAuthenticated={isAuthenticated}
              />
            )}
          </div>
        </div>

        {/* SaveButton reports toggle failures via sonner — needs a mounted Toaster. */}
        <Toaster />
      </div>
    </main>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Resolve each active filter into a removable chip with a human label. The chip's
// `keys` list is what ActiveFilterChips deletes on removal (dependents included so the
// URL never lands in an impossible combination).
async function buildChips(
  query: SearchQuery,
  supabase: Awaited<ReturnType<typeof createClient>>,
  refs: {
    makes: CascadeOption[];
    conditions: { id: number; name: string }[];
  },
): Promise<ActiveChip[]> {
  const chips: ActiveChip[] = [];

  if (query.q) {
    chips.push({ keys: ["q", "exact"], label: `"${query.q}"` });
  }

  if (query.makeId !== null) {
    const name = refs.makes.find((m) => m.id === query.makeId)?.name ?? "Make";
    // Removing Make clears its dependent Model + Config.
    chips.push({ keys: ["make", "model", "config"], label: name });
  }

  if (query.modelId !== null && query.makeId !== null) {
    const models = await getModels(query.makeId);
    const name = models.find((m) => m.id === query.modelId)?.name ?? "Model";
    chips.push({ keys: ["model", "config"], label: name });
  }

  if (query.configId !== null && query.modelId !== null) {
    const configs = await getConfigs(query.modelId);
    const name =
      configs.find((c) => c.id === query.configId)?.name ?? "Configuration";
    chips.push({ keys: ["config"], label: name });
  }

  if (query.categoryId !== null) {
    // `category` is now the DEEPEST chosen node; label it with parent context so a
    // shared URL is unambiguous (Pitfall 6). Removing it clears ALL category levels.
    const label = await resolveCategoryLabel(supabase, query.categoryId);
    chips.push({
      keys: ["category", "root", "subcategory", "item"],
      label,
    });
  }

  if (query.conditionId !== null) {
    const name =
      refs.conditions.find((c) => c.id === query.conditionId)?.name ??
      "Condition";
    chips.push({ keys: ["condition"], label: name });
  }

  if (query.fitsModelId !== null) {
    chips.push({ keys: ["fits", "fitsConfig"], label: "Fits my truck" });
  }

  return chips;
}

// Resolve the deepest chosen category id into a context-bearing chip label. We walk
// UP the taxonomy from the chosen node, collecting its own name plus its immediate
// parent (and grandparent when present), and render the chain deepest-LAST with " › "
// separators — e.g. "Fuel Tanks › Driver Side Fuel Tanks". A leaf shows ≥2 levels so a
// shared URL is unambiguous (Pitfall 6); a root shows just its name. Best-effort: any
// read error degrades to the chosen node's name (or "Category").
async function resolveCategoryLabel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryId: number,
): Promise<string> {
  // Walk up to three levels (chosen → parent → grandparent) following parent_id.
  const chain: string[] = []; // collected deepest-first, reversed before joining
  let currentId: number | null = categoryId;
  for (let depth = 0; depth < 3 && currentId !== null; depth++) {
    const lookupId: number = currentId;
    const { data, error } = await supabase
      .from("part_categories")
      .select("name, parent_id")
      .eq("id", lookupId)
      .single<{ name: string; parent_id: number | null }>();
    if (error || !data) break;
    const row: { name: string; parent_id: number | null } = data;
    chain.push(row.name);
    currentId = row.parent_id;
  }

  if (chain.length === 0) return "Category";
  // chain is deepest-first; show parent(s) then the chosen node (deepest last).
  return chain.reverse().join(" › ");
}
