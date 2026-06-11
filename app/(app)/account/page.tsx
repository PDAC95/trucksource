import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Toaster } from "@/components/ui/sonner";
import type { ContactPreference } from "@/lib/account/schema";
import type { SellerType } from "@/lib/seller/badge";

import { ContactPreferenceForm } from "./contact-preference-form";
import { SellerTypeForm } from "@/components/account/seller-type-form";
import { DisplayNameForm } from "@/components/account/display-name-form";
import { MessageEmailForm } from "@/components/account/message-email-form";

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

  // The viewer's OWN rows only. profiles_private is the owner-only table
  // (`(select auth.uid()) = id` RLS); we read JUST the non-PII opt-out flag —
  // never email/phone/name (invariant 1 posture preserved).
  const [{ data: profile }, { data: priv }] = await Promise.all([
    supabase
      .from("profiles_public")
      .select("username, contact_preference, seller_type, display_name")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("profiles_private")
      .select("message_email_opt_out")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  // Default to the most-private option if the row/column read is ever absent.
  const current = (profile?.contact_preference ??
    "messaging_only") as ContactPreference;
  const sellerType = (profile?.seller_type ?? null) as SellerType | null;
  const displayName = (profile?.display_name ?? null) as string | null;
  const username = profile?.username ?? "";
  // Column default is false (= emails ON); absent row reads as the default.
  const messageEmailEnabled = !(priv?.message_email_opt_out ?? false);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Account settings
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage how you appear to buyers and how they can reach you.
        </p>
      </div>

      <div className="mt-8 grid gap-10">
        <DisplayNameForm current={{ displayName, username }} />
        <SellerTypeForm current={sellerType} />
        <ContactPreferenceForm current={current} />
        <MessageEmailForm current={messageEmailEnabled} />
      </div>

      <Toaster />
    </div>
  );
}
