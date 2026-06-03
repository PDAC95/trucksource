"use client";

import * as React from "react";
import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { resetSchema, type ResetInput } from "@/lib/validation/auth";
import { resetPassword } from "@/app/(auth)/reset-password/actions";

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
import { PasswordStrength } from "@/components/auth/password-strength";

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(resetPassword, {});

  const form = useForm<ResetInput>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "" },
    mode: "onBlur",
  });

  const password = form.watch("password") ?? "";

  React.useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  const onValid = (values: ResetInput) => {
    const fd = new FormData();
    fd.set("password", values.password);
    React.startTransition(() => formAction(fd));
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Set a new password
        </h1>
        <p className="text-muted-foreground text-sm">
          Choose a new password for your account.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onValid)} className="grid gap-4">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    {...field}
                  />
                </FormControl>
                <PasswordStrength password={password} />
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Updating…" : "Update password"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
