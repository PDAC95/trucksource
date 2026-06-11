"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EyeOff, RotateCcw, Trash2 } from "lucide-react";
import {
  hideListing,
  restoreListing,
  removeListingPhoto,
} from "@/lib/actions/admin/listings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Client shell for the moderation dialogs on /admin/listings/[id]. The
// actions re-gate with requireAdmin() and re-validate — this component is
// pure UX (confirm + reason + toast + refresh).

function errorMessage(error: string): string {
  switch (error) {
    case "not_found":
      return "Nothing to do — the listing state already changed.";
    case "invalid":
      return "A reason is required.";
    default:
      return "Something went wrong. Try again.";
  }
}

/** Hide (with reason) / Restore controls for the listing detail header. */
export function HideRestoreControls({
  listingId,
  hiddenAt,
  hiddenReason,
}: {
  listingId: number;
  hiddenAt: string | null;
  hiddenReason: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hideOpen, setHideOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (hiddenAt && hiddenReason !== "moderation") {
    // Suspension/ban hides are lifted by user reactivation, never from here.
    return (
      <p className="text-sm text-muted-foreground">
        Hidden by {hiddenReason ?? "enforcement"} — restore happens through the
        user&apos;s reactivation, not from this page.
      </p>
    );
  }

  if (hiddenAt) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await restoreListing({ listingId });
            if (result.ok) {
              toast.success("Listing restored to public view.");
              router.refresh();
            } else {
              toast.error(errorMessage(result.error));
            }
          })
        }
      >
        <RotateCcw className="size-4" />
        Restore listing
      </Button>
    );
  }

  return (
    <Dialog open={hideOpen} onOpenChange={setHideOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <EyeOff className="size-4" />
          Hide listing
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hide this listing?</DialogTitle>
          <DialogDescription>
            It disappears from search, the feed and its public page. The seller
            still sees it. This is logged.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="hide-reason">Reason (required)</Label>
          <Textarea
            id="hide-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this listing being hidden?"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setHideOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending || reason.trim().length === 0}
            onClick={() =>
              startTransition(async () => {
                const result = await hideListing({
                  listingId,
                  reason: reason.trim(),
                });
                if (result.ok) {
                  toast.success("Listing hidden from all public surfaces.");
                  setHideOpen(false);
                  setReason("");
                  router.refresh();
                } else {
                  toast.error(errorMessage(result.error));
                }
              })
            }
          >
            Hide listing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Per-photo remove button (confirm dialog with required reason). */
export function PhotoRemoveButton({ photoId }: { photoId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="w-full">
          <Trash2 className="size-4" />
          Remove photo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this photo?</DialogTitle>
          <DialogDescription>
            The image is deleted from storage permanently. The listing stays up.
            This is logged.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`photo-reason-${photoId}`}>Reason (required)</Label>
          <Textarea
            id={`photo-reason-${photoId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this photo being removed?"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending || reason.trim().length === 0}
            onClick={() =>
              startTransition(async () => {
                const result = await removeListingPhoto({
                  photoId,
                  reason: reason.trim(),
                });
                if (result.ok) {
                  toast.success("Photo removed.");
                  setOpen(false);
                  setReason("");
                  router.refresh();
                } else {
                  toast.error(errorMessage(result.error));
                }
              })
            }
          >
            Remove photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
