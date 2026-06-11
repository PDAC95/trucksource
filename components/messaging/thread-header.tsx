"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, ImageIcon, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { blockUser, unblockUser } from "@/lib/actions/messages";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// The fixed part-card header of a chat thread (MSG-05): listing photo thumb,
// title (linked to the listing), price, lifecycle status badge, and the
// counterparty's PUBLIC name (MSG-06 — coalesce(display_name, username),
// resolved server-side; no PII ever reaches this component).
//
// LOCKED: a Sold/Expired listing keeps the thread fully usable — only the
// badge changes. The kebab menu carries Block/Unblock (confirm AlertDialog);
// enforcement is the messages INSERT RLS policy — this UI only flips the
// user_blocks row and refreshes.

function formatPrice(price: number | null): string {
  if (price === null) return "Price on request";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

function statusBadge(status: string): { label: string; muted: boolean } {
  if (status === "sold") return { label: "Sold", muted: true };
  if (status === "expired") return { label: "Expired", muted: true };
  return { label: "Active", muted: false };
}

export function ThreadHeader({
  listingId,
  listingTitle,
  listingPrice,
  listingStatus,
  listingPhotoUrl,
  counterpartyName,
  counterpartyId,
  initiallyBlocked,
}: {
  listingId: number;
  listingTitle: string;
  listingPrice: number | null;
  listingStatus: string;
  listingPhotoUrl: string | null;
  counterpartyName: string;
  counterpartyId: string;
  initiallyBlocked: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [blocked, setBlocked] = React.useState(initiallyBlocked);
  const [pending, startTransition] = React.useTransition();

  const status = statusBadge(listingStatus);

  const onConfirmBlock = () => {
    startTransition(async () => {
      const res = await blockUser(counterpartyId);
      if (res.ok) {
        setBlocked(true);
        toast.success(`Blocked ${counterpartyName}.`);
        router.refresh();
      } else {
        toast.error("Something went wrong. Try again.");
      }
      setConfirmOpen(false);
    });
  };

  const onUnblock = () => {
    startTransition(async () => {
      const res = await unblockUser(counterpartyId);
      if (res.ok) {
        setBlocked(false);
        toast.success(`Unblocked ${counterpartyName}.`);
        router.refresh();
      } else {
        toast.error("Something went wrong. Try again.");
      }
    });
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Link
        href={`/listings/${listingId}`}
        className="bg-muted relative block size-14 shrink-0 overflow-hidden rounded-md"
      >
        {listingPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listingPhotoUrl}
            alt={listingTitle}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center">
            <ImageIcon className="size-5" />
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/listings/${listingId}`}
            className="truncate text-sm font-medium hover:underline"
          >
            {listingTitle}
          </Link>
          <Badge
            variant={status.muted ? "secondary" : "outline"}
            className="shrink-0"
          >
            {status.label}
          </Badge>
        </div>
        <p className="text-sm font-semibold">{formatPrice(listingPrice)}</p>
        <p className="text-muted-foreground truncate text-xs">
          Chatting with {counterpartyName}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Thread options"
            className="text-muted-foreground shrink-0"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {blocked ? (
            <DropdownMenuItem disabled={pending} onSelect={onUnblock}>
              <Ban className="size-4" />
              Unblock {counterpartyName}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={pending}
              onSelect={() => setConfirmOpen(true)}
            >
              <Ban className="size-4" />
              Block {counterpartyName}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {counterpartyName}?</AlertDialogTitle>
            <AlertDialogDescription>
              They won&apos;t be able to message you. You can unblock anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={onConfirmBlock}>
              {pending ? "Blocking…" : "Block"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
