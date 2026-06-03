import { createClient } from "@/lib/supabase/server";

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

  return (
    <div className="mx-auto max-w-2xl">
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
