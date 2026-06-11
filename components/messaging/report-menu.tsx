"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Flag, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

import {
  REPORT_REASONS,
  reportSchema,
  type ReportInput,
} from "@/lib/messaging/schema";
import { submitReport } from "@/lib/actions/reports";

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// The reusable MSG-07 report affordance: a kebab DropdownMenu whose single
// "Report" item opens a reason+detail Dialog wired to submitReport. Mounted on
// comments (09-03), listings (09-05), and chat messages (09-06) — the
// component is deliberately DUMB: no target-specific logic, just
// targetType/targetId pass-through.
//
// Anon viewers get the SaveButton login-invite posture: the Report item routes
// to /login instead of opening the dialog.
//
// RHF validates reportSchema on the client (UX); submitReport re-validates the
// SAME schema server-side (trust boundary). targetType/targetId ride in
// defaultValues — the user only ever picks a reason and types optional detail.

// What the inputs hold pre-transform (detail "" → undefined happens in the
// schema), vs ReportInput = the parsed output handed to onValid
// (comment-composer precedent).
type ReportFormValues = z.input<typeof reportSchema>;

export function ReportMenu({
  targetType,
  targetId,
  isAuthenticated,
}: {
  targetType: "listing" | "comment" | "message";
  targetId: number;
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const form = useForm<ReportFormValues, unknown, ReportInput>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      targetType,
      targetId,
      reason: undefined,
      detail: "",
    },
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) form.reset();
  }

  const onValid = (values: ReportInput) => {
    startTransition(async () => {
      const res = await submitReport(values);
      if (res.ok) {
        toast.success("Report submitted — our team will review it.");
        onOpenChange(false);
        return;
      }
      switch (res.error) {
        case "already_reported":
          toast.info("You've already reported this.");
          onOpenChange(false);
          break;
        case "rate_limited":
          toast.error("Too many reports today. Try again tomorrow.");
          break;
        default:
          toast.error("Something went wrong. Try again.");
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="More options"
            className="text-muted-foreground"
            onClick={(e) => {
              // Cards/rows may wrap themselves in a Link — never navigate.
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              if (!isAuthenticated) {
                router.push("/login");
                return;
              }
              setOpen(true);
            }}
          >
            <Flag className="size-4" />
            Report
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report this {targetType}</DialogTitle>
            <DialogDescription>
              Tell us what&apos;s wrong — our team will take a look.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onValid)}
              className="grid gap-4"
              noValidate
            >
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <Select
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a reason" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {REPORT_REASONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
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
                name="detail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Details (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value ?? ""}
                        maxLength={1000}
                        rows={4}
                        placeholder="Anything else we should know?"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                  {pending ? "Submitting…" : "Submit report"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
