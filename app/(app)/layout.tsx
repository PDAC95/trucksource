import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnRestriction } from "@/lib/account/restrictions";
import { SiteHeader } from "@/components/layout/site-header";
import { SuspendedScreen } from "@/components/account/suspended-screen";

// Personalized — never cache one user's shell for another (invariant 6).
export const dynamic = "force-dynamic";

// Guarded layout for the authenticated app. getClaims() verifies the JWT
// locally (never getSession). No claims => no/unconfirmed session => redirect to
// /login. THIS redirect IS the email-confirmation gate: an unconfirmed user has
// no session, so they can never reach (app) content.
//
// SUSPENSION GATE (ADMO-01): getOwnRestriction() runs the lazy-expiry check on
// every (app) request. When restricted, the blocked screen renders INSTEAD of
// children — render-in-layout so deep links can't bypass it (/suspended is the
// canonical page address). ONE exception, per the locked decision: suspended
// (never banned) users keep READ access to /messages, wrapped in minimal
// no-nav chrome — sending is independently blocked structurally by the 0019
// messages INSERT policy. Pathname comes from the x-pathname header stamped in
// lib/supabase/middleware.ts.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }

  const restriction = await getOwnRestriction();
  if (restriction) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    const readOnlyMessages =
      restriction.state === "suspended" && pathname.startsWith("/messages");

    if (!readOnlyMessages) {
      return <SuspendedScreen restriction={restriction} />;
    }

    // Suspended + /messages: read-only access with minimal chrome (no nav —
    // every other destination is gated anyway).
    return (
      <div className="flex min-h-svh flex-col">
        <header className="border-b px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <span className="text-lg font-semibold tracking-tight">
              Take-Off Parts
            </span>
            <Link
              href="/suspended"
              className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
            >
              Account suspended — read-only access
            </Link>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
