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
    // ADMO-05: deactivated values are hidden from NEW-listing pickers only —
    // existing listings keep them (search/read surfaces don't filter).
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error || !data) return [];
  return data as ConditionOption[];
}

export type PartCategoryOption = {
  id: number;
  name: string;
  parentId: number | null;
};

/**
 * The seeded 2-level part-category tree (FINT-03). Roots (parent_id NULL) come
 * first, then children, each group alphabetised by name — the order the Phase-6
 * category selector + suggestion chips (Plan 06-04) consume. Same posture as
 * getConditions: anon-public reference read of the Phase-6 `part_categories`
 * table (public-read, no write policy), cookie-bound server client, [] on error.
 */
export async function getPartCategories(): Promise<PartCategoryOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("part_categories")
    .select("id, name, parent_id")
    // ADMO-05: picker-only inactive filter (see getConditions).
    .eq("is_active", true)
    .order("parent_id", { nullsFirst: true })
    .order("name");
  if (error || !data) return [];
  return (data as { id: number; name: string; parent_id: number | null }[]).map(
    (c) => ({ id: c.id, name: c.name, parentId: c.parent_id }),
  );
}

// Single-level cascade readers (Phase 16). The welcome explorer and /browse
// facets walk the 3-level taxonomy one level at a time (root -> subcategory ->
// item) instead of consuming the flat getPartCategories() list. Same posture as
// the garage cascade (CascadeOption): cookie-bound server client, is_active-only
// picker filter, .order("name"), id+name only, [] on error. Resolve roots by
// NAME in calling code — category ids are environment-specific.
export type CategoryOption = { id: number; name: string };

/** Direct child categories of a parent (root -> subcategory -> item), is_active only. */
export async function getChildCategories(
  parentId: number,
): Promise<CategoryOption[]> {
  if (!Number.isInteger(parentId) || parentId <= 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("part_categories")
    .select("id, name")
    .eq("parent_id", parentId)
    // ADMO-05: picker-only inactive filter, same as getModels/getConditions.
    .eq("is_active", true)
    .order("name");
  if (error || !data) return [];
  return data as CategoryOption[];
}

/** Root categories (parent_id null), is_active only, alphabetical. */
export async function getRootCategories(): Promise<CategoryOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("part_categories")
    .select("id, name")
    .is("parent_id", null)
    .eq("is_active", true)
    .order("name");
  if (error || !data) return [];
  return data as CategoryOption[];
}
