"use client";

import * as React from "react";
import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import Link from "next/link";

import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { login as loginAction } from "@/app/(auth)/login/actions";

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

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, {});

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  React.useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  // Success toast after a completed password reset (?reset=success). Read from
  // the URL client-side to avoid a Suspense boundary for useSearchParams.
  React.useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("reset") === "success"
    ) {
      toast.success("Password updated — log in with your new password.");
    }
  }, []);

  const onValid = (values: LoginInput) => {
    const fd = new FormData();
    fd.set("email", values.email);
    fd.set("password", values.password);
    React.startTransition(() => formAction(fd));
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground text-sm">
          Log in to your Take-Off Parts account
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
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-muted-foreground text-xs underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Logging in…" : "Log in"}
          </Button>

          <p className="text-muted-foreground text-center text-sm">
            New here?{" "}
            <Link href="/register" className="text-primary underline">
              Create an account
            </Link>
          </p>
        </form>
      </Form>
    </div>
  );
}
