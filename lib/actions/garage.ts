"use server";

import { createClient } from "@/lib/supabase/server";
import { truckSchema } from "@/lib/garage/schema";

// Owner-scoped My Garage mutations (GRGE-01 add, GRGE-02 edit/delete).
//
// IDENTITY: every action derives the caller via getClaims() — NEVER getSession
// (which trusts unverified cookie data). Writes go through the cookie-bound user
// client, so owner RLS (`(select auth.uid()) = user_id`, the 4 owner policies on
// garage_trucks) scopes every mutation to the caller's own rows. There is NO
// service-role/admin client here — this is owner data only.
//
// TRUST BOUNDARY (04-RESEARCH Pattern 2): the cascade UI prevents bad combos, but
// the client is untrusted, so each mutating action re-validates the SAME
// truckSchema (single client+server source of truth) AND re-checks config
// applicability against model_configurations server-side (mirrors how sendOtp /
// register re-validate). Library-only integrity, no-exact-duplicate, soft cap,
// and owner-only scope all hold regardless of what the client sends.

// Soft cap on trucks per garage. Tunable here without a schema change (per
// 04-CONTEXT — a friendly server-side guard, not a DB constraint).
const GARAGE_SOFT_CAP = 20;

export type AddTruckResult =
  | { ok: true; id: number }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "invalid"
        | "invalid_combo"
        | "duplicate"
        | "cap_reached";
    };

/**
 * Add a truck to the caller's own garage. Order:
 *   1. getClaims identity (else unauthenticated)
 *   2. truckSchema re-validation (else invalid)
 *   3. soft-cap count check (RLS-scoped to the owner)
 *   4. config-applicability re-check vs model_configurations (only if configId set)
 *   5. insert with explicit user_id; 23505 => duplicate
 */
export async function addTruck(input: unknown): Promise<AddTruckResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  const parsed = truckSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { modelId, configId, nickname } = parsed.data;

  // 3) SOFT CAP — RLS scopes the count to the owner's own rows.
  const { count } = await supabase
    .from("garage_trucks")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) >= GARAGE_SOFT_CAP)
    return { ok: false, error: "cap_reached" };

  // 4) COMBO RE-CHECK — only when a config was chosen. Drives the
  // "Missing your truck? Let us know" affordance when the combo is not in library.
  if (configId != null) {
    const { data: combo } = await supabase
      .from("model_configurations")
      .select("model_id")
      .eq("model_id", modelId)
      .eq("configuration_id", configId)
      .maybeSingle();
    if (!combo) return { ok: false, error: "invalid_combo" };
  }

  // 5) INSERT — user_id set explicitly (RLS with-check also enforces it).
  const { data, error } = await supabase
    .from("garage_trucks")
    .insert({
      user_id: userId,
      model_id: modelId,
      config_id: configId ?? null,
      nickname: nickname || null, // empty-string ⇒ NULL (no nickname)
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "duplicate" };
    return { ok: false, error: "invalid" };
  }
  return { ok: true, id: data.id };
}
