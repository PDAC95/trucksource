import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePublicName } from "@/lib/seller/badge";

// ADMO-03 read surface — the grouped abuse-report queue.
//
//   1. Grouping happens in the admin_report_queue() SQL function (0021):
//      one row per TARGET (listing/comment/message) with report_count and the
//      distinct reasons merged. PostgREST cannot group on the coalesce of the
//      exclusive-arc columns, hence the RPC (service-role-only execute).
//   2. MESSAGE reports never surface the message body here — not in the queue,
//      not in the group detail. The ONLY body surface is the audited
//      /admin/messages/threads/[id] page (Pitfall 8 posture from 10-07);
//      this module returns thread metadata + the link.
//   3. Comment bodies ARE selected — comments are public social content
//      (world-readable RLS in 0015), nothing private leaks.
//
// All reads go through the service role: reports has reporter-only RLS; the
// queue columns (status/admin_note/...) are invisible to everyone else.

export type ReportTargetType = "listing" | "comment" | "message";
export type ReportQueueState = "pending" | "resolved" | "dismissed";

const TARGET_KEY_RE = /^(listing|comment|message):(\d+)$/;

/**
 * `targetKey` round-trips through URLs and the resolve/dismiss actions —
 * parse it back to (type, id) in exactly one place. Returns null on garbage.
 */
export function parseTargetKey(
  targetKey: string,
): { type: ReportTargetType; id: number } | null {
  const m = TARGET_KEY_RE.exec(targetKey);
  if (!m) return null;
  const id = Number.parseInt(m[2], 10);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { type: m[1] as ReportTargetType, id };
}

/** The arc column a target type lives in on `reports`. */
export function targetColumn(
  type: ReportTargetType,
): "listing_id" | "comment_id" | "message_id" {
  return `${type}_id` as const;
}

export type ReportQueueItem = {
  targetKey: string;
  targetType: ReportTargetType;
  targetId: number;
  reportCount: number;
  reasons: string[];
  firstReported: string;
  lastReported: string;
  /** Set on resolved/dismissed groups — the note the admin left. */
  adminNote: string | null;
  resolvedAt: string | null;
  /** Human context: listing title, comment excerpt, or thread participants. */
  summary: string;
};

type QueueRpcRow = {
  target_key: string;
  target_type: ReportTargetType;
  target_id: number;
  report_count: number;
  reasons: string[];
  first_reported: string;
  last_reported: string;
  last_admin_note: string | null;
  last_resolved_at: string | null;
};

type AdminClient = ReturnType<typeof createAdminClient>;

// Batched public-name resolution (messaging-queries pattern) — enumerated
// profiles_public columns only, never the PII table (invariant #1).
async function resolveNames(
  admin: AdminClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const nameById = new Map<string, string>();
  if (userIds.length === 0) return nameById;
  const { data } = await admin
    .from("profiles_public")
    .select("id, username, display_name")
    .in("id", userIds);
  for (const p of (data ?? []) as {
    id: string;
    username: string;
    display_name: string | null;
  }[]) {
    nameById.set(p.id, resolvePublicName(p.display_name, p.username));
  }
  return nameById;
}

function excerpt(body: string, max = 80): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * The grouped queue: one entry per target, filtered by state (tab) and
 * optionally by target type. Enriched app-side with display context — batch
 * lookups per id type, no N+1.
 */
export async function getReportQueue({
  state,
  type,
}: {
  state: ReportQueueState;
  type?: ReportTargetType;
}): Promise<ReportQueueItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_report_queue", {
    p_status: state,
    p_type: type ?? null,
  });
  if (error || !data) return [];
  const rows = data as unknown as QueueRpcRow[];
  if (rows.length === 0) return [];

  const listingIds = rows
    .filter((r) => r.target_type === "listing")
    .map((r) => r.target_id);
  const commentIds = rows
    .filter((r) => r.target_type === "comment")
    .map((r) => r.target_id);
  const messageIds = rows
    .filter((r) => r.target_type === "message")
    .map((r) => r.target_id);

  const listingTitle = new Map<number, string>();
  const commentSummary = new Map<number, string>();
  const messageSummary = new Map<number, string>();

  if (listingIds.length > 0) {
    const { data: ls } = await admin
      .from("listings")
      .select("id, title")
      .in("id", listingIds);
    for (const l of (ls ?? []) as { id: number; title: string }[]) {
      listingTitle.set(l.id, l.title);
    }
  }

  if (commentIds.length > 0) {
    const { data: cs } = await admin
      .from("listing_comments")
      .select("id, body, listing_id")
      .in("id", commentIds);
    const commentRows = (cs ?? []) as {
      id: number;
      body: string;
      listing_id: number;
    }[];
    const extraListingIds = commentRows
      .map((c) => c.listing_id)
      .filter((id) => !listingTitle.has(id));
    if (extraListingIds.length > 0) {
      const { data: ls } = await admin
        .from("listings")
        .select("id, title")
        .in("id", extraListingIds);
      for (const l of (ls ?? []) as { id: number; title: string }[]) {
        listingTitle.set(l.id, l.title);
      }
    }
    for (const c of commentRows) {
      const onTitle = listingTitle.get(c.listing_id) ?? `#${c.listing_id}`;
      commentSummary.set(c.id, `“${excerpt(c.body, 60)}” on ${onTitle}`);
    }
  }

  if (messageIds.length > 0) {
    // ids + thread metadata ONLY — message bodies never load in queue queries.
    const { data: ms } = await admin
      .from("messages")
      .select("id, thread_id")
      .in("id", messageIds);
    const msgRows = (ms ?? []) as { id: number; thread_id: number }[];
    const threadIds = Array.from(new Set(msgRows.map((m) => m.thread_id)));
    const threadById = new Map<
      number,
      { buyer_id: string; seller_id: string }
    >();
    if (threadIds.length > 0) {
      const { data: ts } = await admin
        .from("message_threads")
        .select("id, buyer_id, seller_id")
        .in("id", threadIds);
      for (const t of (ts ?? []) as {
        id: number;
        buyer_id: string;
        seller_id: string;
      }[]) {
        threadById.set(t.id, { buyer_id: t.buyer_id, seller_id: t.seller_id });
      }
    }
    const userIds = Array.from(
      new Set(
        Array.from(threadById.values()).flatMap((t) => [
          t.buyer_id,
          t.seller_id,
        ]),
      ),
    );
    const nameById = await resolveNames(admin, userIds);
    for (const m of msgRows) {
      const t = threadById.get(m.thread_id);
      const buyer = t ? (nameById.get(t.buyer_id) ?? "(deleted)") : "?";
      const seller = t ? (nameById.get(t.seller_id) ?? "(deleted)") : "?";
      messageSummary.set(
        m.id,
        `Message in thread #${m.thread_id} (${buyer} ↔ ${seller})`,
      );
    }
  }

  return rows.map((r) => ({
    targetKey: r.target_key,
    targetType: r.target_type,
    targetId: r.target_id,
    reportCount: Number(r.report_count),
    reasons: r.reasons ?? [],
    firstReported: r.first_reported,
    lastReported: r.last_reported,
    adminNote: r.last_admin_note,
    resolvedAt: r.last_resolved_at,
    summary:
      r.target_type === "listing"
        ? (listingTitle.get(r.target_id) ?? `Listing #${r.target_id}`)
        : r.target_type === "comment"
          ? (commentSummary.get(r.target_id) ??
            `Comment #${r.target_id} (deleted)`)
          : (messageSummary.get(r.target_id) ?? `Message #${r.target_id}`),
  }));
}

export type ReportRowDetail = {
  id: number;
  reporterId: string;
  reporterName: string;
  reason: string;
  detail: string | null;
  status: ReportQueueState;
  createdAt: string;
  adminNote: string | null;
  resolvedAt: string | null;
};

/** The enforcement target's account, ready for EnforcementActions. */
export type TargetUser = {
  id: string;
  name: string;
  restriction: { state: "suspended" | "banned" } | null;
};

export type ReportGroupTarget =
  | {
      type: "listing";
      listingId: number;
      title: string;
      status: string;
      hiddenAt: string | null;
      hiddenReason: string | null;
      seller: TargetUser;
    }
  | {
      type: "comment";
      commentId: number;
      body: string;
      listingId: number;
      listingTitle: string;
      author: TargetUser;
    }
  | {
      type: "message";
      messageId: number;
      threadId: number;
      frozenAt: string | null;
      buyerName: string;
      sellerName: string;
      sender: TargetUser;
    };

export type ReportGroup = {
  targetKey: string;
  targetType: ReportTargetType;
  targetId: number;
  reports: ReportRowDetail[];
  pendingCount: number;
  /** null when the target row no longer exists (e.g. cascaded away). */
  target: ReportGroupTarget | null;
};

async function getRestriction(
  admin: AdminClient,
  userId: string,
): Promise<TargetUser["restriction"]> {
  const { data } = await admin
    .from("user_restrictions")
    .select("state")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return { state: (data as { state: "suspended" | "banned" }).state };
}

async function buildTargetUser(
  admin: AdminClient,
  userId: string,
  nameById: Map<string, string>,
): Promise<TargetUser> {
  return {
    id: userId,
    name: nameById.get(userId) ?? "(deleted)",
    restriction: await getRestriction(admin, userId),
  };
}

/**
 * Everything the group detail page needs: every report row for the target
 * (any status — resolved history stays visible), plus the target context and
 * the enforcement-target user. Returns null only for unparseable keys or
 * targets with zero reports.
 */
export async function getReportGroup(
  targetKey: string,
): Promise<ReportGroup | null> {
  const parsed = parseTargetKey(targetKey);
  if (!parsed) return null;
  const admin = createAdminClient();

  const { data } = await admin
    .from("reports")
    .select(
      "id, reporter_id, reason, detail, status, created_at, admin_note, resolved_at",
    )
    .eq(targetColumn(parsed.type), parsed.id)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as {
    id: number;
    reporter_id: string;
    reason: string;
    detail: string | null;
    status: ReportQueueState;
    created_at: string;
    admin_note: string | null;
    resolved_at: string | null;
  }[];
  if (rows.length === 0) return null;

  const reporterNames = await resolveNames(
    admin,
    Array.from(new Set(rows.map((r) => r.reporter_id))),
  );
  const reports: ReportRowDetail[] = rows.map((r) => ({
    id: r.id,
    reporterId: r.reporter_id,
    reporterName: reporterNames.get(r.reporter_id) ?? "(deleted)",
    reason: r.reason,
    detail: r.detail,
    status: r.status,
    createdAt: r.created_at,
    adminNote: r.admin_note,
    resolvedAt: r.resolved_at,
  }));
  const pendingCount = reports.filter((r) => r.status === "pending").length;

  let target: ReportGroupTarget | null = null;

  if (parsed.type === "listing") {
    const { data: l } = await admin
      .from("listings")
      .select("id, title, status, hidden_at, hidden_reason, seller_id")
      .eq("id", parsed.id)
      .maybeSingle();
    if (l) {
      const row = l as {
        id: number;
        title: string;
        status: string;
        hidden_at: string | null;
        hidden_reason: string | null;
        seller_id: string;
      };
      const nameById = await resolveNames(admin, [row.seller_id]);
      target = {
        type: "listing",
        listingId: row.id,
        title: row.title,
        status: row.status,
        hiddenAt: row.hidden_at,
        hiddenReason: row.hidden_reason,
        seller: await buildTargetUser(admin, row.seller_id, nameById),
      };
    }
  } else if (parsed.type === "comment") {
    const { data: c } = await admin
      .from("listing_comments")
      .select("id, body, listing_id, author_id")
      .eq("id", parsed.id)
      .maybeSingle();
    if (c) {
      const row = c as {
        id: number;
        body: string;
        listing_id: number;
        author_id: string;
      };
      const [{ data: l }, nameById] = await Promise.all([
        admin
          .from("listings")
          .select("title")
          .eq("id", row.listing_id)
          .maybeSingle(),
        resolveNames(admin, [row.author_id]),
      ]);
      target = {
        type: "comment",
        commentId: row.id,
        body: row.body,
        listingId: row.listing_id,
        listingTitle:
          (l as { title: string } | null)?.title ?? `#${row.listing_id}`,
        author: await buildTargetUser(admin, row.author_id, nameById),
      };
    }
  } else {
    // Message target: thread metadata + sender ONLY — the body stays behind
    // the audited /admin/messages/threads/[id] page (the report on this very
    // message is exactly what unlocks it there).
    const { data: m } = await admin
      .from("messages")
      .select("id, thread_id, sender_id")
      .eq("id", parsed.id)
      .maybeSingle();
    if (m) {
      const row = m as { id: number; thread_id: number; sender_id: string };
      const { data: t } = await admin
        .from("message_threads")
        .select("id, buyer_id, seller_id, frozen_at")
        .eq("id", row.thread_id)
        .maybeSingle();
      const thread = t as {
        id: number;
        buyer_id: string;
        seller_id: string;
        frozen_at: string | null;
      } | null;
      const nameById = await resolveNames(
        admin,
        thread
          ? Array.from(
              new Set([row.sender_id, thread.buyer_id, thread.seller_id]),
            )
          : [row.sender_id],
      );
      target = {
        type: "message",
        messageId: row.id,
        threadId: row.thread_id,
        frozenAt: thread?.frozen_at ?? null,
        buyerName: thread
          ? (nameById.get(thread.buyer_id) ?? "(deleted)")
          : "?",
        sellerName: thread
          ? (nameById.get(thread.seller_id) ?? "(deleted)")
          : "?",
        sender: await buildTargetUser(admin, row.sender_id, nameById),
      };
    }
  }

  return {
    targetKey,
    targetType: parsed.type,
    targetId: parsed.id,
    reports,
    pendingCount,
    target,
  };
}
