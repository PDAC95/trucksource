"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Snowflake, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { freezeThread, unfreezeThread } from "@/lib/actions/admin/threads";

// ADMO-04 freeze/unfreeze controls (sold-toggle confirm-dialog pattern).
// Freeze REQUIRES a reason — it lands in the audit log row, not on the thread.

export function ThreadFreezeToggle({
  threadId,
  frozen,
}: {
  threadId: number;
  frozen: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [reason, setReason] = React.useState("");
  const [open, setOpen] = React.useState(false);

  function run() {
    startTransition(async () => {
      const result = frozen
        ? await unfreezeThread({ threadId })
        : await freezeThread({ threadId, reason });
      if (result.ok) {
        toast.success(frozen ? "Thread unfrozen" : "Thread frozen");
        setOpen(false);
        setReason("");
        router.refresh();
        return;
      }
      if (result.error === "reason_required") {
        toast.error("A reason is required to freeze a thread.");
      } else if (result.error === "not_found") {
        toast.error("Thread state already changed — refreshing.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error("Couldn't update the thread.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={pending}>
          {frozen ? (
            <Sun className="size-4" />
          ) : (
            <Snowflake className="size-4" />
          )}
          {pending ? "Updating…" : frozen ? "Unfreeze" : "Freeze"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {frozen ? "Unfreeze this thread?" : "Freeze this thread?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {frozen
              ? "Both participants will be able to send messages again."
              : "No one will be able to send new messages in this thread. Both participants keep read access. This action is logged."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!frozen && (
          <div className="space-y-2">
            <Label htmlFor={`freeze-reason-${threadId}`}>
              Reason (required, recorded in the audit log)
            </Label>
            <Textarea
              id={`freeze-reason-${threadId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this thread being frozen?"
              rows={3}
              maxLength={500}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Keep the dialog open on validation failure; close on success
              // happens in run().
              e.preventDefault();
              if (!frozen && reason.trim().length === 0) {
                toast.error("A reason is required to freeze a thread.");
                return;
              }
              run();
            }}
            disabled={pending}
          >
            {frozen ? "Unfreeze" : "Freeze thread"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
