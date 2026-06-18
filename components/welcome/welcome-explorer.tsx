"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { FEED_PATH } from "@/lib/search/params";
import { yearOptions } from "@/lib/listings/years";
import { getModels } from "@/lib/garage/cascade";
import type { CascadeOption } from "@/lib/garage/cascade";
import { getChildCategories } from "@/lib/listings/cascade";
import type { CategoryOption } from "@/lib/listings/cascade";
import { TruckActions } from "@/components/welcome/truck-actions";
import { WelcomeActionsMobile } from "@/components/welcome/welcome-actions-mobile";
import type { FitsState } from "@/components/search/fits-my-truck-control";
import type { BrandItem } from "@/components/welcome/brand-grid";

// The web (sm+) visual filter explorer. The right side is a guided cascade that
// goes general → specific: Make → Model → (search now) → Category(root) →
// Advanced(Subcategory → Item + Condition). Category is an OPTIONAL refinement,
// NOT a gate: as soon as a Make + Model are chosen the "See results" action is
// live, so the user can search immediately or keep drilling to narrow. The
// Category step lists taxonomy ROOTS; subcategories and items load on demand one
// level at a time via getChildCategories. "See results" navigates to /browse with
// the chosen filters — the part category is emitted as a SINGLE deepest `category`
// id (item, else subcategory, else root), which the subtree-match RPC expands; if
// no category was picked the param is omitted. The left side shows the three
// preset buttons until the user picks anything, then swaps to the removable
// selected-filter chips.
//
// SEAM (Pitfall 7): each step owns its own advance/reset; model → category is an
// isolated hop so a future Year step can be inserted between them without
// rewriting siblings. The Configuration step was removed from this welcome flow
// (config remains a /browse facet, just not a welcome step).

type Condition = { id: number; name: string };
type Step = "make" | "model" | "year" | "category" | "advanced";

const optionCard =
  "group flex h-20 items-center justify-center rounded-xl border-2 border-neon-cyan/50 bg-black/40 px-4 text-center font-godsown text-xl uppercase tracking-wide text-neon-cyan transition-all hover:border-neon-cyan hover:shadow-glow-cyan hover:[text-shadow:var(--text-shadow-neon-cyan)] sm:h-24 sm:text-2xl";

const skipCard =
  "flex h-20 items-center justify-center rounded-xl border-2 border-dashed border-foreground/25 bg-black/30 px-4 text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground transition-all hover:border-foreground/50 hover:text-foreground sm:h-24";

export function WelcomeExplorer({
  brands,
  rootCategories,
  conditions,
  fitsState,
}: {
  brands: BrandItem[];
  rootCategories: CategoryOption[];
  conditions: Condition[];
  fitsState: FitsState;
}) {
  const router = useRouter();

  const [step, setStep] = React.useState<Step>("make");
  const [make, setMake] = React.useState<BrandItem | null>(null);
  const [model, setModel] = React.useState<CascadeOption | null>(null);
  // The buyer's truck year — OPTIONAL and independent of model (static list from
  // lib/listings/years). null = "Any year". Slots into the reserved Model→Category seam.
  const [year, setYear] = React.useState<number | null>(null);
  const [condition, setCondition] = React.useState<Condition | null>(null);

  const years = React.useMemo(() => yearOptions(), []);

  const [models, setModels] = React.useState<CascadeOption[]>([]);

  // The 3-level part-category drill. Each level holds its pick + the children it
  // loaded for the next level. Parent change clears every dependent level below.
  const [rootCategory, setRootCategory] = React.useState<CategoryOption | null>(
    null,
  );
  const [subcategory, setSubcategory] = React.useState<CategoryOption | null>(
    null,
  );
  const [item, setItem] = React.useState<CategoryOption | null>(null);
  const [subcategories, setSubcategories] = React.useState<CategoryOption[]>(
    [],
  );
  const [items, setItems] = React.useState<CategoryOption[]>([]);

  const hasSelection = make !== null;

  // The deepest part-category the user has committed to (item → sub → root). This
  // single id is what the search emits and what the category chip labels.
  const deepestCategory = item ?? subcategory ?? rootCategory;

  // --- advance handlers (general → specific) ---
  async function pickMake(m: BrandItem) {
    setMake(m);
    setStep("model");
    setModels(await getModels(m.id));
  }
  // Model → Year seam. No config load here (Configuration was dropped from the
  // welcome flow). The optional Year step fills the reserved hop before Category.
  // Changing the model clears any previously chosen year (start the year pick fresh).
  function pickModel(m: CascadeOption) {
    setModel(m);
    setYear(null);
    setStep("year");
  }
  function skipModel() {
    setModel(null);
    setYear(null);
    setStep("year");
  }
  // Year → Category. Optional: picking a year and "Any year" both advance to Category.
  function pickYear(y: number) {
    setYear(y);
    setStep("category");
  }
  function skipYear() {
    setYear(null);
    setStep("category");
  }
  async function pickRootCategory(c: CategoryOption) {
    setRootCategory(c);
    setSubcategory(null);
    setItem(null);
    setItems([]);
    setSubcategories(await getChildCategories(c.id));
    setStep("advanced");
  }
  async function pickSubcategory(c: CategoryOption) {
    setSubcategory(c);
    setItem(null);
    setItems(await getChildCategories(c.id));
  }
  function pickItem(c: CategoryOption) {
    setItem(c);
  }

  // --- chip removal: clear that level + everything after it, rewind the step ---
  function removeMake() {
    setMake(null);
    setModel(null);
    setYear(null);
    setRootCategory(null);
    setSubcategory(null);
    setItem(null);
    setCondition(null);
    setModels([]);
    setSubcategories([]);
    setItems([]);
    setStep("make");
  }
  function removeModel() {
    setModel(null);
    setYear(null);
    setRootCategory(null);
    setSubcategory(null);
    setItem(null);
    setCondition(null);
    setSubcategories([]);
    setItems([]);
    setStep("year");
  }
  // Removing the Year chip rewinds to the year step and clears the year only.
  function removeYear() {
    setYear(null);
    setStep("year");
  }
  function removeRootCategory() {
    setRootCategory(null);
    setSubcategory(null);
    setItem(null);
    setSubcategories([]);
    setItems([]);
    setStep("category");
  }
  function removeSubcategory() {
    setSubcategory(null);
    setItem(null);
    setItems([]);
  }
  function removeItem() {
    setItem(null);
  }
  function removeCondition() {
    setCondition(null);
  }

  function runSearch() {
    const params = new URLSearchParams();
    if (make) params.set("make", String(make.id));
    if (model) params.set("model", String(model.id));
    // The buyer's truck year (optional) — single `year` param; omitted when skipped.
    if (year !== null) params.set("year", String(year));
    // SINGLE deepest category id — the subtree-match RPC expands it. No separate
    // subcategory/item keys (params.ts has none).
    if (deepestCategory) params.set("category", String(deepestCategory.id));
    if (condition) params.set("condition", String(condition.id));
    const qs = params.toString();
    router.push(qs ? `${FEED_PATH}?${qs}` : FEED_PATH);
  }

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (make) chips.push({ key: "make", label: make.name, onRemove: removeMake });
  if (model)
    chips.push({ key: "model", label: model.name, onRemove: removeModel });
  if (year !== null)
    chips.push({ key: "year", label: String(year), onRemove: removeYear });
  // ONE category chip labeled with the deepest chosen level; removing it clears
  // the whole category selection.
  if (deepestCategory)
    chips.push({
      key: "category",
      label: deepestCategory.name,
      onRemove: removeRootCategory,
    });
  if (condition)
    chips.push({
      key: "condition",
      label: condition.name,
      onRemove: removeCondition,
    });

  const stepHeading =
    step === "make"
      ? "Browse by brand"
      : step === "model"
        ? `Pick a ${make?.name ?? ""} model`.trim()
        : step === "year"
          ? "Pick your truck year"
          : step === "category"
            ? "Pick a category"
            : "Refine your search";

  function back() {
    if (step === "model") removeMake();
    else if (step === "year") removeModel();
    else if (step === "category") removeYear();
    else if (step === "advanced") removeRootCategory();
  }

  // Condition pills + "See results" — shared by the Category and Advanced steps so
  // search is runnable the moment Make + Model are set (Category is optional).
  const conditionPicker = (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Condition
      </p>
      <div className="flex flex-wrap gap-2">
        {conditions.map((c) => {
          const active = condition?.id === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCondition(active ? null : c)}
              className={cn(
                "rounded-full border-2 px-3 py-1.5 text-sm font-semibold uppercase tracking-wide transition-all",
                active
                  ? "border-neon-cyan text-neon-cyan shadow-glow-cyan"
                  : "border-foreground/25 text-muted-foreground hover:border-foreground/50 hover:text-foreground",
              )}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );

  const seeResults = (
    <button
      type="button"
      onClick={runSearch}
      style={{ fontFamily: "var(--ff-godsown)" }}
      className="flex w-fit items-center gap-2 rounded-xl border-2 border-neon-cyan bg-neon-cyan/10 px-5 py-3 text-2xl tracking-wide text-neon-cyan uppercase transition-all hover:shadow-glow-cyan hover:[text-shadow:var(--text-shadow-neon-cyan)]"
    >
      <Search className="size-5" />
      See results
    </button>
  );

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-12">
      {/* LEFT (top on mobile): hero + (preset actions OR selected-filter chips) */}
      <div className="flex flex-col items-center gap-6 lg:items-start">
        <Image
          src="/hero-logo.png"
          alt="OG Truck Parts"
          width={1100}
          height={832}
          priority
          className="h-auto w-full max-w-[190px] drop-shadow-[0_0_25px_oklch(0.58_0.232_25/0.35)] sm:max-w-md"
        />
        <p className="text-center font-display text-xl font-semibold tracking-[0.2em] text-neon-cyan uppercase lg:text-left">
          New · Take-Off · Used · Overstock
        </p>

        <div className="flex w-full max-w-sm flex-col gap-3">
          {!hasSelection ? (
            <>
              {/* Web (sm+): big stacked buttons */}
              <div className="hidden flex-col gap-3 sm:flex">
                <Link
                  href={FEED_PATH}
                  style={{ fontFamily: "var(--ff-godsown)" }}
                  className="flex items-center justify-center rounded-xl border-2 border-neon-cyan bg-neon-cyan/10 px-4 py-3 text-center text-2xl tracking-wide text-neon-cyan uppercase transition-all duration-200 hover:shadow-glow-cyan hover:[text-shadow:var(--text-shadow-neon-cyan)]"
                >
                  Browse all parts
                </Link>
                <TruckActions state={fitsState} />
              </div>
              {/* Mobile (<sm): compact pills */}
              <WelcomeActionsMobile state={fitsState} />
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your search
              </p>
              <div className="flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <span
                    key={chip.key}
                    style={{ fontFamily: "var(--ff-godsown)" }}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-neon-cyan/50 bg-black/40 py-1 pr-1.5 pl-3 text-sm uppercase tracking-wide text-neon-cyan"
                  >
                    {chip.label}
                    <button
                      type="button"
                      onClick={chip.onRemove}
                      aria-label={`Remove ${chip.label}`}
                      className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-neon-red"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={removeMake}
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
              >
                Start over
              </button>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: the guided cascade */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {step !== "make" && (
            <button
              type="button"
              onClick={back}
              aria-label="Back"
              className="rounded-full border border-foreground/20 p-1.5 text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-foreground">
            {stepHeading}
          </h2>
        </div>

        {step === "make" && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {brands.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => pickMake(b)}
                aria-label={`Select ${b.name}`}
                className={optionCard}
              >
                {b.logoSrc ? (
                  <Image
                    src={b.logoSrc}
                    alt={b.name}
                    width={220}
                    height={88}
                    className="max-h-14 w-auto object-contain"
                  />
                ) : (
                  <span style={{ textShadow: "var(--text-shadow-neon-cyan)" }}>
                    {b.name}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {step === "model" && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {models.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pickModel(m)}
                className={optionCard}
              >
                {m.name}
              </button>
            ))}
            <button type="button" onClick={skipModel} className={skipCard}>
              Any model
            </button>
          </div>
        )}

        {step === "year" && (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">
              Pick your truck&rsquo;s year to narrow your search, or hit{" "}
              <span className="text-neon-cyan">Any year</span> /{" "}
              <span className="text-neon-cyan">See results</span> to skip it.
            </p>

            <div className="grid max-h-80 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 sm:gap-4">
              {years.map((y) => {
                const active = year === y;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => (active ? removeYear() : pickYear(y))}
                    className={cn(
                      optionCard,
                      active &&
                        "border-neon-cyan shadow-glow-cyan [text-shadow:var(--text-shadow-neon-cyan)]",
                    )}
                  >
                    {y}
                  </button>
                );
              })}
            </div>

            <button type="button" onClick={skipYear} className={skipCard}>
              Any year
            </button>

            {seeResults}
          </div>
        )}

        {step === "category" && (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">
              Pick a category to narrow your search, or hit{" "}
              <span className="text-neon-cyan">See results</span> now to browse
              everything for your truck.
            </p>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {rootCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickRootCategory(c)}
                  className={optionCard}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {conditionPicker}

            {seeResults}
          </div>
        )}

        {step === "advanced" && (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">
              Drill into a subcategory and item, refine by condition, or hit{" "}
              <span className="text-neon-cyan">See results</span> with what you
              have.
            </p>

            {/* Subcategory drill (only when a root was chosen and it has children) */}
            {rootCategory && subcategories.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Subcategory
                </p>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {subcategories.map((c) => {
                    const active = subcategory?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          active ? removeSubcategory() : pickSubcategory(c)
                        }
                        className={cn(
                          optionCard,
                          active &&
                            "border-neon-cyan shadow-glow-cyan [text-shadow:var(--text-shadow-neon-cyan)]",
                        )}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Item drill (only once a subcategory is chosen and it has children) */}
            {subcategory && items.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Item
                </p>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {items.map((c) => {
                    const active = item?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => (active ? removeItem() : pickItem(c))}
                        className={cn(
                          optionCard,
                          active &&
                            "border-neon-cyan shadow-glow-cyan [text-shadow:var(--text-shadow-neon-cyan)]",
                        )}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {conditionPicker}

            {seeResults}
          </div>
        )}
      </div>
    </div>
  );
}
