import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Toaster } from "@/components/ui/sonner";
import type { ContactPreference } from "@/lib/account/schema";

import { ContactPreferenceForm } from "./contact-preference-form";

// Owner-scoped, per-user settings — never cache one user's account data for
// another (invariant 6). The (app) layout already gates auth and is force-dynamic;
// we set it here too defensively (mirrors profile/garage/page.tsx).
export const dynamic = "force-dynamic";

// Account settings (LIST-07). Server Component: re-verify claims (defensive),
// read the caller's current contact_preference from profiles_public, and render
// the one control. Other account settings are out of scope for this plan — this
// is a minimal settings shell with the contact-preference control.
export default async function AccountPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles_public")
    .select("contact_preference")
    .eq("id", userId)
    .maybeSingle();

  // Default to the most-private option if the row/column read is ever absent.
  const current = (profile?.contact_preference ??
    "messaging_only") as ContactPreference;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Account settings
        </h1>
        <p className="text-muted-foreground text-sm">
          Choose how buyers can reach you about your listings.
        </p>
      </div>

      <div className="mt-8">
        <ContactPreferenceForm current={current} />
      </div>

      <Toaster />
    </div>
  );
}
