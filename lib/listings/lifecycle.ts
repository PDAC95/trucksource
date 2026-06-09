// Listing lifecycle predicates (LIST-09).
//
// Pure, DB-free logic the renew/reactivate Server Actions and the daily
// expiry-flip cron (later plans) reuse. Keeping the predicate here — not inline
// in SQL only — lets it be unit-tested and shared.

/**
 * Whether an `active` listing past its `expires_at` should flip to `expired`.
 *
 * ONLY active listings expire (Pitfall 3): `sold` is terminal (no clock) and an
 * already-`expired` row is terminal until reactivated. Mirrors the cron's
 * `where status='active' and expires_at <= now()` predicate exactly.
 */
export function shouldExpire(
  status: string,
  expiresAt: Date,
  now: Date,
): boolean {
  return status === "active" && expiresAt <= now;
}
