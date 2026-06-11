"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  banUser,
  reactivateUser,
  renameUsername,
  suspendUser,
  warnUser,
  type EnforcementResult,
} from "@/lib/actions/admin/enforcement";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

// ADMO-01 enforcement dialogs, mounted on /admin/users/[id]. Pure UX — every
// action re-gates itself with requireAdmin() server-side.

type Restriction = { state: "suspended" | "banned" } | null;

function useEnforcement() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function run(
    action: () => Promise<EnforcementResult>,
    successMessage: string,
    close: () => void,
  ) {
    setPending(true);
    const res = await action();
    setPending(false);
    if (res.ok) {
      toast.success(successMessage);
      close();
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return { pending, run };
}

function WarnDialog({
  userId,
  username,
}: {
  userId: string;
  username: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const { pending, run } = useEnforcement();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Warn
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Warn {username}</DialogTitle>
          <DialogDescription>
            Sends a warning email and records it in the audit log. No account
            restriction is applied.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="warn-reason">Reason (required)</Label>
          <Textarea
            id="warn-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Explain the rule violation…"
          />
        </div>
        <DialogFooter>
          <Button
            disabled={pending || reason.trim().length < 3}
            onClick={() =>
              run(
                () => warnUser({ userId, reason: reason.trim() }),
                "Warning sent.",
                () => {
                  setOpen(false);
                  setReason("");
                },
              )
            }
          >
            {pending ? "Sending…" : "Send warning"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SuspendDialog({
  userId,
  username,
}: {
  userId: string;
  username: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [duration, setDuration] = React.useState<"24h" | "7d" | "30d">("24h");
  const [reason, setReason] = React.useState("");
  const { pending, run } = useEnforcement();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Suspend
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend {username}</DialogTitle>
          <DialogDescription>
            Hides their listings and blocks posting and messaging until the
            suspension ends. They keep read-only access to their messages.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Duration</Label>
            <RadioGroup
              value={duration}
              onValueChange={(v) => setDuration(v as "24h" | "7d" | "30d")}
              className="flex gap-4"
            >
              {(
                [
                  ["24h", "24 hours"],
                  ["7d", "7 days"],
                  ["30d", "30 days"],
                ] as const
              ).map(([value, label]) => (
                <div key={value} className="flex items-center gap-2">
                  <RadioGroupItem id={`suspend-${value}`} value={value} />
                  <Label htmlFor={`suspend-${value}`} className="font-normal">
                    {label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="suspend-reason">Reason (required)</Label>
            <Textarea
              id="suspend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Shown to the user on the suspension screen…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={pending || reason.trim().length < 3}
            onClick={() =>
              run(
                () => suspendUser({ userId, duration, reason: reason.trim() }),
                "User suspended.",
                () => {
                  setOpen(false);
                  setReason("");
                },
              )
            }
          >
            {pending ? "Suspending…" : "Suspend user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BanDialog({ userId, username }: { userId: string; username: string }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const { pending, run } = useEnforcement();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Ban
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ban {username}</DialogTitle>
          <DialogDescription>
            Permanently blocks the account and hides all their listings. Only an
            explicit reactivation reverses this.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="ban-reason">Reason (required)</Label>
          <Textarea
            id="ban-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Shown to the user on the banned screen…"
          />
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={pending || reason.trim().length < 3}
            onClick={() =>
              run(
                () => banUser({ userId, reason: reason.trim() }),
                "User banned.",
                () => {
                  setOpen(false);
                  setReason("");
                },
              )
            }
          >
            {pending ? "Banning…" : "Ban user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReactivateDialog({
  userId,
  username,
  restriction,
}: {
  userId: string;
  username: string;
  restriction: NonNullable<Restriction>;
}) {
  const [open, setOpen] = React.useState(false);
  const { pending, run } = useEnforcement();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm">
          Reactivate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reactivate {username}</DialogTitle>
          <DialogDescription>
            Lifts the current{" "}
            {restriction.state === "banned" ? "ban" : "suspension"} and restores
            the listings it hid. Listings hidden by moderation stay hidden.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () => reactivateUser({ userId }),
                "User reactivated.",
                () => setOpen(false),
              )
            }
          >
            {pending ? "Reactivating…" : "Reactivate user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({
  userId,
  username,
}: {
  userId: string;
  username: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [newUsername, setNewUsername] = React.useState("");
  const [reason, setReason] = React.useState("");
  const { pending, run } = useEnforcement();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Rename username
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename {username}</DialogTitle>
          <DialogDescription>
            Replaces the public username (for example an offensive handle). The
            user is notified by email.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="rename-username">New username</Label>
            <Input
              id="rename-username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              maxLength={20}
              placeholder="3-20 letters and numbers"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rename-reason">Reason (required)</Label>
            <Textarea
              id="rename-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Why this rename is needed…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={
              pending ||
              reason.trim().length < 3 ||
              !/^[A-Za-z0-9]{3,20}$/.test(newUsername.trim())
            }
            onClick={() =>
              run(
                () =>
                  renameUsername({
                    userId,
                    newUsername: newUsername.trim(),
                    reason: reason.trim(),
                  }),
                "Username changed.",
                () => {
                  setOpen(false);
                  setNewUsername("");
                  setReason("");
                },
              )
            }
          >
            {pending ? "Renaming…" : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EnforcementActions({
  userId,
  username,
  restriction,
}: {
  userId: string;
  username: string;
  restriction: Restriction;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <WarnDialog userId={userId} username={username} />
      {!restriction && <SuspendDialog userId={userId} username={username} />}
      {restriction?.state !== "banned" && (
        <BanDialog userId={userId} username={username} />
      )}
      {restriction && (
        <ReactivateDialog
          userId={userId}
          username={username}
          restriction={restriction}
        />
      )}
      <RenameDialog userId={userId} username={username} />
    </div>
  );
}
