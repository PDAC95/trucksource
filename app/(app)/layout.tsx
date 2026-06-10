import { redirect } from "next/navigation";
import Link from "next/link";
import { Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/layout/user-menu";

// Personalized — never cache one user's shell for another (invariant 6).
export const dynamic = "force-dynamic";

// Guarded layout for the authenticated app. getClaims() verifies the JWT
// locally (never getSession). No claims => no/unconfirmed session => redirect to
// /login. THIS redirect IS the email-confirmation gate: an unconfirmed user has
// no session, so they can never reach (app) content.
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

  // Public, non-PII handle for the header menu.
  const { data: profile } = await supabase
    .from("profiles_public")
    .select("username")
    .eq("id", data.claims.sub)
    .maybeSingle();

  const username = profile?.username ?? "Account";

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
        <Link href="/" className="font-semibold tracking-tight">
          Take-Off Parts
        </Link>
        <div className="flex items-center gap-1">
          {/* SOCL-02: the saved-listings entry point — matches the UserMenu
              trigger style (ghost/sm) for the smallest consistent change. */}
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link href="/saved">
              <Heart className="size-4" />
              <span className="hidden sm:inline">Saved</span>
            </Link>
          </Button>
          <UserMenu username={username} />
        </div>
      </header>
      <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
