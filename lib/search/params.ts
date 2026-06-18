// lib/search/params.ts — the URL ↔ SearchQuery contract.
//
// ALL SEARCH STATE LIVES IN THE URL (LOCKED decision): the feed, every facet, the
// fits-my-truck filter, the sort, and the page are encoded as query-string params so
// a search is shareable, back/forward-navigable, and SSR-renderable. This module is
// the SINGLE source of truth for that contract — `parseSearchParams` (URL → typed
// SearchQuery) and `serializeSearchQuery` (SearchQuery → URLSearchParams) are exact
// inverses, so `serializeSearchQuery(parseSearchParams(x))` round-trips losslessly.
//
// The param KEYS are the public contract the UI's router.push() uses — keep them
// stable: q, make, model, config, category, condition, fits, fitsConfig, sort, page.
// Pure, dependency-free, client+server safe (no "use server", no supabase import).
import { isValidYear } from "@/lib/listings/years";

// The feed/search/facets screen lives at /browse (the welcome landing owns "/").
// Centralized here so every router.push / Link that targets the feed stays in
// sync — change the route in ONE place.
export const FEED_PATH = "/browse";

export type SearchSort = "relevance" | "recent" | "price";

export type SearchQuery = {
  q: string | null;
  makeId: number | null;
  modelId: number | null;
  configId: number | null;
  categoryId: number | null;
  conditionId: number | null;
  year: number | null;
  fitsModelId: number | null;
  fitsConfigId: number | null;
  sort: SearchSort;
  page: number;
};

// The stable URL param keys (the contract the UI router.push consumes). Documented
// here so parse + serialize never drift apart.
const KEYS = {
  q: "q",
  make: "make",
  model: "model",
  config: "config",
  category: "category",
  condition: "condition",
  year: "year",
  fits: "fits",
  fitsConfig: "fitsConfig",
  sort: "sort",
  page: "page",
} as const;

const SORTS: readonly SearchSort[] = ["relevance", "recent", "price"] as const;

/** Read the first value of a Next.js searchParams entry (string | string[] | undefined). */
function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Coerce a raw param to a positive integer id, or null on missing/NaN/≤0. */
function toId(value: string | string[] | undefined): number | null {
  const raw = first(value);
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

/** Coerce a raw param to a valid model-year (1970..2027), or null otherwise. */
function toYear(value: string | string[] | undefined): number | null {
  const raw = first(value);
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return isValidYear(n) ? n : null;
}

/** Coerce a raw param to a non-empty trimmed string, or null. */
function toText(value: string | string[] | undefined): string | null {
  const raw = first(value);
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Parse Next.js searchParams into a typed SearchQuery.
 *
 * - Numeric facets coerce via Number() with NaN/≤0 → null guards (so a junk `?model=abc`
 *   degrades to "no model facet" rather than poisoning the RPC call).
 * - `sort` defaults to 'relevance' when a keyword `q` is present (rank ordering is
 *   meaningful), else 'recent' (the feed has no relevance signal). An explicit valid
 *   sort always wins.
 * - `page` defaults to 0 and clamps negatives/NaN to 0.
 */
export function parseSearchParams(
  sp: Record<string, string | string[] | undefined>,
): SearchQuery {
  const q = toText(sp[KEYS.q]);

  const rawSort = first(sp[KEYS.sort]);
  const sort: SearchSort = SORTS.includes(rawSort as SearchSort)
    ? (rawSort as SearchSort)
    : q
      ? "relevance"
      : "recent";

  const pageRaw = Number(first(sp[KEYS.page]));
  const page =
    Number.isFinite(pageRaw) && Number.isInteger(pageRaw) && pageRaw > 0
      ? pageRaw
      : 0;

  return {
    q,
    makeId: toId(sp[KEYS.make]),
    modelId: toId(sp[KEYS.model]),
    configId: toId(sp[KEYS.config]),
    categoryId: toId(sp[KEYS.category]),
    conditionId: toId(sp[KEYS.condition]),
    year: toYear(sp[KEYS.year]),
    fitsModelId: toId(sp[KEYS.fits]),
    fitsConfigId: toId(sp[KEYS.fitsConfig]),
    sort,
    page,
  };
}

/** The default sort for a query — 'relevance' when keyworded, else 'recent'. */
function defaultSort(query: Pick<SearchQuery, "q">): SearchSort {
  return query.q ? "relevance" : "recent";
}

/**
 * Serialize a SearchQuery back into URLSearchParams, the exact inverse of
 * parseSearchParams. Only NON-NULL / NON-DEFAULT keys are emitted so the URL stays
 * clean (an empty feed serializes to ""; the default sort and page 0 are omitted).
 */
export function serializeSearchQuery(query: SearchQuery): URLSearchParams {
  const params = new URLSearchParams();

  if (query.q) params.set(KEYS.q, query.q);
  if (query.makeId !== null) params.set(KEYS.make, String(query.makeId));
  if (query.modelId !== null) params.set(KEYS.model, String(query.modelId));
  if (query.configId !== null) params.set(KEYS.config, String(query.configId));
  if (query.categoryId !== null)
    params.set(KEYS.category, String(query.categoryId));
  if (query.conditionId !== null)
    params.set(KEYS.condition, String(query.conditionId));
  if (query.year !== null) params.set(KEYS.year, String(query.year));
  if (query.fitsModelId !== null)
    params.set(KEYS.fits, String(query.fitsModelId));
  if (query.fitsConfigId !== null)
    params.set(KEYS.fitsConfig, String(query.fitsConfigId));

  // Emit sort only when it differs from the derived default for this query.
  if (query.sort !== defaultSort(query)) params.set(KEYS.sort, query.sort);

  // Page 0 is the implicit default — omit it.
  if (query.page > 0) params.set(KEYS.page, String(query.page));

  return params;
}

/**
 * True when the query carries ANY search criteria — a keyword, any facet, or a
 * fits-my-truck filter. Drives the feed-vs-results distinction (an empty SearchQuery
 * is "the feed") and gates whether recordSearchEvent fires.
 */
export function hasCriteria(query: SearchQuery): boolean {
  return (
    query.q !== null ||
    query.makeId !== null ||
    query.modelId !== null ||
    query.configId !== null ||
    query.categoryId !== null ||
    query.conditionId !== null ||
    query.year !== null ||
    query.fitsModelId !== null ||
    query.fitsConfigId !== null
  );
}
