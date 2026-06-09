"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { renewListing, reactivateListing } from "@/lib/actions/listings";
import { daysUntil, isExpiringSoon } from "@/lib/listings/lifecycle";

// LIST-09 owner control. Self-hiding: it renders NOTHING for a healthy active
// listing (>7 days out) — CONTEXT: no countdown on healthy listings. It surfaces
// ONLY when there's something to do:
//   - active & expiring soon (<=7 days): "Expires in X days" + Renew (+90d)
//   - expired: "Reactivate" (status->active, +90d)
// Both run the owner-scoped action in a transition, toast the NEW expiry date the
// action returns, then router.refresh() so the (force-dynamic) page re-reads state.
//
// Reused by My Listings rows AND the listing detail page (owner-only), so it takes
// the minimal { listingId, status, expiresAt } and derives the rest.

function formatExpiry(iso: string): string {
  // DD/MM/YYYY (CONTEXT example used DD/MM); locale-stable display of the new clock.
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function RenewButton({
  listingId,
  status,
  expiresAt,
}: {
  listingId: number;
  status: string;
  expiresAt: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const expiring = isExpiringSoon(status, expiresAt);
  const expired = status === "expired";

  // Healthy active (>7 days) or sold → nothing to surface.
  if (!expiring && !expired) return null;

  function run(
    action: () => Promise<
      { ok: true; expiresAt: string } | { ok: false; error: string }
    >,
    verb: string,
  ) {
    setPending(true);
    React.startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(
          `${verb} — active until ${formatExpiry(result.expiresAt)}`,
        );
        router.refresh();
      } else if (result.error === "unauthenticated") {
        toast.error("Your session expired — please log in again.");
      } else if (result.error === "not_found") {
        toast.error(
          "This listing can no longer be updated. Refresh and try again.",
        );
      } else {
        toast.error("Something went wrong. Please try again.");
      }
      setPending(false);
    });
  }

  if (expired) {
    return (
      <Button
        size="sm"
        disabled={pending}
        onClick={() => run(() => reactivateListing(listingId), "Reactivated")}
      >
        <RotateCw className="size-4" />
        {pending ? "Reactivating…" : "Reactivate"}
      </Button>
    );
  }

  // expiring soon (active, within ~7 days)
  const days = expiresAt ? daysUntil(expiresAt) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        Expires in {days} {days === 1 ? "day" : "days"}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => renewListing(listingId), "Renewed")}
      >
        <RotateCw className="size-4" />
        {pending ? "Renewing…" : "Renew"}
      </Button>
    </div>
  );
}
