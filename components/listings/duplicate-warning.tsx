"use client";

import * as React from "react";
import Link from "next/link";

import type { SimilarListing } from "@/lib/listings/duplicates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Non-blocking same-seller duplicate warning (LIST-10). Tone REMINDS, never
// accuses — a seller may legitimately have several similar parts. It lists the
// seller's own similar listings as edit-links and always offers "Publish anyway"
// (one extra click). This dialog NEVER has a publish-blocking-only state: both
// paths (publish anyway / go back to edit the original) are one click away.

export function DuplicateWarning({
  open,
  matches,
  onPublishAnyway,
  onCancel,
}: {
  open: boolean;
  matches: SimilarListing[];
  onPublishAnyway: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Dismissing the dialog (overlay/esc/X) is "go back" — it never publishes.
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>You already have a similar listing</DialogTitle>
          <DialogDescription>
            If this is the same part, you can edit the original. If it&apos;s a
            different part, go right ahead and publish.
          </DialogDescription>
        </DialogHeader>

        <ul className="grid gap-2 py-2">
          {matches.map((m) => (
            <li key={m.id}>
              <Link
                href={`/sell/${m.id}/edit`}
                className="text-sm font-medium underline underline-offset-4 hover:no-underline"
              >
                {m.title}
              </Link>
            </li>
          ))}
        </ul>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Go back
          </Button>
          <Button type="button" onClick={onPublishAnyway}>
            Publish anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
