"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Truck } from "lucide-react";
import type { GarageTruck } from "@/lib/garage/queries";

// The STAR feature — prominent, NOT buried in the facet list. The page server-resolves
// the viewer's state (getClaims, never getSession) and passes the matching variant:
//   - "anon"  → invite to log in + add a truck.
//   - "empty" → logged-in but no trucks → CTA to add one in the garage (Phase 4).
//   - "has"   → a truck selector. Choosing a truck sets `fits` (modelId) and, when the
//               truck was saved at config granularity, `fitsConfig` (configId) in the
//               URL. It surfaces as a removable "Fits: …" chip and ANDs with the keyword
//               + facets (LOCKED). Clearing returns to "Todos".
//
// All-state-in-URL: the control reads/writes only the `fits`/`fitsConfig` params.

const NONE = "__none__";

export type FitsState =
  | { variant: "anon" }
  | { variant: "empty" }
  | { variant: "has"; trucks: GarageTruck[] };

function truckLabel(t: GarageTruck): string {
  const base = `${t.year} ${t.makeName} ${t.modelName}`.trim();
  return t.configName ? `${base} · ${t.configName}` : base;
}

// Module-level so it isn't re-created on every render (lint: components-during-render).
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Truck className="size-4 text-primary" />
        Fits my truck
      </div>
      {children}
    </div>
  );
}

export function FitsMyTruckControl({ state }: { state: FitsState }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (state.variant === "anon") {
    return (
      <Wrapper>
        <p className="text-xs text-muted-foreground">
          Inicia sesión y agrega tu camión para filtrar por fitment.
        </p>
        <Button asChild variant="default" size="sm" className="w-fit">
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </Wrapper>
    );
  }

  if (state.variant === "empty") {
    return (
      <Wrapper>
        <p className="text-xs text-muted-foreground">
          Aún no tienes camiones. Agrega uno a tu garage para filtrar.
        </p>
        <Button asChild variant="default" size="sm" className="w-fit">
          <Link href="/profile/garage">Agregar camión</Link>
        </Button>
      </Wrapper>
    );
  }

  // variant === "has"
  const current = searchParams.get("fits") ?? NONE;
  // Match the selected truck by its modelId (+ configId when present) so the selector
  // reflects the active URL state.
  const selectedTruck = state.trucks.find((t) => {
    if (String(t.modelId) !== searchParams.get("fits")) return false;
    const cfg = searchParams.get("fitsConfig");
    return t.configId === null ? cfg === null : String(t.configId) === cfg;
  });

  function onSelect(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (value === NONE) {
      params.delete("fits");
      params.delete("fitsConfig");
    } else {
      const truck =
        state.variant === "has"
          ? state.trucks.find((t) => String(t.id) === value)
          : undefined;
      if (truck) {
        params.set("fits", String(truck.modelId));
        if (truck.configId !== null)
          params.set("fitsConfig", String(truck.configId));
        else params.delete("fitsConfig");
      }
    }
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  return (
    <Wrapper>
      <Select
        value={selectedTruck ? String(selectedTruck.id) : NONE}
        onValueChange={onSelect}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Elige tu camión" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Todos los camiones</SelectItem>
          {state.trucks.map((t) => (
            <SelectItem key={t.id} value={String(t.id)}>
              {t.nickname ? `${t.nickname} — ${truckLabel(t)}` : truckLabel(t)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current !== NONE && (
        <p className="text-xs text-muted-foreground">
          Filtrando por las partes que caben en tu camión.
        </p>
      )}
    </Wrapper>
  );
}
