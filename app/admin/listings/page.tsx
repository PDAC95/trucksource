import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getAdminListings,
  ADMIN_LISTINGS_PAGE_SIZE,
} from "@/lib/admin/listings-queries";
import { bulkPublishDraftsFromForm } from "@/lib/actions/admin/listings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Admin listing index (ADMO-02): filter by status (incl. Draft) and hidden
// state, search title/seller, jump into the moderation detail. When filtered
// to drafts it becomes the locked one-click bulk-publish surface (the second
// half of the CSV-import flow).
export const dynamic = "force-dynamic";

const STATUSES = ["draft", "active", "sold", "expired"] as const;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "active":
      return "default";
    case "draft":
      return "outline";
    case "sold":
      return "secondary";
    default:
      return "secondary"; // expired
  }
}

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    hidden?: string;
    q?: string;
    page?: string;
  }>;
}) {
  await requireAdmin(); // security gate — the layout gate is UX only

  const params = await searchParams;
  const status = (STATUSES as readonly string[]).includes(params.status ?? "")
    ? params.status
    : undefined;
  const hidden = params.hidden === "1";
  const q = params.q?.trim() || undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const { rows, total } = await getAdminListings({ status, hidden, q, page });
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_LISTINGS_PAGE_SIZE));
  const isDraftView = status === "draft";

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (hidden) sp.set("hidden", "1");
    if (q) sp.set("q", q);
    sp.set("page", String(p));
    return `/admin/listings?${sp.toString()}`;
  };

  const inputClass =
    "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  const table = (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            {isDraftView && <th className="w-10 px-3 py-2" />}
            <th className="w-14 px-3 py-2" />
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Seller</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Listed</th>
            <th className="px-3 py-2 font-medium">Expires</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={isDraftView ? 7 : 6}
                className="px-3 py-8 text-center text-muted-foreground"
              >
                No listings match these filters.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id} className="border-b last:border-b-0">
              {isDraftView && (
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    name="ids"
                    value={row.id}
                    aria-label={`Select ${row.title}`}
                    className="size-4 accent-primary"
                  />
                </td>
              )}
              <td className="px-3 py-2">
                {row.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.coverUrl}
                    alt=""
                    className="size-10 rounded object-cover"
                  />
                ) : (
                  <div className="size-10 rounded bg-muted" />
                )}
              </td>
              <td className="max-w-[28rem] px-3 py-2">
                <Link
                  href={`/admin/listings/${row.id}`}
                  className="font-medium hover:underline"
                >
                  {row.title}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {row.sellerUsername}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-1">
                  <Badge variant={statusBadgeVariant(row.status)}>
                    {row.status}
                  </Badge>
                  {row.hiddenAt && (
                    <Badge variant="destructive">
                      Hidden{row.hiddenReason ? ` (${row.hiddenReason})` : ""}
                    </Badge>
                  )}
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                {formatDate(row.dateListed)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                {formatDate(row.expiresAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Listings</h1>
        <p className="text-sm text-muted-foreground">
          {total} listing{total === 1 ? "" : "s"}
        </p>
      </div>

      {/* Filter bar — a plain GET form; filters live in the URL. */}
      <form
        method="get"
        action="/admin/listings"
        className="flex flex-wrap items-center gap-2"
      >
        <select
          name="status"
          defaultValue={status ?? ""}
          className={inputClass}
          aria-label="Status filter"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <label className="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm shadow-sm">
          <input
            type="checkbox"
            name="hidden"
            value="1"
            defaultChecked={hidden}
            className="size-4 accent-primary"
          />
          Hidden only
        </label>
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search title or seller…"
          className={`${inputClass} w-64`}
          aria-label="Search listings"
        />
        <Button type="submit" variant="secondary" size="sm">
          Filter
        </Button>
      </form>

      {isDraftView ? (
        // Draft view = the locked one-click bulk-publish surface. The checked
        // rows submit to bulkPublishDraftsFromForm → bulkPublishDrafts (which
        // re-gates with requireAdmin and re-validates the ids).
        <form action={bulkPublishDraftsFromForm} className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-dashed bg-muted/30 px-3 py-2">
            <p className="text-sm text-muted-foreground">
              Select drafts to publish — sets active, list date and the 90-day
              expiry in one click. Drafts with fewer than 3 photos are skipped
              and stay in this list.
            </p>
            <Button type="submit" size="sm">
              Publish selected
            </Button>
          </div>
          {table}
        </form>
      ) : (
        table
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="hover:underline">
              Previous
            </Link>
          )}
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="hover:underline">
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
