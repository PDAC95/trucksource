import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getAdminUserDetailWithPII } from "@/lib/admin/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Admin user detail (ADMO-01) — the ONE surface that shows PII, fed by the
// loudly-named getAdminUserDetailWithPII. The admin layout gates rendering;
// enforcement ACTIONS re-gate themselves with requireAdmin().
export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const user = await getAdminUserDetailWithPII(id);
  if (!user) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/users"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" /> Users
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {user.username}
        </h1>
        {user.restriction ? (
          user.restriction.state === "banned" ? (
            <Badge variant="destructive">Banned</Badge>
          ) : (
            <Badge variant="secondary">
              Suspended until {formatDate(user.restriction.suspendedUntil)}
            </Badge>
          )
        ) : (
          <Badge variant="outline">Active</Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* PII card — admin console only; this data NEVER renders publicly. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identity (private)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <p>
              <span className="text-muted-foreground">Name:</span>{" "}
              {user.firstName} {user.lastName}
            </p>
            <p>
              <span className="text-muted-foreground">Email:</span> {user.email}
            </p>
            <p>
              <span className="text-muted-foreground">Phone:</span> {user.phone}{" "}
              {user.phoneVerifiedAt ? (
                <Badge variant="outline">Verified</Badge>
              ) : (
                <Badge variant="secondary">Not verified</Badge>
              )}
            </p>
            <p>
              <span className="text-muted-foreground">Seller terms:</span>{" "}
              {user.marketplaceTermsAcceptedAt
                ? `Accepted ${formatDate(user.marketplaceTermsAcceptedAt)}`
                : "Not accepted"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Public profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <p>
              <span className="text-muted-foreground">Username:</span>{" "}
              {user.username}
            </p>
            <p>
              <span className="text-muted-foreground">Display name:</span>{" "}
              {user.displayName ?? "— (anonymous handle)"}
            </p>
            <p>
              <span className="text-muted-foreground">Location:</span>{" "}
              {user.stateProvince}, {user.country}
            </p>
            <p>
              <span className="text-muted-foreground">Member since:</span>{" "}
              {formatDate(user.memberSince)}
            </p>
            <p>
              <span className="text-muted-foreground">Seller type:</span>{" "}
              {user.sellerType ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Listings:</span>{" "}
              {user.listingCount}
              <span className="text-muted-foreground ml-3">
                Reports against:
              </span>{" "}
              {user.reportsAgainstCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {user.restriction && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Restriction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <p>
              <span className="text-muted-foreground">State:</span>{" "}
              {user.restriction.state === "banned" ? "Banned" : "Suspended"}
            </p>
            {user.restriction.state === "suspended" && (
              <p>
                <span className="text-muted-foreground">Until:</span>{" "}
                {formatDate(user.restriction.suspendedUntil)}
              </p>
            )}
            <p>
              <span className="text-muted-foreground">Reason:</span>{" "}
              {user.restriction.reason}
            </p>
            <p>
              <span className="text-muted-foreground">Applied:</span>{" "}
              {formatDate(user.restriction.createdAt)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Enforcement actions (warn / suspend / ban / reactivate / rename) are
          mounted here by Task 2 (components/admin/enforcement-dialogs.tsx). */}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent listings</CardTitle>
        </CardHeader>
        <CardContent>
          {user.recentListings.length === 0 ? (
            <p className="text-muted-foreground text-sm">No listings.</p>
          ) : (
            <ul className="divide-y text-sm">
              {user.recentListings.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="min-w-0 truncate">
                    <Link
                      href={`/listings/${l.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {l.title}
                    </Link>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{l.status}</Badge>
                    {l.hiddenAt && (
                      <Badge variant="destructive">
                        hidden ({l.hiddenReason})
                      </Badge>
                    )}
                    <span className="text-muted-foreground text-xs">
                      {formatDate(l.createdAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
