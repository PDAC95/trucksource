"use client";

import * as React from "react";
import { X } from "lucide-react";

import {
  getModels,
  getConfigs,
  type CascadeOption,
} from "@/lib/garage/cascade";
import type { FitmentEntry } from "@/lib/listings/schema";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// Multi-fit fitment selector for a listing. REUSES the Phase-4 Make→Model→Config
// cascade readers (getModels/getConfigs from @/lib/garage/cascade — NOT duplicated;
// getConfigs scopes options THROUGH model_configurations applicability, so only
// library-valid combos can be offered, exactly what the server action re-checks).
//
// Differences from the garage cascade:
//   - "Add this fitment" appends the current {modelId, configId} to a multi-fit
//     list rendered as removable Badges (CONTEXT: do NOT collapse to single-fit).
//   - A "The Barnyard" toggle: ON relaxes the Make+Model requirement (CONTEXT:
//     explicit toggle, anything-goes category) and hides the selects.
// The parent form owns fitment[]/isBarnyard state; this component only edits them.

// Carries display names alongside the ids so the parent can render readable badges
// without re-querying. The schema only persists {modelId, configId}.
export type FitmentSelection = FitmentEntry & {
  makeName: string;
  modelName: string;
  configName: string | null;
};

const NO_CONFIG = "__none__";

export function FitmentMultiSelect({
  makes,
  fitment,
  onChange,
  isBarnyard,
  onBarnyardChange,
}: {
  makes: CascadeOption[];
  fitment: FitmentSelection[];
  onChange: (next: FitmentSelection[]) => void;
  isBarnyard: boolean;
  onBarnyardChange: (next: boolean) => void;
}) {
  const [makeId, setMakeId] = React.useState<number | null>(null);
  const [modelId, setModelId] = React.useState<number | null>(null);
  const [configId, setConfigId] = React.useState<number | null>(null);

  const [models, setModels] = React.useState<CascadeOption[]>([]);
  const [configs, setConfigs] = React.useState<CascadeOption[]>([]);
  const [loadingModels, setLoadingModels] = React.useState(false);
  const [loadingConfigs, setLoadingConfigs] = React.useState(false);

  async function onMakeChange(value: string) {
    const id = Number(value);
    setMakeId(id);
    setModelId(null);
    setConfigId(null);
    setModels([]);
    setConfigs([]);
    setLoadingModels(true);
    const m = await getModels(id);
    setModels(m);
    setLoadingModels(false);
  }

  async function onModelChange(value: string) {
    const id = Number(value);
    setModelId(id);
    setConfigId(null);
    setConfigs([]);
    setLoadingConfigs(true);
    const c = await getConfigs(id);
    setConfigs(c);
    setLoadingConfigs(false);
  }

  function onConfigChange(value: string) {
    setConfigId(value === NO_CONFIG ? null : Number(value));
  }

  function addFitment() {
    if (makeId == null || modelId == null) return;

    const makeName = makes.find((m) => m.id === makeId)?.name ?? "";
    const modelName = models.find((m) => m.id === modelId)?.name ?? "";
    const configName =
      configId != null
        ? (configs.find((c) => c.id === configId)?.name ?? null)
        : null;

    // De-dupe identical combos (same model + same config arm, incl. null).
    const exists = fitment.some(
      (f) =>
        f.modelId === modelId && (f.configId ?? null) === (configId ?? null),
    );
    if (exists) return;

    onChange([
      ...fitment,
      { modelId, configId: configId ?? null, makeName, modelName, configName },
    ]);

    // Reset the config arm so the seller can quickly add another config of the
    // same model; keep make/model for convenience.
    setConfigId(null);
  }

  function removeFitment(index: number) {
    onChange(fitment.filter((_, i) => i !== index));
  }

  return (
    <div className="grid gap-4">
      {/* THE BARNYARD toggle — relaxes the Make+Model requirement. */}
      <div className="flex items-start gap-2 rounded-md border p-3">
        <Checkbox
          id="barnyard"
          checked={isBarnyard}
          onCheckedChange={(c) => onBarnyardChange(c === true)}
          className="mt-0.5"
        />
        <div className="grid gap-0.5">
          <Label htmlFor="barnyard" className="cursor-pointer">
            The Barnyard
          </Label>
          <p className="text-muted-foreground text-xs">
            Anything-goes — list a part that doesn&apos;t fit the standard
            Make/Model taxonomy. No fitment required.
          </p>
        </div>
      </div>

      {!isBarnyard && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {/* MAKE */}
            <div className="grid gap-1.5">
              <Label>Make</Label>
              <Select
                value={makeId != null ? String(makeId) : undefined}
                onValueChange={onMakeChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a make" />
                </SelectTrigger>
                <SelectContent>
                  {makes.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* MODEL */}
            <div className="grid gap-1.5">
              <Label>Model</Label>
              <Select
                value={modelId != null ? String(modelId) : undefined}
                onValueChange={onModelChange}
                disabled={makeId == null || loadingModels}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      loadingModels ? "Loading models…" : "Select a model"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* CONFIG (optional) */}
            <div className="grid gap-1.5">
              <Label>Configuration (optional)</Label>
              <Select
                value={configId == null ? NO_CONFIG : String(configId)}
                onValueChange={onConfigChange}
                disabled={modelId == null || loadingConfigs}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      loadingConfigs
                        ? "Loading configurations…"
                        : "No specific configuration"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CONFIG}>
                    No specific configuration
                  </SelectItem>
                  {configs.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={addFitment}
            disabled={makeId == null || modelId == null}
            className="w-fit"
          >
            Add this fitment
          </Button>
        </>
      )}

      {/* MULTI-FIT LIST — removable badges. */}
      {fitment.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fitment.map((f, i) => (
            <Badge
              key={`${f.modelId}-${f.configId ?? "null"}-${i}`}
              variant="secondary"
              className="gap-1.5 py-1"
            >
              {[f.makeName, f.modelName, f.configName]
                .filter(Boolean)
                .join(" ")}
              <button
                type="button"
                onClick={() => removeFitment(i)}
                aria-label="Remove fitment"
                className="hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
