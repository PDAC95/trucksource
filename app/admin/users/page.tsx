import Link from "next/link";
import { Search } from "lucide-react";

import { getAdminUsers } from "@/lib/admin/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Admin user list (ADMO-01). The admin layout gates rendering via
// requireAdmin(); the queries are service-role but PII-free by construction
// (Pitfall 7 — no email/name/phone column ever reaches this table).
export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function RestrictionBadge({
  restriction,
}: {
  restriction: {
    state: "suspended" | "banned";
    suspendedUntil: string | null;
  } | null;
}) {
  if (!restriction) {
    return <Badge variant="outline">Active</Badge>;
  }
  if (restriction.state === "banned") {
    return <Badge variant="destructive">Banned</Badge>;
  }
  return (
    <Badge variant="secondary">
      Suspended until{" "}
      {restriction.suspendedUntil
        ? formatDate(restriction.suspendedUntil)
        : "—"}
    </Badge>
  );
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const page = Number(params.page) || 1;

  const { users, hasMore } = await getAdminUsers({ q, page });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <form method="GET" className="flex items-center gap-2">
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search username or email…"
            className="w-64"
            aria-label="Search users"
          />
          <Button type="submit" variant="secondary" size="sm">
            <Search className="size-4" />
            Search
          </Button>
        </form>
      </div>

      {users.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          {q ? `No users match “${q}”.` : "No users yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-3 py-2 font-medium">Username</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium">Member since</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {u.username}
                    </Link>
                    {u.displayName && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        shown as “{u.displayName}”
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {u.stateProvince}, {u.country}
                  </td>
                  <td className="px-3 py-2">{formatDate(u.memberSince)}</td>
                  <td className="px-3 py-2">
                    <RestrictionBadge restriction={u.restriction} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/admin/users?${new URLSearchParams({
                  ...(q ? { q } : {}),
                  page: String(page - 1),
                }).toString()}`}
              >
                Previous
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {hasMore && (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/admin/users?${new URLSearchParams({
                  ...(q ? { q } : {}),
                  page: String(page + 1),
                }).toString()}`}
              >
                Next
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
