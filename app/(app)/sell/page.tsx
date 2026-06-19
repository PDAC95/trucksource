import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getConditions, getPartCategories } from "@/lib/listings/cascade";
import type { CascadeOption } from "@/lib/garage/cascade";
import { Toaster } from "@/components/ui/sonner";

import { ListingForm } from "@/components/listings/listing-form";

// Owner-only create-listing page — never cache one seller's form for another
// (invariant 6). The (app) layout already gates auth and is force-dynamic; we set
// it here too defensively (mirrors profile/garage/page.tsx).
export const dynamic = "force-dynamic";

// Create a listing (LIST-01). Server Component: re-verify claims (defensive), load
// the Make options (anon-public Phase-3 reference) and Conditions for the form, plus
// the account-level contact preference (DISPLAY-ONLY in the form). The contact
// preference column (profiles_public.contact_preference) is added in plan 05-05; if
// it isn't present yet at execution time we default to the most-private option so
// this page never hard-fails.
export default async function SellPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }

  const { data: makesData } = await supabase
    .from("makes")
    .select("id, name")
    // ADMO-05: deactivated makes are hidden from NEW-listing pickers only.
    .eq("is_active", true)
    .order("name");
  const makes = (makesData ?? []) as CascadeOption[];

  const conditions = await getConditions();
  // Phase-6 part-category tree — drives the Fitment suggestion trigger (06-04).
  const partCategories = await getPartCategories();

  // Contact preference (added in 05-05). Read defensively: a missing column or row
  // collapses to the most-private default rather than breaking listing creation.
  let contactPreference = "messaging_only";
  try {
    const { data: pref } = await supabase
      .from("profiles_public")
      .select("contact_preference")
      .eq("id", data.claims.sub)
      .maybeSingle();
    const value = (pref as { contact_preference?: string } | null)
      ?.contact_preference;
    if (value) contactPreference = value;
  } catch {
    // Column not present yet (pre-05-05) — keep the default.
  }

  // Verified-seller flag (Phase 17 publish gate). Read the caller's OWN
  // profiles_private flags (owner RLS, auth.uid() = id) — these are non-PII
  // status timestamps (NOT name/email/phone), so invariant 1's "no PII on the
  // server response" posture holds. Defensive maybeSingle so a missing row can't
  // hard-fail the page. The server action's not_verified (Plan 01) remains the
  // trust boundary; this only drives the UX gate (banner + draft-preserving
  // redirect) in the form.
  let isVerifiedSeller = false;
  try {
    const { data: priv } = await supabase
      .from("profiles_private")
      .select("phone_verified_at, marketplace_terms_accepted_at")
      .eq("id", data.claims.sub)
      .maybeSingle();
    isVerifiedSeller =
      Boolean(priv?.phone_verified_at) &&
      Boolean(priv?.marketplace_terms_accepted_at);
  } catch {
    // Columns/row not present — treat as unverified (safe default; the banner
    // shows and the server action backstops regardless).
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create a listing
        </h1>
        <p className="text-muted-foreground text-sm">
          Add your part, who it fits, photos, and how buyers can get it.
        </p>
      </div>

      <ListingForm
        mode="create"
        makes={makes}
        conditions={conditions}
        partCategories={partCategories}
        contactPreference={contactPreference}
        isVerifiedSeller={isVerifiedSeller}
      />

      <Toaster />
    </div>
  );
}
