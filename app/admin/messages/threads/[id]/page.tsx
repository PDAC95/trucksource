import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, ShieldAlert } from "lucide-react";

import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import {
  getAdminThreadMeta,
  getThreadContentJustification,
  getThreadMessagesForAdmin,
} from "@/lib/admin/messaging-queries";
import { ThreadFreezeToggle } from "@/components/admin/thread-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ADMO-04 audited content view — the audit-the-auditor mechanic, in STRICT
// order (every step gates the next; reordering is a privacy regression):
//
//   1. requireAdmin()                    — re-gated HERE (the layout is UX,
//                                          not an authorization boundary; this
//                                          is the most sensitive admin page).
//   2. getThreadContentJustification()   — null → render the locked notice
//                                          with METADATA ONLY; zero message
//                                          bodies are fetched on that path.
//   3. logAdminAction(content_access)    — the audit row is written BEFORE any
//                                          body leaves the database. It THROWS
//                                          on failure, so an unaudited view
//                                          cannot render.
//   4. getThreadMessagesForAdmin()       — only now do bodies load.
//
// Read-only by construction: no composer, no reply action exists here.
export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AdminThreadContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // 1) Security gate — never rely on the layout alone.
  const { adminId } = await requireAdmin();

  const { id } = await params;
  const threadId = Number.parseInt(id, 10);
  if (!Number.isInteger(threadId) || threadId <= 0) notFound();

  const meta = await getAdminThreadMeta(threadId);
  if (!meta) notFound();

  // 2) The ONE unlock rule: a report on a MESSAGE in this thread. A listing
  //    report does not unlock content (Pitfall 8).
  const justification = await getThreadContentJustification(threadId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="ghost">
          <Link href="/admin/messages">
            <ArrowLeft className="size-4" />
            Threads
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Thread #{meta.threadId}
        </h1>
        {meta.frozenAt && <Badge variant="secondary">Frozen</Badge>}
      </div>

      {/* Metadata header — always visible (this is the metadata-default tier). */}
      <div className="rounded-md border p-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Participants
            </dt>
            <dd className="mt-1">
              {meta.buyerName}
              <span className="text-muted-foreground"> ↔ </span>
              {meta.sellerName}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Listing
            </dt>
            <dd className="mt-1">
              <Link
                href={`/listings/${meta.listingId}`}
                className="hover:underline"
              >
                {meta.listingTitle}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Messages
            </dt>
            <dd className="mt-1">{meta.messageCount}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Last activity
            </dt>
            <dd className="mt-1">{formatDate(meta.lastMessageAt)}</dd>
          </div>
        </dl>
        <div className="mt-4 border-t pt-4">
          <ThreadFreezeToggle
            threadId={meta.threadId}
            frozen={meta.frozenAt !== null}
          />
        </div>
      </div>

      {justification === null ? (
        // LOCKED: no message report on this thread — metadata only, no bodies
        // were fetched anywhere on this render path.
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-10 text-center">
          <Lock className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            No report justifies access to this conversation&apos;s content.
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            Message content opens only when a participant has reported a message
            in this thread. Reports on the listing alone do not unlock chat
            content.
          </p>
        </div>
      ) : (
        <JustifiedTranscript
          threadId={threadId}
          adminId={adminId}
          reportId={justification.reportId}
          reason={justification.reason}
        />
      )}
    </div>
  );
}

async function JustifiedTranscript({
  threadId,
  adminId,
  reportId,
  reason,
}: {
  threadId: number;
  adminId: string;
  reportId: number;
  reason: string;
}) {
  // 3) AUDIT FIRST — the row lands before any body is fetched/rendered.
  //    logAdminAction throws on failure: no audit row, no transcript.
  await logAdminAction({
    adminId,
    action: "thread_content_access",
    targetType: "thread",
    targetId: String(threadId),
    metadata: { report_id: reportId },
  });

  // 4) Only now do message bodies leave the database.
  const messages = await getThreadMessagesForAdmin(threadId);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          Access justified by report{" "}
          <span className="font-semibold">#{reportId}</span> ({reason}) — this
          access has been logged.
        </p>
      </div>

      {/* Read-only transcript — there is deliberately no composer here. */}
      <div className="space-y-3 rounded-md border p-4">
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            This thread has no messages.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="rounded-md bg-muted/40 p-3">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold">{m.senderName}</span>
              <span
                className={cn(
                  "text-xs text-muted-foreground",
                  "whitespace-nowrap",
                )}
              >
                {formatDate(m.createdAt)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{m.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
