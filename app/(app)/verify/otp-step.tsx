"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { checkOtpSchema, type CheckOtpInput } from "@/lib/verify/schema";
import {
  checkOtp,
  sendOtp,
  type CheckOtpResult,
  type SendOtpResult,
} from "@/lib/actions/verify";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";

const RESEND_COOLDOWN_SECONDS = 45;

// Mask all but the last 2 digits of the E.164 number for display.
function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  const tail = phone.slice(-2);
  const head = phone.slice(0, 2); // "+1"
  return `${head} ••• ••• •${tail}`;
}

function checkMessageFor(
  error: Extract<CheckOtpResult, { ok: false }>["error"],
): string {
  switch (error) {
    case "invalid_code":
      return "That code didn't match. Check it and try again.";
    case "no_pending":
      return "No code is pending — send a new one.";
    case "unauthenticated":
      return "Your session expired — please log in again.";
    case "invalid":
    default:
      return "Enter the 6-digit code from your text message.";
  }
}

function sendMessageFor(
  error: Extract<SendOtpResult, { ok: false }>["error"],
): string {
  switch (error) {
    case "region_unsupported":
      return "We can only verify US/Canada (+1) numbers right now.";
    case "rate_limited":
      return "Too many attempts — please try again later.";
    case "spend_cap":
      return "Verification is temporarily unavailable, please try later.";
    case "unauthenticated":
      return "Your session expired — please log in again.";
    default:
      return "We couldn't resend the code. Please try again.";
  }
}

export function OtpStep({ initialPhone }: { initialPhone: string }) {
  const router = useRouter();
  const form = useForm<CheckOtpInput>({
    resolver: zodResolver(checkOtpSchema),
    defaultValues: { code: "" },
    mode: "onSubmit",
  });
  const [isPending, setIsPending] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  // Live resend countdown — starts immediately since the OTP was just sent
  // (either on arrival from phone-step or on resume).
  const [cooldown, setCooldown] = React.useState(RESEND_COOLDOWN_SECONDS);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => {
      setCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const onValid = (values: CheckOtpInput) => {
    setIsPending(true);
    React.startTransition(async () => {
      const result = await checkOtp({ code: values.code });
      if (result.ok) {
        toast.success("Phone verified.");
        router.refresh(); // re-resolves to the terms step
      } else {
        toast.error(checkMessageFor(result.error));
        form.setValue("code", "");
        setIsPending(false);
      }
    });
  };

  const onResend = () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    React.startTransition(async () => {
      const result = await sendOtp({ phone: initialPhone });
      if (result.ok) {
        toast.success("New code sent.");
        setCooldown(RESEND_COOLDOWN_SECONDS);
      } else {
        toast.error(sendMessageFor(result.error));
      }
      setResending(false);
    });
  };

  // "Change number": clear the OTP and route back to phone entry by re-rendering
  // phone-step. Re-sending from there invalidates the prior code at Twilio. We
  // navigate with a query flag the page reads to force the phone step even though
  // a phone is on file.
  const onChangeNumber = () => {
    router.push("/verify?change=1");
  };

  return (
    <div className="grid gap-5">
      <p className="text-muted-foreground text-center text-sm">
        Verifying <span className="font-medium">{maskPhone(initialPhone)}</span>
      </p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onValid)} className="grid gap-4">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem className="flex flex-col items-center gap-2">
                <FormControl>
                  <InputOTP
                    maxLength={6}
                    value={field.value}
                    onChange={field.onChange}
                    autoFocus
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} className="size-12 text-base" />
                      <InputOTPSlot index={1} className="size-12 text-base" />
                      <InputOTPSlot index={2} className="size-12 text-base" />
                      <InputOTPSlot index={3} className="size-12 text-base" />
                      <InputOTPSlot index={4} className="size-12 text-base" />
                      <InputOTPSlot index={5} className="size-12 text-base" />
                    </InputOTPGroup>
                  </InputOTP>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Verifying…" : "Verify"}
          </Button>
        </form>
      </Form>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onResend}
          disabled={cooldown > 0 || resending}
          className="text-primary underline disabled:text-muted-foreground disabled:no-underline"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
        <button
          type="button"
          onClick={onChangeNumber}
          className="text-muted-foreground underline"
        >
          Change number
        </button>
      </div>
    </div>
  );
}
