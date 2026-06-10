"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw } from "lucide-react";

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

// LIST-06 owner control — the reversible sold toggle on the listing detail
// page, alongside RenewButton. Status-driven:
//   - active → "Marcar como vendido"  (confirmed: leaves search/feed, the page
//     stays visible with the Vendido badge — the LOCKED sold treatment)
//   - sold   → "Marcar como disponible" (lighter confirmation; restores the
//     listing with its ORIGINAL expiry — markAvailable never touches the clock)
//   - anything else (expired) → renders nothing; reactivation is RenewButton's
//     job (reactivateListing is the clock writer, not markAvailable).
//
// Both actions are owner-scoped server-side (getClaims + owner RLS); zero rows
// → not_found, surfaced as a friendly toast.

export function SoldToggle({
  listingId,
  status,
}: {
  listingId: number;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  if (status !== "active" && status !== "sold") return null;
  const isSold = status === "sold";

  function run() {
    startTransition(async () => {
      const result = isSold
        ? await markAvailable(listingId)
        : await markSold(listingId);
      if (result.ok) {
        toast.success(
          isSold
            ? "Anuncio disponible de nuevo"
            : "Anuncio marcado como vendido",
        );
        router.refresh();
        return;
      }
      if (result.error === "unauthenticated") {
        toast.error("Tu sesión expiró — inicia sesión de nuevo.");
      } else {
        // not_found / invalid: raced status flip or not the caller's listing.
        toast.error("No se pudo actualizar");
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={pending}>
          {isSold ? (
            <RotateCcw className="size-4" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          {pending
            ? "Actualizando…"
            : isSold
              ? "Marcar como disponible"
              : "Marcar como vendido"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isSold ? "¿Marcar como disponible?" : "¿Marcar como vendido?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isSold
              ? "Volverá a aparecer en la búsqueda y el feed con su vigencia original."
              : "Saldrá de la búsqueda y el feed, pero la página seguirá visible con la etiqueta Vendido."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={run}>
            {isSold ? "Marcar como disponible" : "Marcar como vendido"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
