"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { markSold, markAvailable } from "@/lib/actions/listings";

// LIST-06 owner control — the reversible sold toggle on the listing detail
// page, alongside RenewButton. Status-driven:
//   - active → "Mark as sold"  (confirmed: leaves search/feed, the page
//     stays visible with the Sold badge — the LOCKED sold treatment)
//   - sold   → "Mark as available" (lighter confirmation; restores the
//     listing with its ORIGINAL expiry — markAvailable never touches the clock)
//   - anything else (expired) → renders nothing; reactivation is RenewButton's
//     job (reactivateListing is the clock writer, not markAvailable).
//
// Both actions are owner-scoped server-side (getClaims + owner RLS); zero rows
// → not_found, surfaced as a friendly toast.

export function SoldToggle({
  listingId,
  status,
}: {
  listingId: number;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  if (status !== "active" && status !== "sold") return null;
  const isSold = status === "sold";

  function run() {
    startTransition(async () => {
      const result = isSold
        ? await markAvailable(listingId)
        : await markSold(listingId);
      if (result.ok) {
        toast.success(
          isSold ? "Listing available again" : "Listing marked as sold",
        );
        router.refresh();
        return;
      }
      if (result.error === "unauthenticated") {
        toast.error("Your session expired — sign in again.");
      } else {
        // not_found / invalid: raced status flip or not the caller's listing.
        toast.error("Couldn't update");
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={pending}>
          {isSold ? (
            <RotateCcw className="size-4" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          {pending
            ? "Updating…"
            : isSold
              ? "Mark as available"
              : "Mark as sold"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isSold ? "Mark as available?" : "Mark as sold?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isSold
              ? "It will reappear in search and the feed with its original expiry."
              : "It will leave search and the feed, but the page stays visible with a Sold badge."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={run}>
            {isSold ? "Mark as available" : "Mark as sold"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
