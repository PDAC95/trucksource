"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  contactPreferenceSchema,
  type ContactPreferenceInput,
  type ContactPreference,
} from "@/lib/account/schema";
import {
  updateContactPreference,
  type UpdateContactPreferenceResult,
} from "@/lib/actions/account";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// LIST-07: the ONLY place the contact preference is edited (the listing form
// merely displays it). RHF + zodResolver(contactPreferenceSchema) — the SAME
// schema updateContactPreference re-validates (single client+server source of
// truth). Submit runs the action inside startTransition, toasts, and
// router.refresh()-es the force-dynamic page so the saved value is re-read.

type Option = {
  value: ContactPreference;
  label: string;
  helper: string;
};

// Marketplace Messaging Only is the most-private DEFAULT — listed first so the
// recommended/private option leads.
const OPTIONS: Option[] = [
  {
    value: "messaging_only",
    label: "Marketplace Messaging Only",
    helper:
      "Most private (recommended). Buyers reach you through in-site messaging — your email and phone stay hidden.",
  },
  {
    value: "email_only",
    label: "Email",
    helper: "Buyers can also reach you by email through the contact flow.",
  },
  {
    value: "email_phone",
    label: "Email + Phone",
    helper:
      "Buyers can also reach you by email and phone through the contact flow.",
  },
];

function actionErrorMessage(
  error: Extract<UpdateContactPreferenceResult, { ok: false }>["error"],
): string {
  switch (error) {
    case "unauthenticated":
      return "Your session expired — please log in again.";
    case "not_found":
      return "We couldn't find your account. Refresh and try again.";
    case "invalid":
    default:
      return "Something went wrong. Please try again.";
  }
}

export function ContactPreferenceForm({
  current,
}: {
  current: ContactPreference;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const form = useForm<ContactPreferenceInput>({
    resolver: zodResolver(contactPreferenceSchema),
    defaultValues: { contactPreference: current },
  });

  function onSubmit(values: ContactPreferenceInput) {
    setPending(true);
    React.startTransition(async () => {
      const result = await updateContactPreference(values);
      if (result.ok) {
        toast.success("Contact preference saved");
        router.refresh(); // force-dynamic page re-reads the saved value
      } else {
        toast.error(actionErrorMessage(result.error));
      }
      setPending(false);
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
        <FormField
          control={form.control}
          name="contactPreference"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="grid gap-3"
                >
                  {OPTIONS.map((opt) => (
                    <Label
                      key={opt.value}
                      htmlFor={`contact-${opt.value}`}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 has-[:checked]:border-primary"
                    >
                      <RadioGroupItem
                        id={`contact-${opt.value}`}
                        value={opt.value}
                        className="mt-0.5"
                      />
                      <span className="grid gap-1">
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-muted-foreground text-sm">
                          {opt.helper}
                        </span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Saving…" : "Save preference"}
        </Button>
      </form>
    </Form>
  );
}
