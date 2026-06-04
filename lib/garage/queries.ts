// Owner-scoped read surface for My Garage — the STABLE contract Phases 6 and 7
// consume so they never reach into the garage_trucks table directly.
//
// GRANULARITY CONTRACT (load-bearing for Phases 6/7):
//   A GarageTruck.configId of NULL means the user saved the truck at MODEL level
//   ("any 379") — downstream fitment filtering must match at MODEL granularity. A
//   non-null configId means an EXACT configuration was chosen — filter at config
//   granularity. The `id` (truck_id) is the stable handle Phase 7's "fits my truck"
//   chooser passes around; Phase 6 uses the same shape for seller pre-fill.
//
// This is a plain async lib (no "use server"): it imports the cookie-bound server
// client, so it is server-side and RLS scopes every read to auth.uid(). It joins
// ONLY to fitment reference NAMES — NEVER to profiles_* (PII over-fetch is the
// PITFALLS #1 class). There is intentionally NO default/active-truck concept: the
// truck is chosen explicitly at filter time (CONTEXT), not persisted as a default.
import { createClient } from "@/lib/supabase/server";

export type GarageTruck = {
  id: number; // truck_id — the stable handle Phase 7 passes around
  nickname: string | null;
  makeId: number;
  makeName: string;
  modelId: number;
  modelName: string;
  configId: number | null; // null ⇒ filter at MODEL granularity
  configName: string | null;
};

// Shape of the nested row Supabase returns from the embedded select below. A
// to-one embed comes back as a single object (or null), so we type the relations
// as objects rather than arrays.
type GarageTruckRow = {
  id: number;
  nickname: string | null;
  config_id: number | null;
  model_id: number;
  models: {
    id: number;
    name: string;
    makes: { id: number; name: string } | null;
  } | null;
  configurations: { id: number; name: string } | null;
};

/**
 * List the current user's saved trucks, newest first. Owner-scoped via the
 * cookie-bound client (RLS = auth.uid()). Returns [] on error or no rows so
 * callers never have to null-check.
 */
export async function listMyTrucks(): Promise<GarageTruck[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("garage_trucks")
    .select(
      "id, nickname, config_id, model_id, models:model_id ( id, name, makes:make_id ( id, name ) ), configurations:config_id ( id, name )",
    )
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const rows = data as unknown as GarageTruckRow[];
  return rows.map((r) => ({
    id: r.id,
    nickname: r.nickname,
    makeId: r.models?.makes?.id ?? 0,
    makeName: r.models?.makes?.name ?? "",
    modelId: r.models?.id ?? r.model_id,
    modelName: r.models?.name ?? "",
    configId: r.configurations?.id ?? null,
    configName: r.configurations?.name ?? null,
  }));
}
