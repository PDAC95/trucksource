"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck, RotateCcw } from "lucide-react";

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

// LIST-06's My-Listings home: a CONFIRMED, reversible sold toggle per row.
//   - active → "Mark sold"      → markSold (status-only update)
//   - sold   → "Mark available" → markAvailable (status-only; the expiry
//              clock is untouched — renew/reactivate stay the only clock writers)
//   - expired/anything else → renders NOTHING (the EXISTING RenewButton owns the
//     reactivate path; the sold toggle never shows for expired rows).
//
// Colocated with the page (NOT components/listings/* — 08-04 owns that surface).
// Follows the renew-button.tsx pattern: action in a transition, sonner feedback,
// router.refresh() so the force-dynamic page re-reads the row.

export function SoldToggle({
  listingId,
  status,
}: {
  listingId: number;
  status: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  if (status !== "active" && status !== "sold") return null;
  const isSold = status === "sold";

  function run() {
    setPending(true);
    React.startTransition(async () => {
      const result = await (isSold
        ? markAvailable(listingId)
        : markSold(listingId));
      if (result.ok) {
        toast.success(
          isSold ? "Listing available again" : "Listing marked as sold",
        );
        router.refresh();
      } else if (result.error === "unauthenticated") {
        toast.error("Your session expired — sign in again.");
      } else if (result.error === "not_found") {
        toast.error("This listing can no longer be updated. Reload the page.");
      } else {
        toast.error("Something went wrong. Try again.");
      }
      setPending(false);
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={isSold ? "secondary" : "outline"}
          disabled={pending}
        >
          {isSold ? (
            <RotateCcw className="size-4" />
          ) : (
            <CircleCheck className="size-4" />
          )}
          {pending ? "Saving…" : isSold ? "Mark available" : "Mark sold"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isSold ? "Mark as available?" : "Mark as sold?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isSold
              ? "The listing will reappear in the feed and search with its original expiry date."
              : "The listing will stop showing in the feed and search. You can revert anytime with “Mark available”."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={run}>
            {isSold ? "Mark available" : "Mark sold"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
