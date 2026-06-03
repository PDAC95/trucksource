"use client";

import * as React from "react";
import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import Link from "next/link";

import { registerSchema, type RegisterInput } from "@/lib/validation/auth";
import { COUNTRIES, statesForCountry } from "@/lib/geo/locations";
import { register as registerAction } from "@/app/(auth)/register/actions";

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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UsernameField } from "@/components/auth/username-field";
import { PasswordStrength } from "@/components/auth/password-strength";

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, {});

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      country: undefined,
      stateProvince: "",
      username: "",
      password: "",
      acceptTerms: false as unknown as true,
    },
    mode: "onBlur",
  });

  const country = form.watch("country");
  const password = form.watch("password") ?? "";

  // Surface the generic server-action error via toast (anti-enumeration copy).
  React.useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  // RHF validates on the client (UX). On success we serialize the validated
  // values into FormData and hand them to the action via startTransition so the
  // server re-validates the SAME schema (trust boundary). Building FormData
  // ourselves guarantees the Radix-controlled selects/checkbox reach the server.
  const onValid = (values: RegisterInput) => {
    const fd = new FormData();
    fd.set("firstName", values.firstName);
    fd.set("lastName", values.lastName);
    fd.set("email", values.email);
    fd.set("phone", values.phone);
    fd.set("country", values.country);
    fd.set("stateProvince", values.stateProvince);
    fd.set("username", values.username ?? "");
    fd.set("password", values.password);
    fd.set("acceptTerms", values.acceptTerms ? "true" : "false");
    React.startTransition(() => formAction(fd));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onValid)} className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First name</FormLabel>
                <FormControl>
                  <Input autoComplete="given-name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last name</FormLabel>
                <FormControl>
                  <Input autoComplete="family-name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input type="tel" autoComplete="tel" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Country</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(val) => {
                    field.onChange(val);
                    // Dependent select resets when country changes.
                    form.setValue("stateProvince", "");
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="stateProvince"
            render={({ field }) => (
              <FormItem>
                <FormLabel>State / Province</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={!country}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={
                          country ? "Select" : "Select country first"
                        }
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {statesForCountry(country ?? "").map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <UsernameField
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  placeholder="ChromeKing79"
                />
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
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <PasswordStrength password={password} />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="acceptTerms"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-2.5">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="mt-0.5"
                />
              </FormControl>
              <div className="grid gap-1">
                <FormLabel className="font-normal">
                  I accept the{" "}
                  <Link href="/terms" className="text-primary underline">
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="text-primary underline">
                    Privacy Policy
                  </Link>
                </FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Creating account…" : "Create account"}
        </Button>

        <p className="text-muted-foreground text-center text-sm">
          Already have an account?{" "}
          <Link href="/login" className="text-primary underline">
            Log in
          </Link>
        </p>
      </form>
    </Form>
  );
}
