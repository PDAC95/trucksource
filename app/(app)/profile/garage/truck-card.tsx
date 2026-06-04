"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";

import type { GarageTruck } from "@/lib/garage/queries";
import type { CascadeOption } from "@/lib/garage/cascade";
import { deleteTruck } from "@/lib/actions/garage";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { AddTruckDialog } from "./add-truck-dialog";

// One saved truck. LABEL FALLBACK (Pitfall 5): if a nickname exists it is the
// prominent title with the Make Model Config string beneath; if there is NO
// nickname, the fitment string ("Peterbilt 379 Day Cab") IS the title. Edit
// reuses AddTruckDialog in edit mode (controlled open); delete is guarded by an
// AlertDialog confirm, then deleteTruck + router.refresh() on the force-dynamic
// page.

function fitmentLabel(t: GarageTruck): string {
  return [t.makeName, t.modelName, t.configName].filter(Boolean).join(" ");
}

export function TruckCard({
  truck,
  makes,
}: {
  truck: GarageTruck;
  makes: CascadeOption[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const fitment = fitmentLabel(truck);
  const hasNickname = Boolean(truck.nickname && truck.nickname.trim());

  function onConfirmDelete() {
    setDeleting(true);
    React.startTransition(async () => {
      const result = await deleteTruck(truck.id);
      if (result.ok) {
        toast.success("Truck removed");
        router.refresh();
      } else {
        toast.error("We couldn't remove that truck. Please try again.");
      }
      setDeleting(false);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {hasNickname ? truck.nickname : fitment}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasNickname && (
          <p className="text-muted-foreground text-sm">{fitment}</p>
        )}
        {!truck.configName && (
          <p className="text-muted-foreground mt-1 text-xs">
            Any configuration
          </p>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditOpen(true)}
          aria-label="Edit truck"
        >
          <Pencil className="size-4" />
          Edit
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={deleting}
              aria-label="Delete truck"
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this truck?</AlertDialogTitle>
              <AlertDialogDescription>
                {hasNickname ? `"${truck.nickname}" (${fitment})` : fitment}{" "}
                will be removed from your garage. This can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onConfirmDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>

      {/* Edit modal (controlled) — reuses the add dialog in edit mode. */}
      <AddTruckDialog
        makes={makes}
        truck={truck}
        open={editOpen}
        onOpenChange={setEditOpen}
        trigger={false}
      />
    </Card>
  );
}
