import { TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ADMA-01/02/04 KPI row. Server-compatible (no "use client") — props are plain
// pre-aggregated numbers; raw event rows never reach a client component.

interface KpiCardsProps {
  registered: number;
  active30d: number;
  activeListings: number;
  messagesSent: number;
  rangeLabel: string;
  /** New-user growth %, current vs previous month. Null = no baseline yet. */
  growthPct: number | null;
}

const FMT = new Intl.NumberFormat("en-US");

function Kpi({
  title,
  value,
  hint,
}: {
  title: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function KpiCards({
  registered,
  active30d,
  activeListings,
  messagesSent,
  rangeLabel,
  growthPct,
}: KpiCardsProps) {
  const up = growthPct !== null && growthPct >= 0;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Kpi title="Registered users" value={FMT.format(registered)} />
      <Kpi
        title="Active users"
        value={FMT.format(active30d)}
        hint="Signed in within 30 days"
      />
      <Kpi title="Active listings" value={FMT.format(activeListings)} />
      <Kpi
        title="Messages sent"
        value={FMT.format(messagesSent)}
        hint={rangeLabel}
      />
      <Kpi
        title="Monthly growth"
        value={
          growthPct === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 ${
                up ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {up ? (
                <TrendingUp className="size-5" aria-hidden />
              ) : (
                <TrendingDown className="size-5" aria-hidden />
              )}
              {up ? "+" : ""}
              {growthPct}%
            </span>
          )
        }
        hint="New users vs previous month"
      />
    </div>
  );
}
