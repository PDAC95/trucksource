"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  updateMessageEmailOptOut,
  type UpdateMessageEmailOptOutResult,
} from "@/lib/actions/account";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// The new-message email opt-out toggle on /account (MSG email notifications).
// Clones the seller-type-form auto-save discipline: flip → server action in a
// transition → toast → router.refresh() (the force-dynamic page re-reads the
// saved value); revert the control on failure.
//
// The UI exposes the POSITIVE preference ("Email me…", on by default); the
// column stores the opt-OUT — updateMessageEmailOptOut handles the inversion
// via the owner-RLS write on profiles_private.message_email_opt_out.

function actionErrorMessage(
  error: Extract<UpdateMessageEmailOptOutResult, { ok: false }>["error"],
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

export function MessageEmailForm({ current }: { current: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [enabled, setEnabled] = React.useState(current);

  function onCheckedChange(checked: boolean) {
    setEnabled(checked);
    setPending(true);
    React.startTransition(async () => {
      const result = await updateMessageEmailOptOut({ enabled: checked });
      if (result.ok) {
        toast.success(
          checked
            ? "You'll get an email about new messages."
            : "New-message emails turned off.",
        );
        router.refresh();
      } else {
        toast.error(actionErrorMessage(result.error));
        setEnabled(current); // revert the control on failure
      }
      setPending(false);
    });
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <p className="text-sm leading-none font-medium">Notifications</p>
        <p className="text-muted-foreground text-sm">
          How we let you know about activity on your conversations.
        </p>
      </div>
      <Label
        htmlFor="message-email"
        className="flex cursor-pointer items-start gap-3 rounded-lg border p-4"
      >
        <Checkbox
          id="message-email"
          checked={enabled}
          onCheckedChange={(checked) => onCheckedChange(checked === true)}
          disabled={pending}
          className="mt-0.5"
        />
        <span className="grid gap-1">
          <span className="font-medium">Email me about new messages</span>
          <span className="text-muted-foreground text-sm font-normal">
            We send at most one email per conversation until you read it.
          </span>
        </span>
      </Label>
    </div>
  );
}
