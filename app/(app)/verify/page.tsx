import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";

import { PhoneStep } from "./phone-step";
import { OtpStep } from "./otp-step";
import { TermsStep } from "./terms-step";

// Per-user verification state — MUST NOT be cached (PITFALL #6). The (app) layout
// already redirects unauthenticated users and is itself force-dynamic, but we set
// it here too so caching can never resume the WRONG user's wizard state.
export const dynamic = "force-dynamic";

// The resume-on-abandon wizard (02-RESEARCH Pattern 5). The single source of truth
// for "which step is the user on" is their own profiles_private row — the same
// columns the verified badge reads — so progress survives navigation and reload.
// We re-read claims (defensive; layout already gated) and select only the three
// resume signals via owner RLS, then branch to the correct client step.
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ change?: string }>;
}) {
  const { change } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }

  const { data: row } = await supabase
    .from("profiles_private")
    .select("phone, phone_verified_at, marketplace_terms_accepted_at")
    .eq("id", data.claims.sub)
    .maybeSingle();

  const phone = row?.phone ?? null;
  const phoneVerified = Boolean(row?.phone_verified_at);
  const termsAccepted = Boolean(row?.marketplace_terms_accepted_at);

  let step: React.ReactNode;
  let heading: string;
  let subhead: string;

  if (phoneVerified && termsAccepted) {
    // All three signals present (email confirmed by the gate + phone + terms) —
    // the badge is live. Brief confirmation with a forward link.
    heading = "You're a verified seller";
    subhead = "Your phone and marketplace terms are confirmed.";
    step = (
      <div className="grid gap-3">
        <Button asChild className="w-full">
          <Link href="/">Go to your dashboard</Link>
        </Button>
      </div>
    );
  } else if (phoneVerified) {
    // Phone verified, terms outstanding — last step.
    heading = "One last step";
    subhead = "Accept the marketplace terms to finish verifying.";
    step = <TermsStep />;
  } else if (phone && change !== "1") {
    // A phone is on file but unverified — resume on OTP entry (resend allowed).
    // `?change=1` from the OTP step forces back to phone entry to change number.
    heading = "Enter your code";
    subhead = "We sent a 6-digit code to your phone.";
    step = <OtpStep initialPhone={phone} />;
  } else {
    // Fresh start (or "change number") — phone entry. Pre-fill from any phone
    // already on file (registration phone or the number being changed) for UX;
    // the user can edit it and OTP is mandatory regardless.
    heading = "Verify your phone";
    subhead = "Verified sellers earn a badge buyers trust.";
    step = <PhoneStep initialPhone={phone ?? undefined} />;
  }

  return (
    <div className="mx-auto flex min-h-[60svh] w-full max-w-md items-center justify-center">
      <div className="w-full">
        <div className="grid gap-6">
          <div className="grid gap-1.5 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
            <p className="text-muted-foreground text-sm">{subhead}</p>
          </div>
          {step}
        </div>
      </div>
      <Toaster />
    </div>
  );
}
