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

// Open-redirect guard (17-RESEARCH Pattern 2): a ?next is safe only if it is an
// internal, scheme-less path. `next` is attacker-controllable (it rides in the
// URL the gate built), so it is NEVER trusted raw — an unsafe value falls back
// to the in-page panel rather than redirecting off-site.
function safeNext(n?: string): string | null {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : null;
}

// The resume-on-abandon wizard (02-RESEARCH Pattern 5). The single source of truth
// for "which step is the user on" is their own profiles_private row — the same
// columns the verified badge reads — so progress survives navigation and reload.
// We re-read claims (defensive; layout already gated) and select only the three
// resume signals via owner RLS, then branch to the correct client step.
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ change?: string; next?: string; require?: string }>;
}) {
  const { change, next, require } = await searchParams;
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

  // Required level: ?require=phone (contact gate) needs only a verified phone;
  // anything else — including the default/absent (seller gate) — also needs the
  // marketplace terms. `done` is the level-aware completion signal.
  const requireTerms = require !== "phone";
  const done = phoneVerified && (!requireTerms || termsAccepted);

  // Completion redirect: when the required level is satisfied and a safe ?next
  // was supplied, bounce the user back to where the gate sent them from. An
  // unsafe/absent next falls through to the existing in-page panel below.
  if (done) {
    const target = safeNext(next);
    if (target) redirect(target);
  }

  let step: React.ReactNode;
  let heading: string;
  let subhead: string;

  if (done) {
    // Required level satisfied (terms too, unless require=phone) but no safe
    // ?next to bounce to — show the confirmation panel with a forward link.
    heading = "You're a verified seller";
    subhead = "Your phone and marketplace terms are confirmed.";
    step = (
      <div className="grid gap-3">
        <Button asChild className="w-full">
          <Link href="/">Go to your dashboard</Link>
        </Button>
      </div>
    );
  } else if (requireTerms && phoneVerified && !termsAccepted) {
    // Phone verified, terms outstanding, and this level requires them — last
    // step. Under require=phone this branch is skipped (done is already true).
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
