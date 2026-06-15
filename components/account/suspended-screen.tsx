import Link from "next/link";

import { logout } from "@/components/layout/logout-action";
import { Button } from "@/components/ui/button";
import type { OwnRestriction } from "@/lib/account/restrictions";

// The blocked screen a restricted user sees app-wide (ADMO-01). Rendered by
// the (app) layout INSTEAD of children (deep links can't bypass it) and by
// the canonical /suspended page. Minimal signed-out-style chrome on purpose:
// no nav, no search — just the facts, read-only messages (suspended only),
// and sign out.

function formatUntil(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function SuspendedScreen({
  restriction,
}: {
  restriction: OwnRestriction;
}) {
  const banned = restriction.state === "banned";

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b px-4 py-3 sm:px-6">
        <span className="text-lg font-semibold tracking-tight">
          OG Truck Parts
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {banned
              ? "Account banned"
              : restriction.suspendedUntil
                ? `Account suspended until ${formatUntil(restriction.suspendedUntil)}`
                : "Account suspended"}
          </h1>
          <p className="text-muted-foreground text-sm">
            Reason: {restriction.reason}
          </p>
          {banned ? (
            <p className="text-muted-foreground text-sm">
              Your listings have been removed and your account can no longer be
              used.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              While suspended, your listings are hidden and you can&apos;t post,
              sell, or send messages. You can still read your existing
              conversations. Access is restored automatically when the
              suspension ends.
            </p>
          )}
          <div className="flex items-center justify-center gap-3 pt-2">
            {!banned && (
              <Button asChild variant="outline">
                <Link href="/messages">View messages</Link>
              </Button>
            )}
            <form action={logout}>
              <Button type="submit" variant="secondary">
                Log out
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
