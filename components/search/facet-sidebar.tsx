"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SlidersHorizontal } from "lucide-react";
import { getModels, getConfigs } from "@/lib/garage/cascade";
import type { CascadeOption } from "@/lib/garage/cascade";
import type { PartCategoryOption } from "@/lib/listings/cascade";

// v1 facet set ONLY (Material & Special-Filter facets are DEFERRED per the locked
// decision — do NOT render them): cascading Make → Model → Configuration, plus Part
// Category and Condition. Every selection re-serializes the query into the URL and
// router.replace-es so results update in-place (all-state-in-URL).
//
// CASCADE: choosing a Make loads its Models (getModels), choosing a Model loads its
// applicable Configs (getConfigs) — dynamic, so the user never sees an impossible
// (model, config) pair. Changing a parent CLEARS its dependent children (new Make wipes
// model+config; new Model wipes config) so the URL never holds a stale combination.
//
// Desktop: rendered inline as a sidebar. Mobile: a "Filters" button opens it in a Sheet
// drawer. The same <FacetControls> body serves both.

type Conditions = { id: number; name: string }[];

const NONE = "__none__";

function FacetControls({
  makes,
  conditions,
  partCategories,
}: {
  makes: CascadeOption[];
  conditions: Conditions;
  partCategories: PartCategoryOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const makeId = searchParams.get("make");
  const modelId = searchParams.get("model");
  const configId = searchParams.get("config");
  const categoryId = searchParams.get("category");
  const conditionId = searchParams.get("condition");

  const [models, setModels] = React.useState<CascadeOption[]>([]);
  const [configs, setConfigs] = React.useState<CascadeOption[]>([]);

  // Load Models whenever a Make is set; resolve to [] when not. setState only happens
  // asynchronously (inside the promise resolution), never synchronously in the effect
  // body — keeps the lint set-state-in-effect rule satisfied.
  React.useEffect(() => {
    let active = true;
    const promise = makeId ? getModels(Number(makeId)) : Promise.resolve([]);
    void promise.then((m) => {
      if (active) setModels(m);
    });
    return () => {
      active = false;
    };
  }, [makeId]);

  // Load Configs whenever a Model is set; resolve to [] when not.
  React.useEffect(() => {
    let active = true;
    const promise = modelId ? getConfigs(Number(modelId)) : Promise.resolve([]);
    void promise.then((c) => {
      if (active) setConfigs(c);
    });
    return () => {
      active = false;
    };
  }, [modelId]);

  function apply(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page"); // any facet change resets the append cursor
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  function setOrDelete(params: URLSearchParams, key: string, value: string) {
    if (value === NONE) params.delete(key);
    else params.set(key, value);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Make → Model → Config cascade */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          Make
        </label>
        <Select
          value={makeId ?? NONE}
          onValueChange={(v) =>
            apply((p) => {
              setOrDelete(p, "make", v);
              // Changing Make clears dependent Model + Config.
              p.delete("model");
              p.delete("config");
            })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All makes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All makes</SelectItem>
            {makes.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          Model
        </label>
        <Select
          value={modelId ?? NONE}
          disabled={!makeId}
          onValueChange={(v) =>
            apply((p) => {
              setOrDelete(p, "model", v);
              // Changing Model clears dependent Config.
              p.delete("config");
            })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={makeId ? "All models" : "Pick a make"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All models</SelectItem>
            {models.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          Configuration
        </label>
        <Select
          value={configId ?? NONE}
          disabled={!modelId}
          onValueChange={(v) => apply((p) => setOrDelete(p, "config", v))}
        >
          <SelectTrigger className="w-full">
            <SelectValue
              placeholder={modelId ? "All configurations" : "Pick a model"}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All configurations</SelectItem>
            {configs.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Part Category */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          Category
        </label>
        <Select
          value={categoryId ?? NONE}
          onValueChange={(v) => apply((p) => setOrDelete(p, "category", v))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All categories</SelectItem>
            {partCategories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.parentId === null ? c.name : `  ${c.name}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Condition */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          Condition
        </label>
        <Select
          value={conditionId ?? NONE}
          onValueChange={(v) => apply((p) => setOrDelete(p, "condition", v))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Any condition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Any condition</SelectItem>
            {conditions.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function FacetSidebar(props: {
  makes: CascadeOption[];
  conditions: Conditions;
  partCategories: PartCategoryOption[];
}) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block">
        <h2 className="mb-4 text-sm font-semibold">Filters</h2>
        <FacetControls {...props} />
      </aside>

      {/* Mobile drawer */}
      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">
              <SlidersHorizontal className="size-4" />
              Filters
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <FacetControls {...props} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
