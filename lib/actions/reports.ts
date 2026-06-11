"use server";

import { createClient } from "@/lib/supabase/server";
import { reportSchema } from "@/lib/messaging/schema";
import { sendAdminReportCopy } from "@/lib/messaging/notify";

// Abuse-report trust boundary (MSG-07) — clones lib/actions/comments.ts.
//
// IDENTITY: getClaims() only (CLAUDE.md invariant #6). Writes go through the
// cookie-bound user client, so the reports RLS INSERT policy (0016_messaging)
// is the authorization boundary: self-attribution PLUS, for message targets,
// thread participation — message ids are guessable bigints, and without that
// policy anyone could probe/report arbitrary private messages. A policy
// violation here deliberately collapses to not_found (no existence leak).
//
// DEDUPE: one report per user per item is STRUCTURAL (partial unique indexes
// reports_once_{listing,comment,message}); a 23505 from the insert is the
// expected "already reported" path, not an error.
//
// ADMIN EMAIL: best-effort courtesy AFTER the durable insert — the reports row
// is the copy of record for the Phase-10 queue (notify.ts posture).

// Generous daily cap — head-count of the caller's OWN reports in the trailing
// 24h (comments.ts rate-limit pattern).
const REPORT_DAILY_LIMIT = 10;
const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

// targetType → exclusive-arc column (exactly one is non-null per row).
const TARGET_COLUMNS = {
  listing: "listing_id",
  comment: "comment_id",
  message: "message_id",
} as const;

export type SubmitReportResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "invalid"
        | "rate_limited"
        | "already_reported"
        | "not_found";
    };

/**
 * Report a listing, comment, or message. Guard ORDER (the unit test asserts
 * it):
 *   1. getClaims identity (else unauthenticated)
 *   2. reportSchema re-validation (else invalid) — same schema as the client
 *   3. rate limit: >= REPORT_DAILY_LIMIT own reports in 24h (rate_limited)
 *   4. self-attributed insert into the mapped target column; 23505 (partial
 *      unique index) → already_reported; any other rejection (missing target
 *      FK, RLS message-participant policy) → not_found — no existence leak
 *   5. best-effort admin email AFTER the successful insert
 * No revalidatePath — nothing on screen changes beyond the toast.
 */
export async function submitReport(
  input: unknown,
): Promise<SubmitReportResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  // 3) RATE LIMIT — head-count of the caller's own reports in the window.
  const windowStart = new Date(Date.now() - REPORT_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("reporter_id", userId)
    .gte("created_at", windowStart);
  if ((count ?? 0) >= REPORT_DAILY_LIMIT)
    return { ok: false, error: "rate_limited" };

  // 4) SELF-ATTRIBUTED INSERT — exactly one target column set (exclusive arc).
  const { data: inserted, error } = await supabase
    .from("reports")
    .insert({
      reporter_id: userId,
      [TARGET_COLUMNS[v.targetType]]: v.targetId,
      reason: v.reason,
      detail: v.detail ?? null,
    })
    .select("id, created_at")
    .single();
  if (error || !inserted) {
    // Unique-violation = the friendly, expected "already reported" path.
    if ((error as { code?: string } | null)?.code === "23505")
      return { ok: false, error: "already_reported" };
    // FK miss or RLS policy rejection — collapse, no existence leak.
    return { ok: false, error: "not_found" };
  }
  const row = inserted as { id: number; created_at: string };

  // 5) ADMIN EMAIL — best-effort; the reports row is the copy of record.
  // Username resolves from the PUBLIC profile only (privacy invariant #1).
  const { data: profile } = await supabase
    .from("profiles_public")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  await sendAdminReportCopy({
    reportId: row.id,
    reporterUsername:
      (profile as { username: string | null } | null)?.username ??
      "(no username)",
    targetType: v.targetType,
    targetId: v.targetId,
    reason: v.reason,
    detail: v.detail,
    createdAt: row.created_at,
  });

  return { ok: true };
}
