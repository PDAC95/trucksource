"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeOff, ImageIcon, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import type { ThreadListItem } from "@/lib/messaging/queries";
import { hideThread } from "@/lib/actions/messages";

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

// The inbox list (MSG-05): one row per visible thread — part photo thumb,
// title, counterparty PUBLIC name (MSG-06), last-message snippet, relative
// time, unread dot, lifecycle badge.
//
// ONE URL SCHEME, pure CSS (research Open Q3 — NO parallel routes): each row
// carries two overlay links — `/messages/[threadId]` (mobile, lg:hidden) and
// `/messages?thread={id}` (desktop split pane, hidden lg:block). The kebab
// sits above the overlays (z-10) so "Hide conversation" stays clickable.
//
// Hide ≠ delete (MSG-04): hideThread flips only the viewer-side flag.

const SNIPPET_MAX = 60;

function snippet(body: string | null): string {
  if (!body) return "No messages yet";
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length > SNIPPET_MAX
    ? `${oneLine.slice(0, SNIPPET_MAX)}…`
    : oneLine;
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function statusBadge(status: string): string | null {
  if (status === "sold") return "Sold";
  if (status === "expired") return "Expired";
  return null;
}

function ThreadRow({
  item,
  active,
}: {
  item: ThreadListItem;
  active: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const badge = statusBadge(item.listingStatus);

  const onConfirmHide = () => {
    startTransition(async () => {
      const res = await hideThread(item.threadId);
      if (res.ok) {
        toast.success("Conversation hidden.");
        router.refresh();
      } else {
        toast.error("Something went wrong. Try again.");
      }
      setConfirmOpen(false);
    });
  };

  return (
    <li
      className={`relative flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
        active ? "lg:border-primary lg:bg-muted/50" : ""
      }`}
    >
      {/* Overlay links — mobile goes to the thread page; desktop selects the
          split pane via ?thread= (one URL scheme, responsive CSS only). */}
      <Link
        href={`/messages/${item.threadId}`}
        className="absolute inset-0 rounded-lg lg:hidden"
        aria-label={`Conversation about ${item.listingTitle} with ${item.counterpartyName}`}
      />
      <Link
        href={`/messages?thread=${item.threadId}`}
        className="absolute inset-0 hidden rounded-lg lg:block"
        aria-label={`Conversation about ${item.listingTitle} with ${item.counterpartyName}`}
      />

      <div className="bg-muted relative block size-12 shrink-0 overflow-hidden rounded-md">
        {item.listingPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.listingPhotoUrl}
            alt={item.listingTitle}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center">
            <ImageIcon className="size-4" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`truncate text-sm ${item.unread ? "font-semibold" : "font-medium"}`}
          >
            {item.listingTitle}
          </p>
          {badge && (
            <Badge variant="secondary" className="shrink-0">
              {badge}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {item.counterpartyName}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          {item.unread && (
            <span
              className="bg-primary size-2 shrink-0 rounded-full"
              aria-label="Unread"
            />
          )}
          <p
            className={`truncate text-xs ${
              item.unread
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            }`}
          >
            {snippet(item.lastMessageSnippet)}
          </p>
          <span
            className="text-muted-foreground ml-auto shrink-0 text-xs"
            suppressHydrationWarning
          >
            {formatRelative(item.lastMessageAt)}
          </span>
        </div>
      </div>

      {/* Above the overlay links so the menu stays clickable. */}
      <div className="relative z-10 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Conversation options"
              className="text-muted-foreground"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={pending}
              onSelect={() => setConfirmOpen(true)}
            >
              <EyeOff className="size-4" />
              Hide conversation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hide this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This hides it from your inbox. It doesn&apos;t delete anything.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={onConfirmHide}>
              {pending ? "Hiding…" : "Hide"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

export function ThreadList({
  items,
  activeThreadId,
}: {
  items: ThreadListItem[];
  activeThreadId?: number;
}) {
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <ThreadRow
          key={item.threadId}
          item={item}
          active={item.threadId === activeThreadId}
        />
      ))}
    </ul>
  );
}
