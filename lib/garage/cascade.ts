"use server";

// Dependent-cascade option readers for the My Garage add/edit form.
//
// The Phase-3 fitment reference tables (makes/models/configurations/
// model_configurations) are anon-public read (one SELECT policy each), so these
// readers go through the cookie-bound server client and return only id+name —
// they expose nothing private and need no owner scope.
//
// LIBRARY-ONLY INTEGRITY (Pitfall 2): getConfigs scopes configurations THROUGH
// model_configurations applicability for the chosen model — it must NEVER return
// the full configurations master. A config offered here is, by construction, a
// valid (model, config) combo, which is exactly what the server action re-checks.
import { createClient } from "@/lib/supabase/server";

export type CascadeOption = { id: number; name: string };

/**
 * Models that belong to a given make, alphabetical. Drives the Model select once
 * a Make is chosen.
 */
export async function getModels(makeId: number): Promise<CascadeOption[]> {
  if (!Number.isInteger(makeId) || makeId <= 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("models")
    .select("id, name")
    .eq("make_id", makeId)
    // ADMO-05: deactivated values are hidden from NEW-value pickers only —
    // existing listings/trucks keep them (search/read surfaces don't filter).
    .eq("is_active", true)
    .order("name");
  if (error || !data) return [];
  return data as CascadeOption[];
}

// The nested shape Supabase returns from the inner-join embed below.
type ConfigRow = {
  id: number;
  name: string;
  model_configurations: { model_id: number }[];
};

/**
 * Configurations APPLICABLE to a given model, scoped through the
 * model_configurations join — NEVER the full configurations master (Pitfall 2).
 * Drives the (optional) Config select once a Model is chosen.
 */
export async function getConfigs(modelId: number): Promise<CascadeOption[]> {
  if (!Number.isInteger(modelId) || modelId <= 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("configurations")
    .select("id, name, model_configurations!inner(model_id)")
    .eq("model_configurations.model_id", modelId)
    // ADMO-05: picker-only inactive filter (see getModels).
    .eq("is_active", true)
    .order("name");
  if (error || !data) return [];
  return (data as unknown as ConfigRow[]).map((c) => ({
    id: c.id,
    name: c.name,
  }));
}
