"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

// ADMA-04 trend chart. Client component (Recharts needs the DOM) — receives
// ONLY the server-aggregated 12-month series; never raw event rows.

export interface TrendPoint {
  month: string;
  users: number;
  listings: number;
}

const chartConfig = {
  users: {
    label: "New users",
    color: "var(--chart-1)",
  },
  listings: {
    label: "New listings",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-64 w-full">
      <AreaChart data={data} margin={{ left: -20, right: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          dataKey="users"
          type="monotone"
          fill="var(--color-users)"
          fillOpacity={0.25}
          stroke="var(--color-users)"
          strokeWidth={2}
        />
        <Area
          dataKey="listings"
          type="monotone"
          fill="var(--color-listings)"
          fillOpacity={0.25}
          stroke="var(--color-listings)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
