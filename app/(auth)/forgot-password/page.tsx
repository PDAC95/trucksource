"use client";

import * as React from "react";
import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import Link from "next/link";
import { MailCheckIcon } from "lucide-react";

import { forgotSchema, type ForgotInput } from "@/lib/validation/auth";
import { requestPasswordReset } from "@/app/(auth)/forgot-password/actions";

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

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordReset,
    {},
  );

  const form = useForm<ForgotInput>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
    mode: "onBlur",
  });

  React.useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  const onValid = (values: ForgotInput) => {
    const fd = new FormData();
    fd.set("email", values.email);
    React.startTransition(() => formAction(fd));
  };

  if (state.sent) {
    return (
      <div className="grid gap-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
          <MailCheckIcon className="size-6 text-primary" />
        </div>
        <div className="grid gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Check your email
          </h1>
          <p className="text-muted-foreground text-sm">
            If that email is registered, we&apos;ve sent a link to reset your
            password.
          </p>
        </div>
        <Link href="/login" className="text-primary text-sm underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Reset your password
        </h1>
        <p className="text-muted-foreground text-sm">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onValid)} className="grid gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Sending…" : "Send reset link"}
          </Button>

          <p className="text-muted-foreground text-center text-sm">
            Remembered it?{" "}
            <Link href="/login" className="text-primary underline">
              Log in
            </Link>
          </p>
        </form>
      </Form>
    </div>
  );
}
