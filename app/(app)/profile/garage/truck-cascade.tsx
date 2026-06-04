"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  truckSchema,
  type TruckInput,
  type TruckFormValues,
} from "@/lib/garage/schema";
import {
  getModels,
  getConfigs,
  type CascadeOption,
} from "@/lib/garage/cascade";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Dependent Make -> Model -> Config cascade + nickname, the ONLY way a truck is
// entered. RHF + zodResolver(truckSchema) — the SAME schema the server action
// re-validates (single client+server source of truth). At launch list sizes
// (2 makes / 17 models / 9 configs) plain shadcn Selects suffice (per CONTEXT:
// "decide per-level by actual list length"); no command/combobox needed.
//
// IMPORTANT: configs are loaded via getConfigs, which scopes options THROUGH
// model_configurations applicability — the form can only ever offer library-valid
// combos. The optional "No specific configuration" item maps to configId = null
// (a MODEL-level truck, "any 379"). This component ONLY produces values; the
// parent dialog owns the action call, toast, and router.refresh().

// Radix Select values are strings; this sentinel represents "no config chosen".
const NO_CONFIG = "__none__";

// The make derivation for edit pre-fill comes from the parent (GarageTruck.makeId)
// since truckSchema itself carries only modelId — we track the selected make in
// local state to drive the dependent fetches.
export type TruckCascadeDefaults = {
  makeId: number;
  modelId: number;
  configId: number | null;
  nickname: string;
};

export function TruckCascade({
  makes,
  defaults,
  submitLabel,
  pending,
  onSubmit,
}: {
  makes: CascadeOption[];
  defaults?: TruckCascadeDefaults;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: TruckInput) => void;
}) {
  // Three generics: working values are the schema INPUT side (Selects emit
  // strings/unknown), the resolver TRANSFORMS to TruckInput (output), so
  // handleSubmit's callback receives the coerced TruckInput shape.
  const form = useForm<TruckFormValues, unknown, TruckInput>({
    resolver: zodResolver(truckSchema),
    defaultValues: {
      modelId: defaults?.modelId,
      configId: defaults?.configId ?? null,
      nickname: defaults?.nickname ?? "",
    },
  });

  // Make is NOT part of truckSchema (model implies make), so it lives in local
  // state and drives the dependent model/config fetches.
  const [makeId, setMakeId] = React.useState<number | null>(
    defaults?.makeId ?? null,
  );
  const [models, setModels] = React.useState<CascadeOption[]>([]);
  const [configs, setConfigs] = React.useState<CascadeOption[]>([]);
  const [loadingModels, setLoadingModels] = React.useState(false);
  const [loadingConfigs, setLoadingConfigs] = React.useState(false);

  // On mount in EDIT mode, pre-load the dependent lists for the saved make/model
  // so the Selects render their current values.
  React.useEffect(() => {
    let active = true;
    async function preload() {
      if (defaults?.makeId) {
        setLoadingModels(true);
        const m = await getModels(defaults.makeId);
        if (!active) return;
        setModels(m);
        setLoadingModels(false);
      }
      if (defaults?.modelId) {
        setLoadingConfigs(true);
        const c = await getConfigs(defaults.modelId);
        if (!active) return;
        setConfigs(c);
        setLoadingConfigs(false);
      }
    }
    preload();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onMakeChange(value: string) {
    const id = Number(value);
    setMakeId(id);
    // Changing make invalidates any model/config selection.
    form.setValue("modelId", undefined);
    form.setValue("configId", null);
    setConfigs([]);
    setModels([]);
    setLoadingModels(true);
    const m = await getModels(id);
    setModels(m);
    setLoadingModels(false);
  }

  async function onModelChange(value: string) {
    const id = Number(value);
    form.setValue("modelId", id, { shouldValidate: true });
    // Changing model invalidates the config selection.
    form.setValue("configId", null);
    setConfigs([]);
    setLoadingConfigs(true);
    const c = await getConfigs(id);
    setConfigs(c);
    setLoadingConfigs(false);
  }

  const modelId = form.watch("modelId");

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onSubmit(values))}
        className="grid gap-4"
      >
        {/* MAKE — not a schema field; drives the dependent fetches. */}
        <FormItem>
          <FormLabel>Make</FormLabel>
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
        </FormItem>

        {/* MODEL — required (truckSchema.modelId); disabled until a make is set. */}
        <FormField
          control={form.control}
          name="modelId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Model</FormLabel>
              <Select
                value={field.value ? String(field.value) : undefined}
                onValueChange={onModelChange}
                disabled={makeId == null || loadingModels}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        loadingModels ? "Loading models…" : "Select a model"
                      }
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* CONFIG — optional; "No specific configuration" maps to null (model-level). */}
        <FormField
          control={form.control}
          name="configId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Configuration (optional)</FormLabel>
              <Select
                value={field.value == null ? NO_CONFIG : String(field.value)}
                onValueChange={(v) =>
                  field.onChange(v === NO_CONFIG ? null : Number(v))
                }
                disabled={!modelId || loadingConfigs}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        loadingConfigs
                          ? "Loading configurations…"
                          : "No specific configuration"
                      }
                    />
                  </SelectTrigger>
                </FormControl>
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
              <FormMessage />
            </FormItem>
          )}
        />

        {/* NICKNAME — optional, ≤40; empty falls back to the fitment string on the card. */}
        <FormField
          control={form.control}
          name="nickname"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nickname (optional)</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. Mi 379 rojo"
                  maxLength={40}
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={pending || !modelId} className="w-full">
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
