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

const DAY_MS = 864e5; // 24 * 60 * 60 * 1000

/**
 * Whole days from `now` until `expiresAt`, rounded UP (ceil). A listing that
 * expires in 6 days and 1 hour reports 7; one that expires in exactly N*DAY
 * reports N. Can be 0 (expires within the next hour) or negative (already past).
 *
 * Pure + DB-free so the UI ("Expires in X days") and tests share one definition.
 */
export function daysUntil(
  expiresAt: string | Date,
  now: Date = new Date(),
): number {
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return Math.ceil((expiry.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Whether an active listing is in its ~7-day pre-expiry window — the only time
 * the seller sees a countdown + Renew (CONTEXT: no countdown on healthy
 * listings, the system handles expiry automatically until it's near).
 *
 * True only when: status === 'active' AND expiresAt is set AND it expires within
 * the next 7 days AND has not already passed (d > 0). A normal active listing
 * (>7 days out) is NOT "expiring soon"; an already-past one is handled by the
 * expire-flip cron / the 'expired' status, not here.
 */
export function isExpiringSoon(
  status: string,
  expiresAt: string | null,
  now: Date = new Date(),
): boolean {
  if (status !== "active" || expiresAt == null) return false;
  const d = daysUntil(expiresAt, now);
  return d <= 7 && d > 0;
}
