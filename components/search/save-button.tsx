"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toggleSave } from "@/lib/actions/saves";

// The auth-aware save heart (SOCL-02), shared by the listing detail page (08-04)
// and the feed cards / saved page (08-05, absolute-positioned top-right over the
// card photo — hence the relative wrapper + stopPropagation discipline).
//
// Three states:
//   - anon          → muted heart; clicking shows a small login invite (mirrors
//                     the FitsMyTruckControl anon state) instead of toggling.
//   - authenticated → optimistic flip (local state + useTransition — no
//                     render-time state writes, the strict react-hooks gate),
//                     reconciled against toggleSave's returned saved state;
//                     {ok:false} reverts + toasts.
//
// Cards wrap themselves in a Link — every click inside this component calls
// preventDefault + stopPropagation so the parent card link NEVER fires.

export function SaveButton({
  listingId,
  initiallySaved,
  isAuthenticated,
  size = "default",
}: {
  listingId: number;
  initiallySaved: boolean;
  isAuthenticated: boolean;
  size?: "sm" | "default"; // sm = card overlay, default = detail page
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [showInvite, setShowInvite] = useState(false);
  const [, startTransition] = useTransition();

  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    // Never let the parent card <Link> navigate on a heart click.
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      setShowInvite((v) => !v);
      return;
    }

    const next = !saved;
    setSaved(next); // optimistic flip
    startTransition(async () => {
      const res = await toggleSave(listingId);
      if (!res.ok) {
        setSaved(!next); // revert
        toast.error("Couldn't save");
        return;
      }
      setSaved(res.saved); // reconcile with the server's truth
    });
  }

  const label = saved ? "Saved" : "Save";

  return (
    <div className="relative">
      <Button
        type="button"
        variant="secondary"
        size={size === "sm" ? "icon-sm" : "icon"}
        onClick={onClick}
        aria-pressed={saved}
        aria-label={label}
        title={label}
        className={cn(
          "bg-background/80 shadow-sm backdrop-blur-sm hover:bg-background",
          !isAuthenticated && "text-muted-foreground",
        )}
      >
        <Heart
          className={cn(
            saved && isAuthenticated && "fill-destructive text-destructive",
          )}
        />
      </Button>

      {!isAuthenticated && showInvite && (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md">
          <p className="mb-1 text-muted-foreground">Sign in to save.</p>
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Sign in
          </Link>
        </div>
      )}
    </div>
  );
}
