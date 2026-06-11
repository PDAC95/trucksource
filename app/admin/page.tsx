import Link from "next/link";
import { Suspense } from "react";

import { KpiCards } from "@/components/admin/kpi-cards";
import { RankingList } from "@/components/admin/ranking-list";
import { TrendChart } from "@/components/admin/trend-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ANALYTICS_RANGES,
  RANGE_LABELS,
  getDashboardData,
  parseRange,
  type AnalyticsRange,
} from "@/lib/admin/analytics";
import { requireAdmin } from "@/lib/admin/auth";
import { cn } from "@/lib/utils";

// ADMA-01..04 analytics dashboard. Live service-role aggregates (no
// pre-aggregation — locked decision), re-scoped by the ?range preset
// selector (7d/30d/90d/all; no free date pickers). All aggregation is
// server-side; client chart components receive label/value arrays only.
export const dynamic = "force-dynamic";

const PRESET_LABELS: Record<AnalyticsRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "All time",
};

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  // Layout gates the segment; re-asserting here is free (verified JWT claim).
  await requireAdmin();
  const params = await searchParams;
  const range = parseRange(params.range);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Analytics dashboard
        </h1>
        <RangePresets active={range} />
      </div>
      {/* key={range} re-suspends on preset switch so stale numbers never linger */}
      <Suspense key={range} fallback={<DashboardSkeleton />}>
        <DashboardContent range={range} />
      </Suspense>
    </div>
  );
}

/** Four link-buttons; every chart and ranking below re-scopes to the preset. */
function RangePresets({ active }: { active: AnalyticsRange }) {
  return (
    <nav aria-label="Date range" className="flex gap-1 rounded-lg border p-1">
      {ANALYTICS_RANGES.map((r) => (
        <Link
          key={r}
          href={`/admin?range=${r}`}
          aria-current={r === active ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            r === active
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {PRESET_LABELS[r]}
        </Link>
      ))}
    </nav>
  );
}

async function DashboardContent({ range }: { range: AnalyticsRange }) {
  const data = await getDashboardData(range);
  const rangeLabel = RANGE_LABELS[range];

  return (
    <div className="space-y-6">
      <KpiCards
        registered={data.userStats.registered}
        active30d={data.userStats.active30d}
        activeListings={data.listingStats.activeListings}
        messagesSent={data.messagesSent}
        rangeLabel={rangeLabel}
        growthPct={data.growth.growthPct}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Monthly growth"
          description="New users and listings, last 12 months"
        >
          {data.growth.series.every(
            (p) => p.users === 0 && p.listings === 0,
          ) ? (
            <EmptyState />
          ) : (
            <TrendChart data={data.growth.series} />
          )}
        </Section>

        <Section
          title="Most viewed listings"
          description={`Listing views — ${rangeLabel.toLowerCase()}`}
        >
          <RankingList
            unit="views"
            items={data.listingStats.mostViewed.map((l) => ({
              label: l.title,
              value: l.viewCount,
              href: `/admin/listings/${l.listingId}`,
              badge: l.isHidden
                ? "hidden"
                : l.status !== "active"
                  ? l.status
                  : undefined,
            }))}
          />
        </Section>

        <Section
          title="Most searched makes"
          description={`Search filters — ${rangeLabel.toLowerCase()}`}
        >
          <RankingList
            unit="searches"
            items={data.searchRankings.topMakes.map((m) => ({
              label: m.label,
              value: m.value,
            }))}
          />
        </Section>

        <Section
          title="Most searched models"
          description={`Model + "fits my truck" filters — ${rangeLabel.toLowerCase()}`}
        >
          <RankingList
            unit="searches"
            items={data.searchRankings.topModels.map((m) => ({
              label: m.label,
              value: m.value,
            }))}
          />
        </Section>

        <Section
          title="Top search terms"
          description={`Normalized terms — ${rangeLabel.toLowerCase()}`}
        >
          <RankingList
            unit="searches"
            items={data.searchRankings.topTerms.map((t) => ({
              label: t.label,
              value: t.value,
            }))}
          />
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">
      No data yet for this range.
    </p>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
