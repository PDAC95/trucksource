"use client";

import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

// Soft, skippable post-registration invitation to add a truck. The PARENT (the
// (app) dashboard) only renders this when the user has 0 garage trucks, so once
// they save a truck it disappears — there is NO persisted server flag to manage
// (per CONTEXT: "no default flag"). Dismissal hides it client-side and persists
// to localStorage so it stays dismissed across reloads. It NEVER blocks anything
// and the garage is never forced at registration (ROADMAP rule).

const DISMISS_KEY = "garage-banner-dismissed";

// Subscribe to the dismissed flag via useSyncExternalStore so SSR and the first
// client render agree (both read "not dismissed"), then the client snapshot
// reconciles from localStorage — no setState-in-effect, no hydration mismatch.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function getDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function GarageBanner() {
  const dismissed = React.useSyncExternalStore(
    subscribe,
    getDismissed,
    () => false, // server snapshot: never dismissed (banner is client-only UX)
  );
  // Local override so a dismiss in THIS tab hides immediately (storage events
  // only fire in OTHER tabs).
  const [locallyDismissed, setLocallyDismissed] = React.useState(false);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // localStorage unavailable (private mode) — hiding for this session is fine.
    }
    setLocallyDismissed(true);
  }

  if (dismissed || locallyDismissed) return null;

  return (
    <div className="bg-muted/50 mb-6 flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
      <div className="grid gap-0.5">
        <p className="text-sm font-medium">
          Add your truck to see parts that fit
        </p>
        <p className="text-muted-foreground text-xs">
          Optional — you can always do this later.
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <Button asChild size="sm">
          <Link href="/profile/garage">Add a truck</Link>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
