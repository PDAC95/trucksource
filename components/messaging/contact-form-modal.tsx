"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";

import {
  contactSchema,
  MESSAGE_MAX_LENGTH,
  type ContactInput,
} from "@/lib/messaging/schema";
import { submitContact } from "@/lib/actions/contact";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// The MSG-02 contact form — the gate in front of every new chat thread
// (invariant #5: contact persists + admin copy BEFORE the thread opens;
// submitContact owns that ordering, this modal just feeds it).
//
// Prefill is the BUYER'S OWN PII, fetched server-side from their own
// profiles_private row (owner RLS) and passed down as props — editable here
// because it's their data to send. Nothing about the seller appears in this
// form.
//
// RHF validates contactSchema client-side (UX); submitContact re-validates
// the SAME schema server-side (trust boundary) — the comment-composer /
// report-menu precedent.

// Inputs pre-transform (phone "" → undefined happens in the schema) vs the
// parsed ContactInput handed to onValid.
type ContactFormValues = z.input<typeof contactSchema>;

export function ContactFormModal({
  listingId,
  listingTitle,
  prefill,
  open,
  onOpenChange,
}: {
  listingId: number;
  listingTitle: string;
  prefill: { name: string; email: string; phone?: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const form = useForm<ContactFormValues, unknown, ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      listingId,
      name: prefill?.name ?? "",
      email: prefill?.email ?? "",
      phone: prefill?.phone ?? "",
      message: "",
    },
  });

  const messageLength = (form.watch("message") ?? "").length;

  const onValid = (values: ContactInput) => {
    startTransition(async () => {
      const res = await submitContact(values);
      if (res.ok) {
        // Straight into the private thread — keep the pending state until the
        // route change unmounts us.
        router.push(`/messages/${res.threadId}`);
        return;
      }
      switch (res.error) {
        case "rate_limited":
          toast.error(
            "You've reached the daily contact limit. Try again tomorrow.",
          );
          break;
        case "contacts_closed":
          toast.error("This listing is no longer accepting new contacts.");
          break;
        default:
          toast.error("Something went wrong. Try again.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contact Seller About This Part</DialogTitle>
          <DialogDescription>{listingTitle}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onValid)}
            className="grid gap-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                  <FormLabel>Phone (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      autoComplete="tel"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={4}
                      maxLength={MESSAGE_MAX_LENGTH}
                      placeholder="Ask about condition, fitment, shipping…"
                    />
                  </FormControl>
                  <div className="flex items-center justify-between">
                    <FormMessage />
                    <span className="text-muted-foreground ml-auto text-xs">
                      {messageLength}/{MESSAGE_MAX_LENGTH}
                    </span>
                  </div>
                </FormItem>
              )}
            />
            <p className="text-muted-foreground text-xs">
              Your message is saved and shared with our team before the chat
              opens.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Sending…" : "Send & start chat"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
