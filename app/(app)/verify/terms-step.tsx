"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  acceptTermsSchema,
  type AcceptTermsInput,
  TERMS_VERSION,
} from "@/lib/verify/schema";
import { acceptTerms } from "@/lib/actions/verify";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

// Step 3 — marketplace-terms acceptance (VERF-03). The accepted version is stamped
// with TERMS_VERSION (the string the user actually saw) and persisted alongside
// marketplace_terms_accepted_at via the acceptTerms action (owner RLS).
export function TermsStep() {
  const router = useRouter();
  const form = useForm<AcceptTermsInput>({
    resolver: zodResolver(acceptTermsSchema),
    defaultValues: {
      accept: false as unknown as true,
      termsVersion: TERMS_VERSION,
    },
    mode: "onSubmit",
  });
  const [isPending, setIsPending] = React.useState(false);

  const onValid = (values: AcceptTermsInput) => {
    setIsPending(true);
    React.startTransition(async () => {
      const result = await acceptTerms({
        accept: values.accept,
        termsVersion: values.termsVersion,
      });
      if (result.ok) {
        toast.success("You're verified!");
        router.refresh(); // re-resolves to the verified panel
      } else {
        toast.error(
          result.error === "unauthenticated"
            ? "Your session expired — please log in again."
            : "Please accept the marketplace terms to continue.",
        );
        setIsPending(false);
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onValid)} className="grid gap-4">
        <FormField
          control={form.control}
          name="accept"
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
                    marketplace terms
                  </Link>
                </FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Finishing…" : "Finish verification"}
        </Button>
      </form>
    </Form>
  );
}
