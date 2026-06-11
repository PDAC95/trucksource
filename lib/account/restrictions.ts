import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Own-restriction reader with the LAZY EXPIRY sweep (ADMO-01, Pitfall 3 —
// pg_cron is unscheduled on Staging, so nothing ever flips a flag on a timer).
// "Currently restricted" is ALWAYS computed:
//   banned  → restricted forever (until an admin reactivates)
//   suspended AND suspended_until > now() → restricted
//   suspended AND suspended_until <= now() → EXPIRED: sweep + return null
//
// SERVICE-ROLE NOTE: the sweep deletes the user_restrictions row and restores
// suspension-hidden listings — both are service-role-only writes (the table
// has zero write policies by design). Importing createAdminClient here is
// sanctioned: this is a `server-only` trusted module, the sweep only ever
// targets the CALLER's own expired restriction, and no PII is read.

export type OwnRestriction = {
  state: "suspended" | "banned";
  reason: string;
  /** ISO timestamp; null for bans. */
  suspendedUntil: string | null;
};

/**
 * The caller's active restriction, or null. Reading goes through the normal
 * cookie-bound client (self-select RLS on user_restrictions); an expired
 * suspension is cleaned up inline — the user regains access and their
 * suspension-hidden listings are restored without any cron.
 */
export async function getOwnRestriction(): Promise<OwnRestriction | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("user_restrictions")
    .select("state, reason, suspended_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;

  const row = data as {
    state: "suspended" | "banned";
    reason: string;
    suspended_until: string | null;
  };

  if (row.state === "banned") {
    return { state: "banned", reason: row.reason, suspendedUntil: null };
  }

  const stillActive =
    row.suspended_until !== null && new Date(row.suspended_until) > new Date();
  if (stillActive) {
    return {
      state: "suspended",
      reason: row.reason,
      suspendedUntil: row.suspended_until,
    };
  }

  // EXPIRED suspension → lazy sweep: drop the row, restore ONLY the listings
  // this suspension hid ('moderation' / 'ban' rows are never touched). Both
  // best-effort: if either write fails the user still reads as unrestricted
  // (the predicate above is the truth), and the next visit retries.
  try {
    const admin = createAdminClient();
    await admin.from("user_restrictions").delete().eq("user_id", userId);
    await admin
      .from("listings")
      .update({ hidden_at: null, hidden_reason: null })
      .eq("seller_id", userId)
      .eq("hidden_reason", "suspension");
  } catch (err) {
    console.error("[restrictions] lazy-expiry sweep failed:", err);
  }
  return null;
}
