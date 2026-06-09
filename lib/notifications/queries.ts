// Owner-scoped in-app notifications read surface (the durable record written by the
// near-expiry cron route in 5.1-05; Phase 9/10 extend `kind` for chat/admin).
//
// PRIVACY / AUTHZ: a plain async lib (no "use server") using the COOKIE-bound server
// client. The notifications table's owner-SELECT RLS policy ((select auth.uid()) =
// user_id) scopes rows — another user cannot read these. NO service-role client here:
// reads are owner-scoped by RLS (the service-role admin client is used ONLY by the
// cron route to INSERT, since the table has no authenticated INSERT policy).
import { createClient } from "@/lib/supabase/server";

export type Notification = {
  id: number;
  kind: string;
  listingId: number | null;
  body: string;
  readAt: string | null;
  createdAt: string;
};

type NotificationRow = {
  id: number;
  kind: string;
  listing_id: number | null;
  body: string;
  read_at: string | null;
  created_at: string;
};

/**
 * The caller's own notifications, newest first. Returns [] when unauthenticated
 * (no claims) — the page renders an empty inbox rather than erroring. The owner
 * SELECT policy means even with a stray user_id filter omitted, RLS only ever
 * returns the caller's rows; we still pass no cross-user scope and rely on RLS.
 */
export async function listMyNotifications(): Promise<Notification[]> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, listing_id, body, read_at, created_at")
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  return (data as NotificationRow[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    listingId: r.listing_id,
    body: r.body,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
}

/**
 * Count of the caller's UNREAD notifications (read_at is null). 0 when
 * unauthenticated. Owner-scoped by the same RLS SELECT policy.
 */
export async function unreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return 0;

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error || count == null) return 0;
  return count;
}
