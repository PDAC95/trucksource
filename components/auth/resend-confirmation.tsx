"use client";

import * as React from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const COOLDOWN_SECONDS = 60;

// Resend the signup confirmation email. The 60s client cooldown is UX only —
// Supabase enforces the real rate limits platform-side. If the email wasn't
// carried in the query string, prompt for it here.
export function ResendConfirmation({
  email: initialEmail,
}: {
  email?: string;
}) {
  const [email, setEmail] = React.useState(initialEmail ?? "");
  const [cooldown, setCooldown] = React.useState(0);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleResend() {
    if (!email) {
      toast.error("Enter the email you registered with.");
      return;
    }
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setPending(false);
    // Generic feedback either way (anti-enumeration).
    toast.success(
      "If that account needs confirming, a new link is on its way.",
    );
    if (!error) setCooldown(COOLDOWN_SECONDS);
  }

  return (
    <div className="grid gap-3">
      {!initialEmail && (
        <div className="grid gap-1.5 text-left">
          <Label htmlFor="resend-email">Email</Label>
          <Input
            id="resend-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={handleResend}
        disabled={pending || cooldown > 0}
        className="w-full"
      >
        {cooldown > 0
          ? `Resend in ${cooldown}s`
          : pending
            ? "Sending…"
            : "Resend confirmation email"}
      </Button>
    </div>
  );
}
