"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import type { GarageTruck } from "@/lib/garage/queries";
import type { TruckInput } from "@/lib/garage/schema";
import type { CascadeOption } from "@/lib/garage/cascade";
import {
  addTruck,
  updateTruck,
  type AddTruckResult,
  type UpdateTruckResult,
} from "@/lib/actions/garage";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TruckCascade } from "./truck-cascade";

// Add/Edit modal wrapping the cascade. In ADD mode an "Add truck" button is the
// trigger; in EDIT mode the parent (truck-card) controls open/onOpenChange and
// passes the existing truck for pre-fill. On the cascade's submit we call the
// Wave-2 action inside startTransition, toast, and router.refresh() so the
// force-dynamic garage page re-reads and the new/updated card appears instantly
// (no manual refresh). On failure we keep the dialog open and map the typed
// action error to friendly copy — invalid_combo is the "Missing your truck?"
// affordance.

type ActionError =
  | Extract<AddTruckResult, { ok: false }>["error"]
  | Extract<UpdateTruckResult, { ok: false }>["error"];

function actionErrorMessage(error: ActionError): string {
  switch (error) {
    case "invalid_combo":
      return "We couldn't find that truck in our library. Missing your truck? Let us know.";
    case "duplicate":
      return "You already saved that truck.";
    case "cap_reached":
      return "You've reached the garage limit.";
    case "not_found":
      return "That truck no longer exists. Refresh and try again.";
    case "unauthenticated":
      return "Your session expired — please log in again.";
    case "invalid":
    default:
      return "Something went wrong. Check your selections and try again.";
  }
}

export function AddTruckDialog({
  makes,
  truck,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  trigger = true,
}: {
  makes: CascadeOption[];
  truck?: GarageTruck;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: boolean;
}) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) controlledOnOpenChange?.(next);
    else setUncontrolledOpen(next);
  };

  const isEdit = Boolean(truck);

  const defaults = truck
    ? {
        makeId: truck.makeId,
        modelId: truck.modelId,
        configId: truck.configId,
        year: truck.year,
        nickname: truck.nickname ?? "",
      }
    : undefined;

  function onSubmit(values: TruckInput) {
    setPending(true);
    React.startTransition(async () => {
      const result =
        isEdit && truck
          ? await updateTruck(truck.id, values)
          : await addTruck(values);

      if (result.ok) {
        toast.success(isEdit ? "Truck updated" : "Truck added");
        setOpen(false);
        router.refresh(); // force-dynamic page re-reads -> card appears instantly
      } else {
        toast.error(actionErrorMessage(result.error));
      }
      setPending(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && !isEdit && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="size-4" />
            Add truck
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit truck" : "Add a truck"}</DialogTitle>
          <DialogDescription>
            Pick your truck from our library so we can match parts that fit.
          </DialogDescription>
        </DialogHeader>
        {/* Remount on open so the cascade resets/pre-fills cleanly each time. */}
        {open && (
          <TruckCascade
            makes={makes}
            defaults={defaults}
            submitLabel={isEdit ? "Save changes" : "Add truck"}
            pending={pending}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
