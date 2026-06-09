import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isExpiringSoon } from "@/lib/listings/lifecycle";

// LIST-09 near-expiry NOTIFY job — the app-side half of the lifecycle (the pure-SQL
// active->expired flip is the pg_cron job in migration 0011). Runs daily via Vercel
// Cron (vercel.json). For each active listing ~7 days from expiry that hasn't already
// been notified for this expiry cycle, it: (1) emails the seller via Resend (best-
// effort), and (2) inserts a durable in-app `notifications` row (kind='listing_expiring').
//
// SECURITY (Pitfall 6 / invariant): this is the FIRST service-role use in the phase.
// The route is GUARDED FIRST by the CRON_SECRET — an unauthenticated caller is rejected
// with 401 and NO work runs (no emails, no inserts). It then uses the service-role admin
// client (lib/supabase/admin.ts, server-only) because the notifications table has NO
// authenticated INSERT policy by design (rows are written by the system, not a user),
// and because resolving the seller's email is the one legitimate server-only PII read
// (profiles_private.email) — never exposed in any response.

export const dynamic = "force-dynamic"; // never cached; runs the job per invocation

const SEVEN_DAYS_MS = 7 * 864e5;

type CandidateRow = {
  id: number;
  title: string;
  seller_id: string;
  expires_at: string | null;
};

export async function GET(request: NextRequest) {
  // 1) GUARD FIRST — reject anything without the exact Bearer CRON_SECRET.
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== expected
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  // 2) Candidate set: active listings whose expires_at is within the next ~7 days
  //    (and not already past). The DB window keeps the scan small; isExpiringSoon
  //    is the single source of truth for the boundary (shared with the UI).
  const windowEnd = new Date(now.getTime() + SEVEN_DAYS_MS).toISOString();
  const { data: candData, error: candErr } = await admin
    .from("listings")
    .select("id, title, seller_id, expires_at")
    .eq("status", "active")
    .gt("expires_at", now.toISOString())
    .lte("expires_at", windowEnd);
  if (candErr) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  const candidates = ((candData ?? []) as CandidateRow[]).filter((l) =>
    isExpiringSoon("active", l.expires_at, now),
  );
  if (candidates.length === 0) {
    return NextResponse.json({ notified: 0 });
  }

  // 3) NOTIFY-ONCE: drop any listing that already has a 'listing_expiring'
  //    notification (left-anti-join done in JS — fetch existing for the candidate
  //    ids, then diff). A renew/reactivate gives a NEW expires_at; a fresh cycle
  //    would re-notify only if no listing_expiring row exists, which is the
  //    intended single-reminder-per-cycle behavior for v1 (a renewed listing is
  //    no longer in the 7-day window, so it won't re-enter until its next cycle).
  const candidateIds = candidates.map((c) => c.id);
  const { data: existing } = await admin
    .from("notifications")
    .select("listing_id")
    .eq("kind", "listing_expiring")
    .in("listing_id", candidateIds);
  const alreadyNotified = new Set(
    (existing ?? []).map((r: { listing_id: number | null }) => r.listing_id),
  );
  const toNotify = candidates.filter((c) => !alreadyNotified.has(c.id));
  if (toNotify.length === 0) {
    return NextResponse.json({ notified: 0 });
  }

  // 4) Resolve seller emails — the ONE legitimate server-only PII read, via the
  //    admin client only. Never returned in the response.
  const sellerIds = [...new Set(toNotify.map((l) => l.seller_id))];
  const { data: privRows } = await admin
    .from("profiles_private")
    .select("id, email")
    .in("id", sellerIds);
  const emailById = new Map(
    (privRows ?? []).map((r: { id: string; email: string | null }) => [
      r.id,
      r.email,
    ]),
  );

  // 5) Per listing: best-effort Resend email + durable in-app notification insert.
  let notified = 0;
  for (const listing of toNotify) {
    const days = Math.max(
      1,
      Math.ceil(
        (new Date(listing.expires_at as string).getTime() - now.getTime()) /
          864e5,
      ),
    );

    // Best-effort email — a failure logs but NEVER aborts the batch. The email
    // NOTIFIES; the renew action happens in-app (auth-safe), NOT a one-click link.
    const to = emailById.get(listing.seller_id);
    if (to && process.env.RESEND_API_KEY) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "onboarding@resend.dev",
            to,
            subject: `Your listing "${listing.title}" expires in ~${days} days — renew in one click`,
            text: `Your listing "${listing.title}" expires in about ${days} days. Sign in to Take-Off Parts and open My Listings to renew it in one click before it expires. https://takeoffparts.com/sell/listings`,
          }),
        });
      } catch {
        // Swallow: a Resend outage must not block the in-app notification.
      }
    }

    // Durable in-app record (the inbox-grade row Phase 9/10 reuse). Service-role
    // insert because the table has no authenticated INSERT policy by design.
    const { error: insErr } = await admin.from("notifications").insert({
      user_id: listing.seller_id,
      kind: "listing_expiring",
      listing_id: listing.id,
      body: `Your listing "${listing.title}" expires in ~${days} days. Renew it from My Listings.`,
    });
    if (!insErr) notified += 1;
  }

  return NextResponse.json({ notified });
}
