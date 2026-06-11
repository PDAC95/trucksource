import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// ADMA-01..04 read side: live SQL aggregates over the event streams logged in
// Phases 5/7 (listing_view_events, search_events) plus users/listings/messages.
// No pre-aggregation (locked decision) — every dashboard render queries live.
//
// All aggregation happens HERE (server). Client chart components receive only
// label/value-shaped arrays — never raw event rows (anti-pattern guard).
//
// Where PostgREST can express the shape (counts + filters) we use supabase-js
// directly; where it can't (jsonb facet group-by, UNION demand, month series)
// we call the 0020_analytics_helpers.sql functions — execute revoked from
// anon/authenticated, service-role-only, same posture as
// admin_user_activity_stats (0019).

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";

export const ANALYTICS_RANGES: AnalyticsRange[] = ["7d", "30d", "90d", "all"];

export const RANGE_LABELS: Record<AnalyticsRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

export function parseRange(value: string | undefined): AnalyticsRange {
  return (ANALYTICS_RANGES as string[]).includes(value ?? "")
    ? (value as AnalyticsRange)
    : "30d";
}

/** Map a preset to an ISO lower bound; null = All time (no bound). */
function rangeSince(range: AnalyticsRange): string | null {
  if (range === "all") return null;
  const days = { "7d": 7, "30d": 30, "90d": 90 }[range];
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export interface UserStats {
  registered: number;
  active30d: number;
}

export interface MostViewedListing {
  listingId: number;
  title: string;
  status: string;
  isHidden: boolean;
  viewCount: number;
}

export interface ListingStats {
  activeListings: number;
  mostViewed: MostViewedListing[];
}

export interface RankedItem {
  id: number | null;
  label: string;
  value: number;
}

export interface SearchRankings {
  topMakes: RankedItem[];
  topModels: RankedItem[];
  topTerms: RankedItem[];
}

export interface GrowthPoint {
  month: string; // "Jan 26" style label
  users: number;
  listings: number;
}

export interface GrowthSeries {
  series: GrowthPoint[];
  /** New-user growth, current partial month vs previous full month. Null when previous month is 0. */
  growthPct: number | null;
}

export interface DashboardData {
  userStats: UserStats;
  listingStats: ListingStats;
  searchRankings: SearchRankings;
  messagesSent: number;
  growth: GrowthSeries;
}

/** ADMA-01: registered users + 30-day MAU via the 0019 definer RPC. */
export async function getUserStats(): Promise<UserStats> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_user_activity_stats");
  if (error) throw new Error(`admin_user_activity_stats: ${error.message}`);
  const row = (
    data as { registered: number; active_30d: number }[] | null
  )?.[0];
  return {
    registered: Number(row?.registered ?? 0),
    active30d: Number(row?.active_30d ?? 0),
  };
}

/** ADMA-02: current active-listing count + top-10 most-viewed in range. */
export async function getListingStats(
  range: AnalyticsRange,
): Promise<ListingStats> {
  const admin = createAdminClient();
  const since = rangeSince(range);

  const [countRes, viewedRes] = await Promise.all([
    admin
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    admin.rpc("admin_top_viewed_listings", { p_since: since }),
  ]);
  if (countRes.error)
    throw new Error(`listings count: ${countRes.error.message}`);
  if (viewedRes.error)
    throw new Error(`admin_top_viewed_listings: ${viewedRes.error.message}`);

  const mostViewed = (
    (viewedRes.data ?? []) as {
      listing_id: number;
      title: string;
      status: string;
      is_hidden: boolean;
      view_count: number;
    }[]
  ).map((r) => ({
    listingId: Number(r.listing_id),
    title: r.title,
    status: r.status,
    isHidden: r.is_hidden,
    viewCount: Number(r.view_count),
  }));

  return { activeListings: countRes.count ?? 0, mostViewed };
}

/** ADMA-03: most-searched makes, models (modelId ∪ fitsModelId), and top normalized terms. */
export async function getSearchRankings(
  range: AnalyticsRange,
): Promise<SearchRankings> {
  const admin = createAdminClient();
  const since = rangeSince(range);

  const [makesRes, modelsRes, termsRes] = await Promise.all([
    admin.rpc("admin_top_search_makes", { p_since: since }),
    admin.rpc("admin_top_search_models", { p_since: since }),
    admin.rpc("admin_top_search_terms", { p_since: since }),
  ]);
  if (makesRes.error)
    throw new Error(`admin_top_search_makes: ${makesRes.error.message}`);
  if (modelsRes.error)
    throw new Error(`admin_top_search_models: ${modelsRes.error.message}`);
  if (termsRes.error)
    throw new Error(`admin_top_search_terms: ${termsRes.error.message}`);

  return {
    topMakes: (
      (makesRes.data ?? []) as {
        make_id: number;
        make_name: string;
        search_count: number;
      }[]
    ).map((r) => ({
      id: Number(r.make_id),
      label: r.make_name,
      value: Number(r.search_count),
    })),
    topModels: (
      (modelsRes.data ?? []) as {
        model_id: number;
        model_name: string;
        search_count: number;
      }[]
    ).map((r) => ({
      id: Number(r.model_id),
      label: r.model_name,
      value: Number(r.search_count),
    })),
    topTerms: (
      (termsRes.data ?? []) as { term: string; search_count: number }[]
    ).map((r) => ({
      id: null,
      label: r.term,
      value: Number(r.search_count),
    })),
  };
}

/** ADMA-04: messages sent within the range. */
export async function getMessageStats(range: AnalyticsRange): Promise<number> {
  const admin = createAdminClient();
  const since = rangeSince(range);
  let query = admin.from("messages").select("id", {
    count: "exact",
    head: true,
  });
  if (since !== null) query = query.gte("created_at", since);
  const { count, error } = await query;
  if (error) throw new Error(`messages count: ${error.message}`);
  return count ?? 0;
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

/** ADMA-04: 12-month new-user/new-listing series + monthly growth % KPI. */
export async function getGrowthSeries(): Promise<GrowthSeries> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_monthly_growth");
  if (error) throw new Error(`admin_monthly_growth: ${error.message}`);

  const rows = (data ?? []) as {
    month_start: string;
    new_users: number;
    new_listings: number;
  }[];

  const series: GrowthPoint[] = rows.map((r) => ({
    month: MONTH_LABEL.format(new Date(`${r.month_start}T00:00:00Z`)),
    users: Number(r.new_users),
    listings: Number(r.new_listings),
  }));

  // Growth % = new users this (partial) month vs previous full month.
  const current = series.at(-1)?.users ?? 0;
  const previous = series.at(-2)?.users ?? 0;
  const growthPct =
    previous > 0
      ? Math.round(((current - previous) / previous) * 1000) / 10
      : null;

  return { series, growthPct };
}

/** One call per dashboard render — all aggregates in parallel. */
export async function getDashboardData(
  range: AnalyticsRange,
): Promise<DashboardData> {
  const [userStats, listingStats, searchRankings, messagesSent, growth] =
    await Promise.all([
      getUserStats(),
      getListingStats(range),
      getSearchRankings(range),
      getMessageStats(range),
      getGrowthSeries(),
    ]);
  return { userStats, listingStats, searchRankings, messagesSent, growth };
}
