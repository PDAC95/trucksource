"use server";

// Listing-form option readers. The Make→Model→Config cascade is REUSED from
// @/lib/garage/cascade (getModels/getConfigs) — do NOT duplicate it here. This
// module only adds what is NEW to listings: the Condition reference reader that
// drives the required Condition select in the form's Part-data section.
//
// The Phase-3 `conditions` reference table is anon-public read (one SELECT policy),
// so this reader goes through the cookie-bound server client and returns only
// id+name — it exposes nothing private and needs no owner scope (same posture as
// the garage cascade readers).
import { createClient } from "@/lib/supabase/server";

export type ConditionOption = { id: number; name: string };

/**
 * All listing Conditions, in library order (sort_order, then name). Drives the
 * REQUIRED Condition select. Returns [] on error.
 */
export async function getConditions(): Promise<ConditionOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conditions")
    .select("id, name")
    .order("sort_order")
    .order("name");
  if (error || !data) return [];
  return data as ConditionOption[];
}
