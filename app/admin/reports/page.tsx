import Link from "next/link";

import { requireAdmin } from "@/lib/admin/auth";
import {
  getReportQueue,
  type ReportQueueState,
  type ReportTargetType,
} from "@/lib/admin/reports-queries";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ADMO-03 — the abuse-report queue, GROUPED per target (locked decision):
// multiple reports on one listing/comment/message collapse to a single row
// with a counter and merged reasons. State tabs (Pending default) + target
// type filter; a row opens the group detail where enforcement + the
// one-action resolve/dismiss live.
export const dynamic = "force-dynamic";

const STATES: { key: ReportQueueState; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
];

const TYPES: { key: ReportTargetType | "all"; label: string }[] = [
  { key: "all", label: "All types" },
  { key: "listing", label: "Listings" },
  { key: "comment", label: "Comments" },
  { key: "message", label: "Messages" },
];

const REASON_LABELS: Record<string, string> = {
  scam_fraud: "Scam / fraud",
  harassment: "Harassment",
  spam: "Spam",
  prohibited_item: "Prohibited item",
  wrong_info: "Wrong info",
  other: "Other",
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function typeBadge(type: ReportTargetType) {
  const label =
    type === "listing" ? "Listing" : type === "comment" ? "Comment" : "Message";
  return <Badge variant="outline">{label}</Badge>;
}

const TH_CLASS =
  "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const TD_CLASS = "px-3 py-2 align-middle text-sm";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const stateParam = first(sp.state);
  const state: ReportQueueState =
    stateParam === "resolved" || stateParam === "dismissed"
      ? stateParam
      : "pending";
  const typeParam = first(sp.type);
  const type: ReportTargetType | undefined =
    typeParam === "listing" ||
    typeParam === "comment" ||
    typeParam === "message"
      ? typeParam
      : undefined;

  const items = await getReportQueue({ state, type });

  const href = (s: ReportQueueState, t: ReportTargetType | "all") =>
    `/admin/reports?state=${s}${t === "all" ? "" : `&type=${t}`}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>

      {/* State tabs — server-rendered links, Pending is the working view. */}
      <div className="flex gap-1 border-b">
        {STATES.map((s) => (
          <Link
            key={s.key}
            href={href(s.key, type ?? "all")}
            className={cn(
              "-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              state === s.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {/* Target type filter pills. */}
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <Link
            key={t.key}
            href={href(state, t.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              (type ?? "all") === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No {state} reports{type ? ` on ${type}s` : ""}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[760px]">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={TH_CLASS}>Type</th>
                <th className={TH_CLASS}>Target</th>
                <th className={TH_CLASS}>Reports</th>
                <th className={TH_CLASS}>Reasons</th>
                <th className={TH_CLASS}>First reported</th>
                {state !== "pending" && <th className={TH_CLASS}>Note</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.targetKey} className="border-b last:border-0">
                  <td className={TD_CLASS}>{typeBadge(item.targetType)}</td>
                  <td className={cn(TD_CLASS, "max-w-[320px]")}>
                    <Link
                      href={`/admin/reports/${encodeURIComponent(item.targetKey)}`}
                      className="line-clamp-2 font-medium hover:underline"
                    >
                      {item.summary}
                    </Link>
                  </td>
                  <td className={TD_CLASS}>
                    <Badge
                      variant={
                        item.reportCount > 1 ? "destructive" : "secondary"
                      }
                    >
                      {item.reportCount}
                    </Badge>
                  </td>
                  <td className={cn(TD_CLASS, "max-w-[240px]")}>
                    <div className="flex flex-wrap gap-1">
                      {item.reasons.map((r) => (
                        <Badge key={r} variant="outline">
                          {REASON_LABELS[r] ?? r}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className={cn(TD_CLASS, "whitespace-nowrap")}>
                    {formatDate(item.firstReported)}
                  </td>
                  {state !== "pending" && (
                    <td
                      className={cn(
                        TD_CLASS,
                        "max-w-[260px] text-muted-foreground",
                      )}
                    >
                      <span className="line-clamp-2">
                        {item.adminNote ?? "—"}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
