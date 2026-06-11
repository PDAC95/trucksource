import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { requireAdmin } from "@/lib/admin/auth";
import {
  getReportGroup,
  type ReportGroupTarget,
} from "@/lib/admin/reports-queries";
import { EnforcementActions } from "@/components/admin/enforcement-dialogs";
import { HideRestoreControls } from "@/components/admin/listing-moderation";
import { ReportQueueActions } from "@/components/admin/report-queue-actions";
import { ThreadFreezeToggle } from "@/components/admin/thread-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";

// ADMO-03 group detail — every report on ONE target, the target's context,
// and the two-step workflow: (1) optional enforcement via the EXISTING
// 10-03/10-04/10-07 actions, (2) Resolve/Dismiss with a required note, which
// closes ALL pending reports in one action. The steps stay separate clicks —
// enforcement never auto-resolves.
//
// Message targets: NO body renders here. "View thread content" links to the
// audited /admin/messages/threads/[id] page — a report on the message is
// exactly what unlocks it there (Pitfall 8).
export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, string> = {
  scam_fraud: "Scam / fraud",
  harassment: "Harassment",
  spam: "Spam",
  prohibited_item: "Prohibited item",
  wrong_info: "Wrong info",
  other: "Other",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadge(status: string) {
  if (status === "pending") return <Badge variant="secondary">Pending</Badge>;
  if (status === "resolved") return <Badge>Resolved</Badge>;
  return <Badge variant="outline">Dismissed</Badge>;
}

function TargetContext({ target }: { target: ReportGroupTarget }) {
  if (target.type === "listing") {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium">{target.title}</p>
        <p className="text-muted-foreground">
          Status: {target.status}
          {target.hiddenAt
            ? ` · hidden (${target.hiddenReason ?? "enforcement"})`
            : ""}
        </p>
        <p className="text-muted-foreground">
          Seller:{" "}
          <Link
            href={`/admin/users/${target.seller.id}`}
            className="text-foreground hover:underline"
          >
            {target.seller.name}
          </Link>
        </p>
        <Link
          href={`/admin/listings/${target.listingId}`}
          className="inline-flex items-center gap-1 text-foreground hover:underline"
        >
          <ExternalLink className="size-3.5" /> Open listing moderation
        </Link>
      </div>
    );
  }
  if (target.type === "comment") {
    return (
      <div className="space-y-2 text-sm">
        <blockquote className="rounded-md border bg-muted/30 p-3 italic">
          {target.body}
        </blockquote>
        <p className="text-muted-foreground">
          By{" "}
          <Link
            href={`/admin/users/${target.author.id}`}
            className="text-foreground hover:underline"
          >
            {target.author.name}
          </Link>{" "}
          on{" "}
          <Link
            href={`/admin/listings/${target.listingId}`}
            className="text-foreground hover:underline"
          >
            {target.listingTitle}
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted-foreground">
        A message in thread #{target.threadId} ({target.buyerName} ↔{" "}
        {target.sellerName}){target.frozenAt ? " · thread frozen" : ""}
      </p>
      <p className="text-muted-foreground">
        Sender:{" "}
        <Link
          href={`/admin/users/${target.sender.id}`}
          className="text-foreground hover:underline"
        >
          {target.sender.name}
        </Link>
      </p>
      <p className="text-xs text-muted-foreground">
        Message content never renders here — use the audited thread view below
        (this report is what justifies access).
      </p>
      <Link
        href={`/admin/messages/threads/${target.threadId}`}
        className="inline-flex items-center gap-1 text-foreground hover:underline"
      >
        <ExternalLink className="size-3.5" /> View thread content (audited)
      </Link>
    </div>
  );
}

function EnforcementPanel({ target }: { target: ReportGroupTarget }) {
  if (target.type === "listing") {
    return (
      <div className="space-y-4">
        <HideRestoreControls
          listingId={target.listingId}
          hiddenAt={target.hiddenAt}
          hiddenReason={target.hiddenReason}
        />
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Against the seller ({target.seller.name})
          </p>
          <EnforcementActions
            userId={target.seller.id}
            username={target.seller.name}
            restriction={target.seller.restriction}
          />
        </div>
      </div>
    );
  }
  if (target.type === "comment") {
    // No comment-hide mechanism exists (Phase 8 comments hard-delete by their
    // author only) — enforcement is against the author.
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Against the author ({target.author.name})
        </p>
        <EnforcementActions
          userId={target.author.id}
          username={target.author.name}
          restriction={target.author.restriction}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ThreadFreezeToggle
        threadId={target.threadId}
        frozen={target.frozenAt !== null}
      />
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Against the sender ({target.sender.name})
        </p>
        <EnforcementActions
          userId={target.sender.id}
          username={target.sender.name}
          restriction={target.sender.restriction}
        />
      </div>
    </div>
  );
}

export default async function AdminReportGroupPage({
  params,
}: {
  params: Promise<{ targetKey: string }>;
}) {
  await requireAdmin();
  const { targetKey: raw } = await params;
  const targetKey = decodeURIComponent(raw);

  const group = await getReportGroup(targetKey);
  if (!group) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/reports"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Reports
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {group.targetType === "listing"
            ? "Reported listing"
            : group.targetType === "comment"
              ? "Reported comment"
              : "Reported message"}
        </h1>
        <Badge variant={group.pendingCount > 0 ? "destructive" : "secondary"}>
          {group.reports.length}{" "}
          {group.reports.length === 1 ? "report" : "reports"}
          {group.pendingCount > 0 && group.pendingCount < group.reports.length
            ? ` · ${group.pendingCount} pending`
            : ""}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Target</CardTitle>
            </CardHeader>
            <CardContent>
              {group.target ? (
                <TargetContext target={group.target} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  The reported content no longer exists.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {group.reports.map((r) => (
                <div
                  key={r.id}
                  className="rounded-md border p-3 text-sm last:mb-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.reporterName}</span>
                    <Badge variant="outline">
                      {REASON_LABELS[r.reason] ?? r.reason}
                    </Badge>
                    {statusBadge(r.status)}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatDate(r.createdAt)}
                    </span>
                  </div>
                  {r.detail && (
                    <p className="mt-2 text-muted-foreground">{r.detail}</p>
                  )}
                  {r.status !== "pending" && r.adminNote && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Note ({formatDate(r.resolvedAt)}): {r.adminNote}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {group.target && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Enforcement</CardTitle>
              </CardHeader>
              <CardContent>
                <EnforcementPanel target={group.target} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Queue</CardTitle>
            </CardHeader>
            <CardContent>
              {group.pendingCount > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Closing takes a note and applies to all {group.pendingCount}{" "}
                    pending {group.pendingCount === 1 ? "report" : "reports"} at
                    once.
                  </p>
                  <ReportQueueActions
                    targetKey={group.targetKey}
                    pendingCount={group.pendingCount}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No pending reports — this group is closed.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Toaster />
    </div>
  );
}
