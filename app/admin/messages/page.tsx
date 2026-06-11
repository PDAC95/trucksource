import Link from "next/link";

import { requireAdmin } from "@/lib/admin/auth";
import {
  getAdminThreads,
  getAdminContactLogs,
} from "@/lib/admin/messaging-queries";
import { ThreadFreezeToggle } from "@/components/admin/thread-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ADMO-04 monitoring surface — two tabs:
//   threads  → METADATA ONLY (participants, listing, count, last activity,
//              Frozen/Reported badges). No message body ever renders here.
//              "View content" links to the audited content page, which
//              enforces the report-justification rule itself — the link being
//              disabled here is UX, not security.
//   contacts → the contact_log table (admin copy of record — full initial
//              message is correct here per the locked decision), filterable by
//              buyer / seller / listing / date range / message text.
export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const TH_CLASS =
  "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const TD_CLASS = "px-3 py-2 align-middle text-sm";

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const tab = first(sp.tab) === "contacts" ? "contacts" : "threads";
  const page = Math.max(0, Number.parseInt(first(sp.page) ?? "0", 10) || 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>

      {/* Link tabs — server-rendered, no client state needed. */}
      <div className="flex gap-1 border-b">
        {(
          [
            { key: "threads", label: "Threads" },
            { key: "contacts", label: "Contact logs" },
          ] as const
        ).map((t) => (
          <Link
            key={t.key}
            href={`/admin/messages?tab=${t.key}`}
            className={cn(
              "-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "threads" ? (
        <ThreadsTab q={first(sp.q)} page={page} />
      ) : (
        <ContactsTab
          buyer={first(sp.buyer)}
          seller={first(sp.seller)}
          listing={first(sp.listing)}
          from={first(sp.from)}
          to={first(sp.to)}
          q={first(sp.q)}
          page={page}
        />
      )}
    </div>
  );
}

async function ThreadsTab({ q, page }: { q?: string; page: number }) {
  const { items, hasMore } = await getAdminThreads({ q, page });

  const baseParams = new URLSearchParams({ tab: "threads" });
  if (q) baseParams.set("q", q);

  return (
    <div className="space-y-4">
      <form method="get" action="/admin/messages" className="flex gap-2">
        <input type="hidden" name="tab" value="threads" />
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by participant or listing title…"
          className="max-w-sm"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[760px] border-collapse">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className={TH_CLASS}>Participants</th>
              <th className={TH_CLASS}>Listing</th>
              <th className={TH_CLASS}>Messages</th>
              <th className={TH_CLASS}>Last activity</th>
              <th className={TH_CLASS}>Status</th>
              <th className={TH_CLASS}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  No threads found.
                </td>
              </tr>
            )}
            {items.map((t) => (
              <tr key={t.threadId} className="hover:bg-muted/30">
                <td className={TD_CLASS}>
                  <span className="font-medium">{t.buyerName}</span>
                  <span className="text-muted-foreground"> ↔ </span>
                  <span className="font-medium">{t.sellerName}</span>
                </td>
                <td className={cn(TD_CLASS, "max-w-[220px] truncate")}>
                  <Link
                    href={`/listings/${t.listingId}`}
                    className="hover:underline"
                  >
                    {t.listingTitle}
                  </Link>
                </td>
                <td className={TD_CLASS}>{t.messageCount}</td>
                <td className={cn(TD_CLASS, "whitespace-nowrap")}>
                  {formatDate(t.lastMessageAt)}
                </td>
                <td className={TD_CLASS}>
                  <div className="flex gap-1">
                    {t.frozenAt && <Badge variant="secondary">Frozen</Badge>}
                    {t.hasMessageReport && (
                      <Badge variant="destructive">Reported</Badge>
                    )}
                  </div>
                </td>
                <td className={TD_CLASS}>
                  <div className="flex items-center gap-2">
                    {t.hasMessageReport ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/messages/threads/${t.threadId}`}>
                          View content
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                        title="Content access requires a report on a message in this thread"
                      >
                        View content
                      </Button>
                    )}
                    <ThreadFreezeToggle
                      threadId={t.threadId}
                      frozen={t.frozenAt !== null}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager
        basePath="/admin/messages"
        params={baseParams}
        page={page}
        hasMore={hasMore}
      />
    </div>
  );
}

async function ContactsTab({
  buyer,
  seller,
  listing,
  from,
  to,
  q,
  page,
}: {
  buyer?: string;
  seller?: string;
  listing?: string;
  from?: string;
  to?: string;
  q?: string;
  page: number;
}) {
  const { items, hasMore } = await getAdminContactLogs({
    buyer,
    seller,
    listing,
    from,
    to,
    q,
    page,
  });

  const baseParams = new URLSearchParams({ tab: "contacts" });
  for (const [k, v] of Object.entries({
    buyer,
    seller,
    listing,
    from,
    to,
    q,
  })) {
    if (v) baseParams.set(k, v);
  }

  return (
    <div className="space-y-4">
      {/* Filter bar — buyer / seller / listing / date range / message search
          (the LOCKED contact-log filter set). Plain GET form: shareable URLs. */}
      <form
        method="get"
        action="/admin/messages"
        className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-7"
      >
        <input type="hidden" name="tab" value="contacts" />
        <Input name="buyer" defaultValue={buyer ?? ""} placeholder="Buyer" />
        <Input name="seller" defaultValue={seller ?? ""} placeholder="Seller" />
        <Input
          name="listing"
          defaultValue={listing ?? ""}
          placeholder="Listing title"
        />
        <Input
          name="from"
          type="date"
          defaultValue={from ?? ""}
          aria-label="From date"
        />
        <Input
          name="to"
          type="date"
          defaultValue={to ?? ""}
          aria-label="To date"
        />
        <Input name="q" defaultValue={q ?? ""} placeholder="Message text" />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[760px] border-collapse">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className={TH_CLASS}>Date</th>
              <th className={TH_CLASS}>Buyer</th>
              <th className={TH_CLASS}>Seller</th>
              <th className={TH_CLASS}>Listing</th>
              <th className={TH_CLASS}>Initial message</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  No contact logs found.
                </td>
              </tr>
            )}
            {items.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className={cn(TD_CLASS, "whitespace-nowrap")}>
                  {formatDate(c.createdAt)}
                </td>
                <td className={TD_CLASS}>{c.buyerUsername}</td>
                <td className={TD_CLASS}>{c.sellerUsername}</td>
                <td className={cn(TD_CLASS, "max-w-[200px] truncate")}>
                  <Link
                    href={`/listings/${c.listingId}`}
                    className="hover:underline"
                  >
                    {c.listingTitle}
                  </Link>
                </td>
                <td className={cn(TD_CLASS, "max-w-[360px]")}>
                  <p className="line-clamp-2 whitespace-pre-wrap">
                    {c.messageText}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager
        basePath="/admin/messages"
        params={baseParams}
        page={page}
        hasMore={hasMore}
      />
    </div>
  );
}

function Pager({
  basePath,
  params,
  page,
  hasMore,
}: {
  basePath: string;
  params: URLSearchParams;
  page: number;
  hasMore: boolean;
}) {
  if (page === 0 && !hasMore) return null;
  const withPage = (p: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    return `${basePath}?${next.toString()}`;
  };
  return (
    <div className="flex items-center justify-between">
      {page > 0 ? (
        <Button asChild size="sm" variant="outline">
          <Link href={withPage(page - 1)}>Previous</Link>
        </Button>
      ) : (
        <span />
      )}
      {hasMore && (
        <Button asChild size="sm" variant="outline">
          <Link href={withPage(page + 1)}>Next</Link>
        </Button>
      )}
    </div>
  );
}
