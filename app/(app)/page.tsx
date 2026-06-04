import { createClient } from "@/lib/supabase/server";
import { listMyTrucks } from "@/lib/garage/queries";
import { GarageBanner } from "./garage-banner";

// Authenticated landing/feed placeholder. The real feed arrives in Phase 7.
// Reads only the public username (never PII).
export default async function AppHomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  let username = "there";
  if (data?.claims) {
    const { data: profile } = await supabase
      .from("profiles_public")
      .select("username")
      .eq("id", data.claims.sub)
      .maybeSingle();
    if (profile?.username) username = profile.username;
  }

  // Soft post-registration invitation: show the skippable "add your truck"
  // banner ONLY when the user has 0 saved trucks (owner-scoped via listMyTrucks).
  // No persisted flag — once they save a truck the banner naturally disappears.
  // The garage is never forced at registration (handle_new_user is untouched).
  const trucks = await listMyTrucks();
  const showBanner = trucks.length === 0;

  return (
    <div className="mx-auto max-w-2xl">
      {showBanner && <GarageBanner />}
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome, {username}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Your feed lands here in Phase 7. For now, you&apos;re signed in and your
        private details stay private.
      </p>
    </div>
  );
}
