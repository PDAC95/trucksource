// lib/messaging/queries.ts — the zero-PII messaging read surface (MSG-05/06).
//
// Server-side readers on the cookie-bound client: RLS (0016_messaging.sql)
// scopes every read to the thread participant, so a non-participant gets zero
// rows — never an error that leaks existence.
//
// PRIVACY (CLAUDE.md invariant #1, MSG-06): every shape below carries ONLY
// auth UUIDs, public usernames (via profiles_public + resolvePublicName),
// listing-card fields, and message bodies. Enumerated columns ONLY — never a
// star-select, never the owner-only PII table. The 09-04 contract test asserts
// these exact exported shapes stay PII-free; keep them stable.
//
// Hydration posture clones lib/saves/queries.ts: one batched read per
// dimension keyed by ids (no N+1).
import { createClient } from "@/lib/supabase/server";
import { listingPhotoPublicUrl } from "@/lib/listings/storage";
import { resolvePublicName } from "@/lib/seller/badge";

/**
 * One chat message row — EXACTLY the columns the realtime payload carries
 * (thread_id/sender_id/body/created_at + id). Zero PII by construction; the
 * thread-view client component renders sender identity from a UUID → public
 * name map, never from this row.
 */
export type MessageRow = {
  id: number;
  thread_id: number;
  sender_id: string;
  body: string;
  created_at: string;
};

/** The inbox row (/messages list). */
export type ThreadListItem = {
  threadId: number;
  listingId: number;
  listingTitle: string;
  listingPrice: number | null;
  listingStatus: string;
  listingPhotoUrl: string | null;
  /** The OTHER participant's public name — coalesce(display_name, username). */
  counterpartyName: string;
  counterpartyId: string;
  lastMessageSnippet: string | null;
  lastMessageAt: string;
  unread: boolean;
  viewerRole: "buyer" | "seller";
};

/** The single-thread view (/messages/[threadId]). */
export type ThreadView = {
  threadId: number;
  listingId: number;
  listingTitle: string;
  listingPrice: number | null;
  listingStatus: string;
  listingPhotoUrl: string | null;
  viewerRole: "buyer" | "seller";
  buyerId: string;
  sellerId: string;
  /** Public names for BOTH sides — the sender-identity map for the chat UI. */
  buyerName: string;
  sellerName: string;
  counterpartyId: string;
  counterpartyName: string;
  /** The viewer-side read watermark (drives markThreadRead / unread state). */
  viewerLastReadAt: string | null;
  /** Handle to the immutable contact record (seller's initial-contact context). */
  contactLogId: number;
  /** Moderation freeze (ADMO-04): when set, BOTH sides see a closed composer. */
  frozenAt: string | null;
};

// The enumerated message_threads row every reader works from. NON-PII: ids,
// timestamps, and watermarks only.
type ThreadRow = {
  id: number;
  listing_id: number;
  buyer_id: string;
  seller_id: string;
  contact_log_id: number;
  last_message_at: string;
  buyer_last_read_at: string | null;
  seller_last_read_at: string | null;
  buyer_hidden_at: string | null;
  seller_hidden_at: string | null;
  frozen_at: string | null;
};

const THREAD_COLUMNS =
  "id, listing_id, buyer_id, seller_id, contact_log_id, last_message_at, " +
  "buyer_last_read_at, buyer_hidden_at, seller_last_read_at, seller_hidden_at, " +
  "frozen_at";

type ListingCardRow = {
  id: number;
  title: string;
  asking_price: number | string | null;
  status: string;
};

// Batched listing-card hydration: enumerated listings read (ANY status — a
// thread on a sold listing still renders) + cover photo (lowest sort_order),
// cloned from lib/saves/queries.ts.
async function hydrateListings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listingIds: number[],
): Promise<{
  listingById: Map<number, ListingCardRow>;
  coverByListing: Map<number, string>;
}> {
  const listingById = new Map<number, ListingCardRow>();
  const coverByListing = new Map<number, string>();
  if (listingIds.length === 0) return { listingById, coverByListing };

  const { data: listingData } = await supabase
    .from("listings")
    .select("id, title, asking_price, status")
    .in("id", listingIds);
  for (const l of (listingData ?? []) as ListingCardRow[]) {
    listingById.set(l.id, l);
  }

  const { data: photoData } = await supabase
    .from("listing_photos")
    .select("listing_id, storage_path, sort_order")
    .in("listing_id", listingIds)
    .order("sort_order", { ascending: true });
  for (const p of (photoData ?? []) as {
    listing_id: number;
    storage_path: string;
  }[]) {
    if (!coverByListing.has(p.listing_id)) {
      coverByListing.set(
        p.listing_id,
        listingPhotoPublicUrl(supabase, p.storage_path),
      );
    }
  }

  return { listingById, coverByListing };
}

// Batched public-name resolution — profiles_public ENUMERATED columns only
// (id, username, display_name); never the owner-only PII table (invariant #1).
async function resolvePublicNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userIds: string[],
): Promise<Map<string, string>> {
  const nameById = new Map<string, string>();
  if (userIds.length === 0) return nameById;

  const { data } = await supabase
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

// Viewer-side unread derivation (the watermark approximation, v1-acceptable):
// the last message landed after the viewer's read watermark AND — when the
// last sender is cheaply known — that sender isn't the viewer themself.
function isUnread(
  thread: ThreadRow,
  viewerId: string,
  lastSenderId?: string,
): boolean {
  const watermark =
    thread.buyer_id === viewerId
      ? thread.buyer_last_read_at
      : thread.seller_last_read_at;
  const unreadByWatermark =
    watermark === null ||
    new Date(thread.last_message_at) > new Date(watermark);
  if (!unreadByWatermark) return false;
  if (lastSenderId !== undefined && lastSenderId === viewerId) return false;
  return true;
}

/**
 * The viewer's inbox: threads they participate in whose viewer-side hidden
 * flag is unset (hide ≠ delete, MSG-04), newest activity first, hydrated into
 * the inbox-row shape. Returns [] on error or when unauthenticated (RLS
 * already returns zero rows for non-participants).
 */
export async function getMyThreads(
  viewerId: string,
): Promise<ThreadListItem[]> {
  const supabase = await createClient();

  // 1) The viewer's visible threads. The .or() encodes "my side isn't hidden";
  //    participant RLS independently re-scopes the read.
  const { data, error } = await supabase
    .from("message_threads")
    .select(THREAD_COLUMNS)
    .or(
      `and(buyer_id.eq.${viewerId},buyer_hidden_at.is.null),` +
        `and(seller_id.eq.${viewerId},seller_hidden_at.is.null)`,
    )
    .order("last_message_at", { ascending: false });
  if (error || !data || data.length === 0) return [];
  const threads = data as unknown as ThreadRow[];

  const threadIds = threads.map((t) => t.id);
  const listingIds = Array.from(new Set(threads.map((t) => t.listing_id)));
  const counterpartyIds = Array.from(
    new Set(
      threads.map((t) => (t.buyer_id === viewerId ? t.seller_id : t.buyer_id)),
    ),
  );

  // 2) Latest message per thread (snippet + last sender) — one batched read,
  //    reduced in JS (first row per thread wins; v1-fine for inbox sizes).
  const { data: msgData } = await supabase
    .from("messages")
    .select("thread_id, sender_id, body, created_at")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: false });
  const lastByThread = new Map<number, { sender_id: string; body: string }>();
  for (const m of (msgData ?? []) as {
    thread_id: number;
    sender_id: string;
    body: string;
  }[]) {
    if (!lastByThread.has(m.thread_id)) lastByThread.set(m.thread_id, m);
  }

  // 3+4) Listing cards + counterparty public names, batched.
  const [{ listingById, coverByListing }, nameById] = await Promise.all([
    hydrateListings(supabase, listingIds),
    resolvePublicNames(supabase, counterpartyIds),
  ]);

  const items: ThreadListItem[] = [];
  for (const t of threads) {
    const listing = listingById.get(t.listing_id);
    if (!listing) continue; // listing row vanished entirely
    const counterpartyId = t.buyer_id === viewerId ? t.seller_id : t.buyer_id;
    const last = lastByThread.get(t.id);
    items.push({
      threadId: t.id,
      listingId: t.listing_id,
      listingTitle: listing.title,
      listingPrice:
        listing.asking_price === null ? null : Number(listing.asking_price),
      listingStatus: listing.status,
      listingPhotoUrl: coverByListing.get(t.listing_id) ?? null,
      counterpartyName: nameById.get(counterpartyId) ?? "",
      counterpartyId,
      lastMessageSnippet: last?.body ?? null,
      lastMessageAt: t.last_message_at,
      unread: isUnread(t, viewerId, last?.sender_id),
      viewerRole: t.buyer_id === viewerId ? "buyer" : "seller",
    });
  }
  return items;
}

/**
 * One thread for its participant viewer: listing card + BOTH participants'
 * public names + the viewer's role. Returns null when the viewer is not a
 * participant — RLS yields zero rows, so nonexistent and forbidden are
 * indistinguishable (no existence leak).
 */
export async function getThreadForViewer(
  threadId: number,
  viewerId: string,
): Promise<ThreadView | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("message_threads")
    .select(THREAD_COLUMNS)
    .eq("id", threadId)
    .maybeSingle();
  if (error || !data) return null;
  const t = data as unknown as ThreadRow;
  // RLS already guarantees participation; this re-check is defense in depth.
  if (t.buyer_id !== viewerId && t.seller_id !== viewerId) return null;

  const [{ listingById, coverByListing }, nameById] = await Promise.all([
    hydrateListings(supabase, [t.listing_id]),
    resolvePublicNames(supabase, [t.buyer_id, t.seller_id]),
  ]);
  const listing = listingById.get(t.listing_id);
  if (!listing) return null;

  const viewerRole: "buyer" | "seller" =
    t.buyer_id === viewerId ? "buyer" : "seller";
  const counterpartyId = viewerRole === "buyer" ? t.seller_id : t.buyer_id;

  return {
    threadId: t.id,
    listingId: t.listing_id,
    listingTitle: listing.title,
    listingPrice:
      listing.asking_price === null ? null : Number(listing.asking_price),
    listingStatus: listing.status,
    listingPhotoUrl: coverByListing.get(t.listing_id) ?? null,
    viewerRole,
    buyerId: t.buyer_id,
    sellerId: t.seller_id,
    buyerName: nameById.get(t.buyer_id) ?? "",
    sellerName: nameById.get(t.seller_id) ?? "",
    counterpartyId,
    counterpartyName: nameById.get(counterpartyId) ?? "",
    viewerLastReadAt:
      viewerRole === "buyer" ? t.buyer_last_read_at : t.seller_last_read_at,
    contactLogId: t.contact_log_id,
    frozenAt: t.frozen_at,
  };
}

/**
 * A thread's messages, oldest first. RLS gates access (non-participants get
 * []); rows carry only UUIDs + bodies (MSG-06).
 */
export async function getThreadMessages(
  threadId: number,
): Promise<MessageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, thread_id, sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as unknown as MessageRow[];
}

/**
 * The existing thread for (listing, buyer), if any — one indexed lookup on the
 * unique pair. Powers the re-contact dedupe (submitContact step 5) and the
 * "View conversation" CTA.
 */
export async function getExistingThreadId(
  listingId: number,
  buyerId: string,
): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("message_threads")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", buyerId)
    .maybeSingle();
  return (data as { id: number } | null)?.id ?? null;
}

/**
 * How many visible threads have unread activity for the viewer — the header
 * badge count. One enumerated non-PII read (ids + timestamps only), reduced in
 * JS: PostgREST can't compare two columns (last_message_at vs the viewer-side
 * watermark) in a filter, and per-user thread counts are small. Cheap enough
 * for per-request header render.
 */
export async function unreadThreadCount(viewerId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_threads")
    .select(THREAD_COLUMNS)
    .or(
      `and(buyer_id.eq.${viewerId},buyer_hidden_at.is.null),` +
        `and(seller_id.eq.${viewerId},seller_hidden_at.is.null)`,
    );
  if (error || !data) return 0;
  let count = 0;
  for (const t of data as unknown as ThreadRow[]) {
    if (isUnread(t, viewerId)) count += 1;
  }
  return count;
}
