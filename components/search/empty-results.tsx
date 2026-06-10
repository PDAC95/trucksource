"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SearchX } from "lucide-react";

// LOCKED: empty results are NEVER a dead-end. A friendly message + a "Limpiar filtros"
// action that router.replace-es to "/" (clearing every param → back to the open feed).
export function EmptyResults() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed py-16 text-center">
      <SearchX className="size-10 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-base font-medium">No encontramos resultados</p>
        <p className="text-sm text-muted-foreground">
          Prueba con otra palabra o quita algunos filtros.
        </p>
      </div>
      <Button variant="outline" onClick={() => router.replace("/")}>
        Limpiar filtros
      </Button>
    </div>
  );
}
