"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

import { sendOtpSchema, type SendOtpInput } from "@/lib/verify/schema";
import { sendOtp, type SendOtpResult } from "@/lib/actions/verify";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Step 1 of the wizard. RHF + zodResolver + sonner, mirroring register-form.
//
// APPROACH (documented per the plan): phone-step and otp-step are SEPARATE files
// but coordinate through the SERVER. sendOtp persists the (unverified) phone to
// profiles_private, so after a successful send we call router.refresh() — the
// force-dynamic server page re-resolves and now renders <OtpStep>. The DB row is
// the single source of truth for "which step", so there is no client step state
// to drift, and the same transition powers resume-on-abandon for free.

// Friendly copy for each Server Action error code (no raw codes to the user).
function messageFor(
  error: Extract<SendOtpResult, { ok: false }>["error"],
): string {
  switch (error) {
    case "region_unsupported":
      return "We can only verify US/Canada (+1) numbers right now.";
    case "rate_limited":
      return "Too many attempts — please try again later.";
    case "spend_cap":
      return "Verification is temporarily unavailable, please try later.";
    case "blocked":
      return "We couldn't process that request. Please try again.";
    case "unauthenticated":
      return "Your session expired — please log in again.";
    case "invalid":
    default:
      return "That phone number doesn't look right. Check and try again.";
  }
}

export function PhoneStep({ initialPhone }: { initialPhone?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const form = useForm<SendOtpInput>({
    resolver: zodResolver(sendOtpSchema),
    defaultValues: { phone: initialPhone ?? "" },
    mode: "onBlur",
  });
  const [isPending, setIsPending] = React.useState(false);

  const onValid = (values: SendOtpInput) => {
    setIsPending(true);
    React.startTransition(async () => {
      const result = await sendOtp({ phone: values.phone });
      if (result.ok) {
        toast.success("Code sent — check your phone.");
        // A code was actually dispatched: advance to the OTP step via an explicit
        // `?sent=1` signal (the page renders OtpStep ONLY when a send happened, not
        // merely because a phone is on file). Preserve the gate's next/require so
        // finishing OTP still bounces back to origin; DROP `change=1` so a
        // "change number" re-send advances instead of re-rendering phone entry.
        const params = new URLSearchParams({ sent: "1" });
        const next = searchParams.get("next");
        const require = searchParams.get("require");
        if (next) params.set("next", next);
        if (require) params.set("require", require);
        router.push(`/verify?${params.toString()}`);
      } else {
        toast.error(messageFor(result.error));
        setIsPending(false);
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onValid)} className="grid gap-4">
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mobile phone</FormLabel>
              <FormControl>
                <Input
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+1 (555) 555-0142"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Sending code…" : "Send code"}
        </Button>
        <p className="text-muted-foreground text-center text-xs">
          US &amp; Canada (+1) mobile numbers only. Standard message rates
          apply.
        </p>
      </form>
    </Form>
  );
}
