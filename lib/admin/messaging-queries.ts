import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePublicName } from "@/lib/seller/badge";

// ADMO-04 read surface — the LOCKED privacy posture, encoded in query shape:
//
//   1. Thread LIST = metadata only. getAdminThreads never selects a message
//      body anywhere — participants (public usernames), listing title, count,
//      last activity, frozen + reported flags. The absence of the column in
//      the select IS the guarantee.
//   2. Thread CONTENT unlocks ONLY via getThreadContentJustification(): a
//      report whose message_id belongs to a message IN THIS THREAD. A listing
//      report alone must NOT unlock chat content (Pitfall 8) — that rule lives
//      in exactly this ONE function so it cannot drift.
//   3. getThreadMessagesForAdmin() (bodies) is called ONLY by the content page
//      AFTER justification + the 'thread_content_access' audit write.
//   4. contact_log full text IS correct here — the row is the admin copy of
//      record by design (0016 header), per the locked stakeholder decision.
//
// All reads go through the service role: contact_log/reports have no admin
// RLS policies on purpose (default-deny protects them from everyone else).

export const ADMIN_PAGE_SIZE = 25;

// Cap for username/title → id pre-resolution when a text filter is active.
// Admin volume; if a filter matches more than this, the page just narrows it.
const FILTER_MATCH_CAP = 100;

export type AdminThreadListItem = {
  threadId: number;
  listingId: number;
  listingTitle: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  frozenAt: string | null;
  /** True iff some report targets a MESSAGE in this thread — the content key. */
  hasMessageReport: boolean;
};

export type AdminContactLogItem = {
  id: number;
  listingId: number;
  listingTitle: string;
  buyerId: string;
  buyerUsername: string;
  sellerId: string;
  sellerUsername: string;
  /** The buyer's initial message — the admin copy of record (locked decision). */
  messageText: string;
  createdAt: string;
};

export type ThreadJustification = {
  reportId: number;
  reason: string;
  detail: string | null;
  createdAt: string;
};

export type AdminThreadMessage = {
  id: number;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
};

type ThreadMetaRow = {
  id: number;
  listing_id: number;
  buyer_id: string;
  seller_id: string;
  created_at: string;
  last_message_at: string;
  frozen_at: string | null;
};

// Enumerated metadata columns — deliberately NO join that could pull bodies.
const THREAD_META_COLUMNS =
  "id, listing_id, buyer_id, seller_id, created_at, last_message_at, frozen_at";

type AdminClient = ReturnType<typeof createAdminClient>;

// Batched public-name resolution (lib/messaging/queries.ts pattern) —
// profiles_public enumerated columns only, never the PII table (invariant #1).
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

async function resolveListingTitles(
  admin: AdminClient,
  listingIds: number[],
): Promise<Map<number, string>> {
  const titleById = new Map<number, string>();
  if (listingIds.length === 0) return titleById;
  const { data } = await admin
    .from("listings")
    .select("id, title")
    .in("id", listingIds);
  for (const l of (data ?? []) as { id: number; title: string }[]) {
    titleById.set(l.id, l.title);
  }
  return titleById;
}

// Text filter pre-resolution: a username/display-name fragment → matching user
// ids (capped). Empty array = "no user matches" (caller treats as no rows).
async function matchUserIds(
  admin: AdminClient,
  fragment: string,
): Promise<string[]> {
  const { data } = await admin
    .from("profiles_public")
    .select("id")
    .or(`username.ilike.%${fragment}%,display_name.ilike.%${fragment}%`)
    .limit(FILTER_MATCH_CAP);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

async function matchListingIds(
  admin: AdminClient,
  fragment: string,
): Promise<number[]> {
  const { data } = await admin
    .from("listings")
    .select("id")
    .ilike("title", `%${fragment}%`)
    .limit(FILTER_MATCH_CAP);
  return ((data ?? []) as { id: number }[]).map((r) => r.id);
}

// Escape PostgREST .or() reserved characters in user input. Conservative:
// strip the delimiters PostgREST parses rather than attempting to quote them.
function sanitizeFragment(raw: string): string {
  return raw.replace(/[,()"\\]/g, "").trim();
}

/**
 * The thread monitoring list — METADATA ONLY (no message bodies anywhere in
 * this function). `q` matches participant usernames/display names or listing
 * titles. Newest activity first, ADMIN_PAGE_SIZE per page (0-based `page`).
 */
export async function getAdminThreads({
  q,
  page = 0,
}: {
  q?: string;
  page?: number;
} = {}): Promise<{ items: AdminThreadListItem[]; hasMore: boolean }> {
  const admin = createAdminClient();

  let query = admin
    .from("message_threads")
    .select(THREAD_META_COLUMNS)
    .order("last_message_at", { ascending: false });

  const fragment = q ? sanitizeFragment(q) : "";
  if (fragment) {
    const [userIds, listingIds] = await Promise.all([
      matchUserIds(admin, fragment),
      matchListingIds(admin, fragment),
    ]);
    if (userIds.length === 0 && listingIds.length === 0)
      return { items: [], hasMore: false };
    const arms: string[] = [];
    if (userIds.length > 0) {
      arms.push(`buyer_id.in.(${userIds.join(",")})`);
      arms.push(`seller_id.in.(${userIds.join(",")})`);
    }
    if (listingIds.length > 0)
      arms.push(`listing_id.in.(${listingIds.join(",")})`);
    query = query.or(arms.join(","));
  }

  const from = page * ADMIN_PAGE_SIZE;
  // Fetch one extra row to derive hasMore without a count round-trip.
  const { data, error } = await query.range(from, from + ADMIN_PAGE_SIZE);
  if (error || !data || data.length === 0) return { items: [], hasMore: false };
  const rows = data as unknown as ThreadMetaRow[];
  const hasMore = rows.length > ADMIN_PAGE_SIZE;
  const threads = hasMore ? rows.slice(0, ADMIN_PAGE_SIZE) : rows;

  const threadIds = threads.map((t) => t.id);
  const listingIds = Array.from(new Set(threads.map((t) => t.listing_id)));
  const userIds = Array.from(
    new Set(threads.flatMap((t) => [t.buyer_id, t.seller_id])),
  );

  // Per-thread message COUNT — thread_id column only, never bodies.
  const countByThread = new Map<number, number>();
  const { data: msgRows } = await admin
    .from("messages")
    .select("thread_id")
    .in("thread_id", threadIds);
  for (const m of (msgRows ?? []) as { thread_id: number }[]) {
    countByThread.set(m.thread_id, (countByThread.get(m.thread_id) ?? 0) + 1);
  }

  // "Reported" flag — reports on MESSAGES in these threads (the content key).
  // Embedded join resolves message_id → thread_id; no body column selected.
  const reportedThreads = new Set<number>();
  const { data: reportRows } = await admin
    .from("reports")
    .select("id, messages!inner(thread_id)")
    .not("message_id", "is", null)
    .in("messages.thread_id", threadIds);
  for (const r of (reportRows ?? []) as unknown as {
    messages: { thread_id: number };
  }[]) {
    if (r.messages) reportedThreads.add(r.messages.thread_id);
  }

  const [titleById, nameById] = await Promise.all([
    resolveListingTitles(admin, listingIds),
    resolveNames(admin, userIds),
  ]);

  return {
    items: threads.map((t) => ({
      threadId: t.id,
      listingId: t.listing_id,
      listingTitle: titleById.get(t.listing_id) ?? `#${t.listing_id}`,
      buyerId: t.buyer_id,
      buyerName: nameById.get(t.buyer_id) ?? "(deleted)",
      sellerId: t.seller_id,
      sellerName: nameById.get(t.seller_id) ?? "(deleted)",
      messageCount: countByThread.get(t.id) ?? 0,
      lastMessageAt: t.last_message_at,
      createdAt: t.created_at,
      frozenAt: t.frozen_at,
      hasMessageReport: reportedThreads.has(t.id),
    })),
    hasMore,
  };
}

/** One thread's metadata (no bodies) — the content page's locked-notice data. */
export async function getAdminThreadMeta(
  threadId: number,
): Promise<Omit<AdminThreadListItem, "hasMessageReport"> | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("message_threads")
    .select(THREAD_META_COLUMNS)
    .eq("id", threadId)
    .maybeSingle();
  if (!data) return null;
  const t = data as unknown as ThreadMetaRow;

  const [titleById, nameById, { count }] = await Promise.all([
    resolveListingTitles(admin, [t.listing_id]),
    resolveNames(admin, [t.buyer_id, t.seller_id]),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", t.id),
  ]);

  return {
    threadId: t.id,
    listingId: t.listing_id,
    listingTitle: titleById.get(t.listing_id) ?? `#${t.listing_id}`,
    buyerId: t.buyer_id,
    buyerName: nameById.get(t.buyer_id) ?? "(deleted)",
    sellerId: t.seller_id,
    sellerName: nameById.get(t.seller_id) ?? "(deleted)",
    messageCount: count ?? 0,
    lastMessageAt: t.last_message_at,
    createdAt: t.created_at,
    frozenAt: t.frozen_at,
  };
}

/**
 * THE content-unlock rule (Pitfall 8), in ONE place: content access is
 * justified iff a report exists whose message_id belongs to a message in this
 * thread. A LISTING (or comment) report does NOT unlock chat content. Returns
 * the OLDEST justifying report, or null.
 *
 * Step 1 selects message IDS only — no bodies leave the database here.
 */
export async function getThreadContentJustification(
  threadId: number,
): Promise<ThreadJustification | null> {
  const admin = createAdminClient();

  const { data: msgIds } = await admin
    .from("messages")
    .select("id")
    .eq("thread_id", threadId);
  const ids = ((msgIds ?? []) as { id: number }[]).map((m) => m.id);
  if (ids.length === 0) return null;

  const { data } = await admin
    .from("reports")
    .select("id, reason, detail, created_at")
    .in("message_id", ids)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const r = data as {
    id: number;
    reason: string;
    detail: string | null;
    created_at: string;
  };
  return {
    reportId: r.id,
    reason: r.reason,
    detail: r.detail,
    createdAt: r.created_at,
  };
}

/**
 * Full message bodies + sender names for ONE thread. Called ONLY by the
 * content page, strictly AFTER getThreadContentJustification() returned
 * non-null AND the 'thread_content_access' audit row was written.
 */
export async function getThreadMessagesForAdmin(
  threadId: number,
): Promise<AdminThreadMessage[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as {
    id: number;
    sender_id: string;
    body: string;
    created_at: string;
  }[];
  if (rows.length === 0) return [];

  const nameById = await resolveNames(
    createAdminClient(),
    Array.from(new Set(rows.map((r) => r.sender_id))),
  );
  return rows.map((r) => ({
    id: r.id,
    senderId: r.sender_id,
    senderName: nameById.get(r.sender_id) ?? "(deleted)",
    body: r.body,
    createdAt: r.created_at,
  }));
}

type ContactLogRow = {
  id: number;
  listing_id: number;
  buyer_id: string;
  seller_id: string;
  message_text: string;
  created_at: string;
};

/**
 * The searchable/filterable contact-log table (locked decision: buyer, seller,
 * listing, date range filters + initial-message search). The full message_text
 * is correct here — contact_log IS the admin copy of record (0016 header).
 * `ilike` on message_text (admin volume — no FTS needed).
 */
export async function getAdminContactLogs({
  buyer,
  seller,
  listing,
  from,
  to,
  q,
  page = 0,
}: {
  buyer?: string;
  seller?: string;
  listing?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
} = {}): Promise<{ items: AdminContactLogItem[]; hasMore: boolean }> {
  const admin = createAdminClient();

  let query = admin
    .from("contact_log")
    .select("id, listing_id, buyer_id, seller_id, message_text, created_at")
    .order("created_at", { ascending: false });

  const buyerFrag = buyer ? sanitizeFragment(buyer) : "";
  if (buyerFrag) {
    const ids = await matchUserIds(admin, buyerFrag);
    if (ids.length === 0) return { items: [], hasMore: false };
    query = query.in("buyer_id", ids);
  }
  const sellerFrag = seller ? sanitizeFragment(seller) : "";
  if (sellerFrag) {
    const ids = await matchUserIds(admin, sellerFrag);
    if (ids.length === 0) return { items: [], hasMore: false };
    query = query.in("seller_id", ids);
  }
  const listingFrag = listing ? sanitizeFragment(listing) : "";
  if (listingFrag) {
    const ids = await matchListingIds(admin, listingFrag);
    if (ids.length === 0) return { items: [], hasMore: false };
    query = query.in("listing_id", ids);
  }
  if (from) query = query.gte("created_at", from);
  // `to` is an inclusive date — push the bound to end-of-day.
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);
  const qFrag = q ? sanitizeFragment(q) : "";
  if (qFrag) query = query.ilike("message_text", `%${qFrag}%`);

  const start = page * ADMIN_PAGE_SIZE;
  const { data, error } = await query.range(start, start + ADMIN_PAGE_SIZE);
  if (error || !data || data.length === 0) return { items: [], hasMore: false };
  const all = data as unknown as ContactLogRow[];
  const hasMore = all.length > ADMIN_PAGE_SIZE;
  const rows = hasMore ? all.slice(0, ADMIN_PAGE_SIZE) : all;

  const [titleById, nameById] = await Promise.all([
    resolveListingTitles(
      admin,
      Array.from(new Set(rows.map((r) => r.listing_id))),
    ),
    resolveNames(
      admin,
      Array.from(new Set(rows.flatMap((r) => [r.buyer_id, r.seller_id]))),
    ),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      listingId: r.listing_id,
      listingTitle: titleById.get(r.listing_id) ?? `#${r.listing_id}`,
      buyerId: r.buyer_id,
      buyerUsername: nameById.get(r.buyer_id) ?? "(deleted)",
      sellerId: r.seller_id,
      sellerUsername: nameById.get(r.seller_id) ?? "(deleted)",
      messageText: r.message_text,
      createdAt: r.created_at,
    })),
    hasMore,
  };
}
