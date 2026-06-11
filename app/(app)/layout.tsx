import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/layout/site-header";

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

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
