"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { markSold, markAvailable } from "@/lib/actions/listings";

// LIST-06's My-Listings home: a CONFIRMED, reversible sold toggle per row.
//   - active → "Marcar vendido"      → markSold (status-only update)
//   - sold   → "Marcar disponible"   → markAvailable (status-only; the expiry
//              clock is untouched — renew/reactivate stay the only clock writers)
//   - expired/anything else → renders NOTHING (the EXISTING RenewButton owns the
//     reactivate path; the sold toggle never shows for expired rows).
//
// Colocated with the page (NOT components/listings/* — 08-04 owns that surface).
// Follows the renew-button.tsx pattern: action in a transition, sonner feedback,
// router.refresh() so the force-dynamic page re-reads the row.

export function SoldToggle({
  listingId,
  status,
}: {
  listingId: number;
  status: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  if (status !== "active" && status !== "sold") return null;
  const isSold = status === "sold";

  function run() {
    setPending(true);
    React.startTransition(async () => {
      const result = await (isSold
        ? markAvailable(listingId)
        : markSold(listingId));
      if (result.ok) {
        toast.success(
          isSold
            ? "Anuncio disponible de nuevo"
            : "Anuncio marcado como vendido",
        );
        router.refresh();
      } else if (result.error === "unauthenticated") {
        toast.error("Tu sesión expiró — inicia sesión de nuevo.");
      } else if (result.error === "not_found") {
        toast.error("El anuncio ya no se puede actualizar. Recarga la página.");
      } else {
        toast.error("Algo salió mal. Intenta de nuevo.");
      }
      setPending(false);
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={isSold ? "secondary" : "outline"}
          disabled={pending}
        >
          {isSold ? (
            <RotateCcw className="size-4" />
          ) : (
            <CircleCheck className="size-4" />
          )}
          {pending
            ? "Guardando…"
            : isSold
              ? "Marcar disponible"
              : "Marcar vendido"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isSold ? "¿Marcar como disponible?" : "¿Marcar como vendido?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isSold
              ? "El anuncio volverá a aparecer en el feed y la búsqueda con su fecha de expiración original."
              : "El anuncio dejará de aparecer en el feed y la búsqueda. Puedes revertirlo cuando quieras con “Marcar disponible”."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={run}>
            {isSold ? "Marcar disponible" : "Marcar vendido"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
