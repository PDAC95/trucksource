import { createClient } from "@/lib/supabase/server";
import {
  parseSearchParams,
  hasCriteria,
  type SearchQuery,
} from "@/lib/search/params";
import { searchListings, expandSlang } from "@/lib/search/queries";
import { recordSearchEvent } from "@/lib/search/events";
import { getConditions, getPartCategories } from "@/lib/listings/cascade";
import { getModels, getConfigs } from "@/lib/garage/cascade";
import { listMyTrucks } from "@/lib/garage/queries";
import type { CascadeOption } from "@/lib/garage/cascade";

import { SearchBar } from "@/components/search/search-bar";
import { FacetSidebar } from "@/components/search/facet-sidebar";
import {
  FitsMyTruckControl,
  type FitsState,
} from "@/components/search/fits-my-truck-control";
import {
  ActiveFilterChips,
  type ActiveChip,
} from "@/components/search/active-filter-chips";
import { SlangBanner } from "@/components/search/slang-banner";
import { FeedGrid } from "@/components/search/feed-grid";
import { EmptyResults } from "@/components/search/empty-results";

// The anon-open marketplace feed/search — the differentiator's payoff. LOCKED: the feed
// and search are the SAME screen, fully open to anonymous visitors (no login gate). An
// empty SearchQuery IS the feed (newest-first); adding a keyword/facet turns it into
// results — same URL, same render path.
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
  // canonical term for the "Mostrando resultados para …" banner (never silently swaps).
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
  const partCategories = await getPartCategories();

  // --- Fits-my-truck three-state resolution (getClaims, never getSession) ---
  const { data: claims } = await supabase.auth.getClaims();
  let fitsState: FitsState;
  if (!claims?.claims) {
    fitsState = { variant: "anon" };
  } else {
    const trucks = await listMyTrucks();
    fitsState =
      trucks.length === 0 ? { variant: "empty" } : { variant: "has", trucks };
  }

  // --- Resolve active-filter chip labels (page has the names; chips own URL removal) ---
  const chips = await buildChips(query, {
    makes,
    conditions,
    partCategories,
  });

  // Slang banner: show when the canonical term differs from what the user typed.
  const showSlangBanner =
    !!query.q &&
    !isExact &&
    !!slang?.canonicalTerm &&
    slang.canonicalTerm.toLowerCase() !== query.q.toLowerCase();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Encuentra tu parte
        </h1>
        <SearchBar />
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <div className="flex flex-col gap-4">
          <FitsMyTruckControl state={fitsState} />
          <FacetSidebar
            makes={makes}
            conditions={conditions}
            partCategories={partCategories}
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
            <FeedGrid cards={cards} total={total} />
          )}
        </div>
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
  refs: {
    makes: CascadeOption[];
    conditions: { id: number; name: string }[];
    partCategories: { id: number; name: string }[];
  },
): Promise<ActiveChip[]> {
  const chips: ActiveChip[] = [];

  if (query.q) {
    chips.push({ keys: ["q", "exact"], label: `"${query.q}"` });
  }

  if (query.makeId !== null) {
    const name = refs.makes.find((m) => m.id === query.makeId)?.name ?? "Marca";
    // Removing Make clears its dependent Model + Config.
    chips.push({ keys: ["make", "model", "config"], label: name });
  }

  if (query.modelId !== null && query.makeId !== null) {
    const models = await getModels(query.makeId);
    const name = models.find((m) => m.id === query.modelId)?.name ?? "Modelo";
    chips.push({ keys: ["model", "config"], label: name });
  }

  if (query.configId !== null && query.modelId !== null) {
    const configs = await getConfigs(query.modelId);
    const name =
      configs.find((c) => c.id === query.configId)?.name ?? "Configuración";
    chips.push({ keys: ["config"], label: name });
  }

  if (query.categoryId !== null) {
    const name =
      refs.partCategories.find((c) => c.id === query.categoryId)?.name ??
      "Categoría";
    chips.push({ keys: ["category"], label: name });
  }

  if (query.conditionId !== null) {
    const name =
      refs.conditions.find((c) => c.id === query.conditionId)?.name ??
      "Condición";
    chips.push({ keys: ["condition"], label: name });
  }

  if (query.fitsModelId !== null) {
    chips.push({ keys: ["fits", "fitsConfig"], label: "Fits my truck" });
  }

  return chips;
}
