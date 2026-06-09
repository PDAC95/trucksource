"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { displayNameSchema, type DisplayNameInput } from "@/lib/account/schema";
import {
  updateDisplayName,
  type UpdateDisplayNameResult,
} from "@/lib/actions/account";
import { resolvePublicName } from "@/lib/seller/badge";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ACCT-08: the deliberate, reversible public-name reveal flow on /account.
//
// - RHF + zodResolver(displayNameSchema) — the SAME schema updateDisplayName
//   re-validates at the trust boundary (single client+server source of truth).
// - Submitting a non-empty name opens an explicit confirmation modal ("this will be
//   public"). Only Confirm calls updateDisplayName; on success a preview toast shows
//   the exact resulting public name (the returned publicName).
// - "Revert to anonymous" (shown only when a name is currently set) writes null,
//   restoring the SAME original handle — username is never mutated (Pitfall 2).
//
// The legal private name lives in profiles_private and is NEVER read here.

function actionErrorMessage(
  error: Extract<UpdateDisplayNameResult, { ok: false }>["error"],
): string {
  switch (error) {
    case "unauthenticated":
      return "Your session expired — please log in again.";
    case "not_found":
      return "We couldn't find your account. Refresh and try again.";
    case "invalid":
    default:
      return "That name doesn't look right. Use 1–50 characters.";
  }
}

export function DisplayNameForm({
  current,
}: {
  current: { displayName: string | null; username: string };
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingName, setPendingName] = React.useState<string | null>(null);

  const hasDisplayName = current.displayName !== null;
  const currentPublicName = resolvePublicName(
    current.displayName,
    current.username,
  );

  const form = useForm<DisplayNameInput>({
    resolver: zodResolver(displayNameSchema),
    defaultValues: { displayName: current.displayName ?? "" },
  });

  // Step 1: a valid non-empty name opens the confirmation modal (no write yet).
  function onSubmit(values: DisplayNameInput) {
    setPendingName(values.displayName);
    setConfirmOpen(true);
  }

  // Step 2: only Confirm performs the owner-scoped write.
  function onConfirm() {
    if (pendingName === null) return;
    setPending(true);
    React.startTransition(async () => {
      const result = await updateDisplayName({ displayName: pendingName });
      if (result.ok) {
        toast.success(`Your public name is now: ${result.publicName}`);
        setConfirmOpen(false);
        router.refresh();
      } else {
        toast.error(actionErrorMessage(result.error));
      }
      setPending(false);
    });
  }

  // Revert: write null → the original anonymous handle returns (same handle).
  function onRevert() {
    setPending(true);
    React.startTransition(async () => {
      const result = await updateDisplayName({ displayName: null });
      if (result.ok) {
        toast.success(
          `You're anonymous again — your handle ${current.username} is back.`,
        );
        form.reset({ displayName: "" });
        router.refresh();
      } else {
        toast.error(actionErrorMessage(result.error));
      }
      setPending(false);
    });
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <h2 className="text-base font-medium">Public name</h2>
        <p className="text-muted-foreground text-sm">
          By default buyers see your anonymous handle{" "}
          <span className="font-medium">{current.username}</span>. You can
          reveal a real or business name that replaces it on your profile and
          listings.
          {hasDisplayName && (
            <>
              {" "}
              Buyers currently see{" "}
              <span className="font-medium">{currentPublicName}</span>.
            </>
          )}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    maxLength={50}
                    placeholder="e.g. Smith Truck Parts"
                    className="sm:w-80"
                  />
                </FormControl>
                <FormDescription>
                  1–50 characters. This will be publicly visible.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending} className="w-fit">
              {hasDisplayName ? "Update public name" : "Reveal public name"}
            </Button>
            {hasDisplayName && (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={onRevert}
                className="w-fit"
              >
                Revert to anonymous
              </Button>
            )}
          </div>
        </form>
      </Form>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make your name public?</DialogTitle>
            <DialogDescription>
              {pendingName ? (
                <>
                  <span className="font-medium text-foreground">
                    {pendingName}
                  </span>{" "}
                  will be publicly visible on all your listings and your
                  profile, replacing your anonymous handle. You can revert to
                  anonymous anytime.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={onConfirm}>
              {pending ? "Saving…" : "Yes, make it public"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
