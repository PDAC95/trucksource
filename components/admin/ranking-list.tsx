import Link from "next/link";

// ADMA-02/03 rankings. Server component — a styled ordered list with a
// proportional bar beats a chart here (locked plan discretion). Props are
// pre-aggregated label/value rows ONLY; never raw event rows.

export interface RankingItem {
  label: string;
  value: number;
  /** Optional link target (e.g. /admin/listings/[id] for most-viewed). */
  href?: string;
  /** Optional small badge text (e.g. "hidden", "sold"). */
  badge?: string;
}

const FMT = new Intl.NumberFormat("en-US");

export function RankingList({
  items,
  unit,
}: {
  items: RankingItem[];
  unit: string;
}) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No data yet for this range.
      </p>
    );
  }

  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ol className="space-y-2">
      {items.map((item, i) => (
        <li key={`${item.label}-${i}`} className="relative">
          <div
            className="absolute inset-y-0 left-0 rounded bg-muted"
            style={{ width: `${Math.max((item.value / max) * 100, 4)}%` }}
            aria-hidden
          />
          <div className="relative flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
              {item.href ? (
                <Link
                  href={item.href}
                  className="truncate font-medium hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="truncate font-medium">{item.label}</span>
              )}
              {item.badge ? (
                <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-secondary-foreground">
                  {item.badge}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {FMT.format(item.value)} {unit}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
