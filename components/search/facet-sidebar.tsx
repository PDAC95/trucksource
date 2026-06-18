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
import { getChildCategories } from "@/lib/listings/cascade";
import { yearOptions } from "@/lib/listings/years";
import { FEED_PATH } from "@/lib/search/params";
import { cn } from "@/lib/utils";
import type { CascadeOption } from "@/lib/garage/cascade";
import type { CategoryOption } from "@/lib/listings/cascade";
import type { GarageTruck } from "@/lib/garage/queries";

function truckLabel(t: GarageTruck): string {
  const base = `${t.year} ${t.makeName} ${t.modelName}`.trim();
  return t.configName ? `${base} · ${t.configName}` : base;
}

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
// PART CATEGORY (Phase 16): the same cascade idiom — Category(root) → Subcategory →
// Item — walks the 3-level taxonomy via getChildCategories(parentId). The RPC matches a
// whole subtree from ONE id, so the URL keeps a SINGLE `category` id = the DEEPEST chosen
// node; `root`/`subcategory`/`item` are UI-only helper keys that remember which selects
// are chosen (so reload re-shows them + dependents reload). Changing a parent deletes its
// dependent helper keys and recomputes the deepest `category`.
//
// Desktop: rendered inline as a sidebar. Mobile: a "Filters" button opens it in a Sheet
// drawer. The same <FacetControls> body serves both.

type Conditions = { id: number; name: string }[];

const NONE = "__none__";

export function FacetControls({
  makes,
  conditions,
  rootCategories,
  trucks,
}: {
  makes: CascadeOption[];
  conditions: Conditions;
  rootCategories: CategoryOption[];
  // When provided + non-empty, a "Your truck" selector renders at the top and
  // sets the fits/fitsConfig params (fitment filter). Omitted/empty = hidden.
  trucks?: GarageTruck[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const makeId = searchParams.get("make");
  const modelId = searchParams.get("model");
  const configId = searchParams.get("config");
  const conditionId = searchParams.get("condition");
  // Buyer's truck year — independent of Make/Model (static list, no cascade).
  const yearParam = searchParams.get("year");
  const years = React.useMemo(() => yearOptions(), []);

  // Part-category cascade state. Per the contract, `category` holds the DEEPEST chosen
  // id (the RPC-facing one); `root`/`subcategory`/`item` are UI-only memory of which
  // selects are chosen + drive dependent loading.
  const rootId = searchParams.get("root");
  const subcategoryId = searchParams.get("subcategory");
  const itemId = searchParams.get("item");

  // A truck is "active" when the Make/Model/Configuration facets match it — so
  // selecting a truck simply POPULATES those dropdowns, and changing any of them
  // naturally deselects the truck.
  const isTruckActive = (t: GarageTruck) =>
    String(t.makeId) === makeId &&
    String(t.modelId) === modelId &&
    (t.configId === null ? !configId : String(t.configId) === configId);

  const [models, setModels] = React.useState<CascadeOption[]>([]);
  const [configs, setConfigs] = React.useState<CascadeOption[]>([]);
  const [subcategories, setSubcategories] = React.useState<CategoryOption[]>(
    [],
  );
  const [items, setItems] = React.useState<CategoryOption[]>([]);

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

  // Load Subcategories whenever a root Category is chosen; resolve to [] when not.
  React.useEffect(() => {
    let active = true;
    const promise = rootId
      ? getChildCategories(Number(rootId))
      : Promise.resolve([]);
    void promise.then((c) => {
      if (active) setSubcategories(c);
    });
    return () => {
      active = false;
    };
  }, [rootId]);

  // Load Items whenever a Subcategory is chosen; resolve to [] when not.
  React.useEffect(() => {
    let active = true;
    const promise = subcategoryId
      ? getChildCategories(Number(subcategoryId))
      : Promise.resolve([]);
    void promise.then((c) => {
      if (active) setItems(c);
    });
    return () => {
      active = false;
    };
  }, [subcategoryId]);

  function apply(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page"); // any facet change resets the append cursor
    const qs = params.toString();
    router.replace(qs ? `${FEED_PATH}?${qs}` : FEED_PATH, { scroll: false });
  }

  function setOrDelete(params: URLSearchParams, key: string, value: string) {
    if (value === NONE) params.delete(key);
    else params.set(key, value);
  }

  // The single RPC-facing `category` id is ALWAYS the deepest chosen of
  // {item, subcategory, root}. Recompute it from the post-mutation params so the
  // subtree match runs from the most specific node the user picked (or drop it
  // entirely when no root remains).
  function syncDeepestCategory(params: URLSearchParams) {
    const deepest =
      params.get("item") ?? params.get("subcategory") ?? params.get("root");
    if (deepest) params.set("category", deepest);
    else params.delete("category");
  }

  // Picking any manual facet clears the "Your truck" selection (they're mutually
  // exclusive here): you're either filtering by a saved truck or by hand.
  function applyFacet(mutate: (params: URLSearchParams) => void) {
    apply((p) => {
      mutate(p);
      p.delete("fits");
      p.delete("fitsConfig");
    });
  }

  // Toggle a saved truck. Active → clear Make/Model/Config (deselect). Inactive →
  // (re)apply the truck by FILLING Make/Model/Config from it, so the dropdowns
  // visibly reflect the truck. (Drops any stale fits from the welcome flow.)
  function toggleTruck(t: GarageTruck) {
    apply((p) => {
      p.delete("fits");
      p.delete("fitsConfig");
      if (isTruckActive(t)) {
        p.delete("make");
        p.delete("model");
        p.delete("config");
        return;
      }
      p.set("make", String(t.makeId));
      p.set("model", String(t.modelId));
      if (t.configId !== null) p.set("config", String(t.configId));
      else p.delete("config");
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Your truck (only when the viewer has saved trucks). Toggle pills: the
          active one is lit red; picking any facet deselects it, and pressing it
          again re-applies the full truck filter. */}
      {trucks && trucks.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Your truck
          </label>
          <div className="flex flex-wrap gap-2">
            {trucks.map((t) => {
              const active = isTruckActive(t);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTruck(t)}
                  aria-pressed={active}
                  title={truckLabel(t)}
                  className={cn(
                    "max-w-full truncate rounded-full border-2 px-3 py-1.5 text-sm font-semibold tracking-wide uppercase transition-all",
                    active
                      ? "border-neon-cyan bg-neon-cyan/10 text-neon-cyan shadow-glow-cyan"
                      : "border-white/15 text-muted-foreground hover:border-neon-cyan/60 hover:text-neon-cyan",
                  )}
                >
                  {t.nickname ?? truckLabel(t)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Make → Model → Config cascade */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">
          Make
        </label>
        <Select
          value={makeId ?? NONE}
          onValueChange={(v) =>
            applyFacet((p) => {
              setOrDelete(p, "make", v);
              // Changing Make clears dependent Model + Config.
              p.delete("model");
              p.delete("config");
            })
          }
        >
          <SelectTrigger className="w-full border-white/10 bg-white/[0.03] focus-visible:border-neon-cyan/50">
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
        <label className="text-sm font-medium text-muted-foreground">
          Model
        </label>
        <Select
          value={modelId ?? NONE}
          disabled={!makeId}
          onValueChange={(v) =>
            applyFacet((p) => {
              setOrDelete(p, "model", v);
              // Changing Model clears dependent Config.
              p.delete("config");
            })
          }
        >
          <SelectTrigger className="w-full border-white/10 bg-white/[0.03] focus-visible:border-neon-cyan/50">
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

      {/* Year — the buyer's truck year. Static options, always enabled
          (independent of Make/Model), no dependents to clear. */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">Year</label>
        <Select
          value={yearParam ?? NONE}
          onValueChange={(v) => applyFacet((p) => setOrDelete(p, "year", v))}
        >
          <SelectTrigger className="w-full border-white/10 bg-white/[0.03] focus-visible:border-neon-cyan/50">
            <SelectValue placeholder="All years" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All years</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">
          Configuration
        </label>
        <Select
          value={configId ?? NONE}
          disabled={!modelId}
          onValueChange={(v) => applyFacet((p) => setOrDelete(p, "config", v))}
        >
          <SelectTrigger className="w-full border-white/10 bg-white/[0.03] focus-visible:border-neon-cyan/50">
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

      {/* Part Category → Subcategory → Item cascade. Each select keeps its own
          UI-only helper key (root/subcategory/item); `category` is recomputed to
          the deepest chosen id, which the RPC expands to the whole subtree. */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">
          Category
        </label>
        <Select
          value={rootId ?? NONE}
          onValueChange={(v) =>
            applyFacet((p) => {
              setOrDelete(p, "root", v);
              // Changing the root clears its dependent Subcategory + Item.
              p.delete("subcategory");
              p.delete("item");
              syncDeepestCategory(p);
            })
          }
        >
          <SelectTrigger className="w-full border-white/10 bg-white/[0.03] focus-visible:border-neon-cyan/50">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All categories</SelectItem>
            {rootCategories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">
          Subcategory
        </label>
        <Select
          value={subcategoryId ?? NONE}
          disabled={!rootId}
          onValueChange={(v) =>
            applyFacet((p) => {
              setOrDelete(p, "subcategory", v);
              // Changing the subcategory clears its dependent Item.
              p.delete("item");
              syncDeepestCategory(p);
            })
          }
        >
          <SelectTrigger className="w-full border-white/10 bg-white/[0.03] focus-visible:border-neon-cyan/50">
            <SelectValue
              placeholder={rootId ? "All subcategories" : "Pick a category"}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All subcategories</SelectItem>
            {subcategories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">
          Item
        </label>
        <Select
          value={itemId ?? NONE}
          disabled={!subcategoryId}
          onValueChange={(v) =>
            applyFacet((p) => {
              setOrDelete(p, "item", v);
              syncDeepestCategory(p);
            })
          }
        >
          <SelectTrigger className="w-full border-white/10 bg-white/[0.03] focus-visible:border-neon-cyan/50">
            <SelectValue
              placeholder={subcategoryId ? "All items" : "Pick a subcategory"}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All items</SelectItem>
            {items.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Condition */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">
          Condition
        </label>
        <Select
          value={conditionId ?? NONE}
          onValueChange={(v) =>
            applyFacet((p) => setOrDelete(p, "condition", v))
          }
        >
          <SelectTrigger className="w-full border-white/10 bg-white/[0.03] focus-visible:border-neon-cyan/50">
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
  rootCategories: CategoryOption[];
  trucks?: GarageTruck[];
}) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden rounded-2xl bg-white/[0.02] p-4 ring-1 ring-white/10 lg:block">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold tracking-wide text-foreground uppercase">
          <span className="inline-block h-4 w-1 rounded-full bg-neon-cyan" />
          Filters
        </h2>
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
