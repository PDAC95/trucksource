"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";

import {
  dismissReportGroup,
  resolveReportGroup,
  type ReportActionResult,
} from "@/lib/actions/admin/reports";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Resolve / Dismiss for a report GROUP — one action closes ALL pending
// reports on the target (locked decision). The admin note is required; it
// lands on every row and shows up in the Resolved/Dismissed tabs. Enforcement
// is the SEPARATE buttons above — "act, then resolve with note" stays two
// explicit clicks, never auto-chained.

function errorMessage(error: string): string {
  switch (error) {
    case "note_required":
      return "An admin note is required.";
    case "not_found":
      return "No pending reports left on this target — refreshing.";
    case "invalid":
      return "Bad target reference.";
    default:
      return "Something went wrong. Try again.";
  }
}

function GroupCloseDialog({
  targetKey,
  pendingCount,
  verb,
  variant,
  icon,
  description,
  action,
}: {
  targetKey: string;
  pendingCount: number;
  verb: string;
  variant: "default" | "outline";
  icon: React.ReactNode;
  description: string;
  action: (input: {
    targetKey: string;
    adminNote: string;
  }) => Promise<ReportActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          {icon}
          {verb}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {verb} {pendingCount === 1 ? "this report" : "these reports"}?
          </DialogTitle>
          <DialogDescription>
            {description} All {pendingCount} pending{" "}
            {pendingCount === 1 ? "report" : "reports"} on this target close in
            one action. This is logged.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`note-${verb}`}>Admin note (required)</Label>
          <Textarea
            id={`note-${verb}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was done / why this outcome?"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant={variant}
            disabled={pending || note.trim().length === 0}
            onClick={() =>
              startTransition(async () => {
                const result = await action({
                  targetKey,
                  adminNote: note.trim(),
                });
                if (result.ok) {
                  toast.success(
                    `Report group ${verb.toLowerCase()}${verb.endsWith("e") ? "d" : "ed"}.`,
                  );
                  setOpen(false);
                  setNote("");
                  router.refresh();
                } else {
                  toast.error(errorMessage(result.error));
                  if (result.error === "not_found") {
                    setOpen(false);
                    router.refresh();
                  }
                }
              })
            }
          >
            {pending ? "Working…" : verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReportQueueActions({
  targetKey,
  pendingCount,
}: {
  targetKey: string;
  pendingCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <GroupCloseDialog
        targetKey={targetKey}
        pendingCount={pendingCount}
        verb="Resolve"
        variant="default"
        icon={<CheckCircle2 className="size-4" />}
        description="The reports were valid and have been handled (note what you did)."
        action={resolveReportGroup}
      />
      <GroupCloseDialog
        targetKey={targetKey}
        pendingCount={pendingCount}
        verb="Dismiss"
        variant="outline"
        icon={<XCircle className="size-4" />}
        description="The reports don't require action (note why)."
        action={dismissReportGroup}
      />
    </div>
  );
}
