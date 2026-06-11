"use server";

// Fitment Library taxonomy actions (ADMO-05/06). EVERY action here:
//   1. calls requireAdmin() (the security gate — the admin layout is UX only),
//   2. zod-validates its input at this trust boundary,
//   3. writes via createAdminClient() — the taxonomy tables have NO public
//      write policies (default-deny since 0003), service role is the only pen,
//   4. writes an admin_audit_log row via logAdminAction() BEFORE returning
//      success (an unaudited admin mutation must not silently succeed).
//
// Column whitelist: inserts/updates are built ONLY from the level's config-map
// column list (+ parent FK). Raw input is never spread into a query.
//
// Lifecycle semantics (LOCKED): setActive flips is_active and NOTHING else —
// deactivation never touches listings; existing listings keep deactivated
// values, visible and searchable. Hard delete is FK-guarded: the restrict FKs
// (listings.condition_id, listing_fitment.model_id/config_id, garage_trucks,
// listing_categories.category_id, listing_search_terms.term_id, …) make
// Postgres raise 23503 when a value is referenced — surfaced as a friendly
// "in use — deactivate instead" error.

import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TAXONOMY_LEVEL_ORDER,
  TAXONOMY_LEVELS,
  type TaxonomyLevelSlug,
} from "@/lib/admin/taxonomy-config";

export type TaxonomyActionResult =
  | { ok: true; id?: number }
  | { ok: false; error: string };

const IN_USE_ERROR = "In use by existing data — deactivate instead.";
const DUPLICATE_ERROR = "A value with that name already exists.";

const levelSchema = z.enum(
  TAXONOMY_LEVEL_ORDER as unknown as [
    TaxonomyLevelSlug,
    ...TaxonomyLevelSlug[],
  ],
);
const idSchema = z.number().int().positive();
const textValueSchema = z.string().trim().min(1).max(120);
const numberValueSchema = z.number().int().min(0).max(100000);

// ---------------------------------------------------------------------------
// Whitelisted row builder — the ONLY way user input becomes DB columns.
// ---------------------------------------------------------------------------
function buildRow(
  level: TaxonomyLevelSlug,
  values: Record<string, unknown>,
  mode: "create" | "update",
): { row: Record<string, unknown> } | { error: string } {
  const config = TAXONOMY_LEVELS[level];
  const row: Record<string, unknown> = {};

  for (const col of config.columns) {
    const raw = values[col.key];
    if (raw === undefined || raw === null || raw === "") {
      if (col.required && mode === "create")
        return { error: `${col.label} is required.` };
      if (mode === "create" && col.kind === "number") row[col.key] = 0;
      continue; // update: omitted column stays untouched
    }
    if (col.kind === "text") {
      const parsed = textValueSchema.safeParse(raw);
      if (!parsed.success) return { error: `${col.label} is invalid.` };
      row[col.key] = parsed.data;
    } else {
      const parsed = numberValueSchema.safeParse(
        typeof raw === "string" ? Number(raw) : raw,
      );
      if (!parsed.success) return { error: `${col.label} is invalid.` };
      row[col.key] = parsed.data;
    }
  }

  if (config.parent) {
    const raw = values[config.parent.column];
    if (raw === undefined || raw === null || raw === "") {
      if (config.parent.required && mode === "create")
        return { error: `${config.parent.label} is required.` };
      if (!config.parent.required && raw !== undefined)
        row[config.parent.column] = null; // explicit "no parent"
    } else {
      const parsed = idSchema.safeParse(
        typeof raw === "string" ? Number(raw) : raw,
      );
      if (!parsed.success)
        return { error: `${config.parent.label} is invalid.` };
      row[config.parent.column] = parsed.data;
    }
  }

  if (Object.keys(row).length === 0) return { error: "Nothing to save." };
  return { row };
}

// ---------------------------------------------------------------------------
// Generic CRUD
// ---------------------------------------------------------------------------

export async function createValue(input: {
  level: string;
  values: Record<string, unknown>;
}): Promise<TaxonomyActionResult> {
  const { adminId } = await requireAdmin();

  const level = levelSchema.safeParse(input.level);
  if (!level.success) return { ok: false, error: "Unknown taxonomy level." };
  const built = buildRow(level.data, input.values ?? {}, "create");
  if ("error" in built) return { ok: false, error: built.error };

  const config = TAXONOMY_LEVELS[level.data];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(config.table)
    .insert(built.row)
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: DUPLICATE_ERROR };
    return { ok: false, error: "Could not create the value." };
  }

  await logAdminAction({
    adminId,
    action: "taxonomy_create",
    targetType: "taxonomy",
    targetId: `${config.table}:${data.id}`,
    metadata: { level: level.data, values: built.row },
  });

  return { ok: true, id: data.id as number };
}

export async function updateValue(input: {
  level: string;
  id: number;
  values: Record<string, unknown>;
}): Promise<TaxonomyActionResult> {
  const { adminId } = await requireAdmin();

  const level = levelSchema.safeParse(input.level);
  const id = idSchema.safeParse(input.id);
  if (!level.success || !id.success)
    return { ok: false, error: "Invalid request." };
  const built = buildRow(level.data, input.values ?? {}, "update");
  if ("error" in built) return { ok: false, error: built.error };

  const config = TAXONOMY_LEVELS[level.data];

  // part_categories: a category can never be its own parent.
  if (
    config.parent?.optionsTable === "part_categories" &&
    built.row[config.parent.column] === id.data
  )
    return { ok: false, error: "A category cannot be its own parent." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from(config.table)
    .update(built.row)
    .eq("id", id.data)
    .select("id");

  if (error) {
    if (error.code === "23505") return { ok: false, error: DUPLICATE_ERROR };
    return { ok: false, error: "Could not update the value." };
  }
  if (!data || data.length === 0)
    return { ok: false, error: "Value not found." };

  await logAdminAction({
    adminId,
    action: "taxonomy_update",
    targetType: "taxonomy",
    targetId: `${config.table}:${id.data}`,
    metadata: { level: level.data, values: built.row },
  });

  return { ok: true, id: id.data };
}

/**
 * Flip is_active. Deactivation hides the value from NEW-listing/garage pickers
 * ONLY — existing listings keep it, visible and searchable (LOCKED decision).
 */
export async function setActive(input: {
  level: string;
  id: number;
  active: boolean;
}): Promise<TaxonomyActionResult> {
  const { adminId } = await requireAdmin();

  const level = levelSchema.safeParse(input.level);
  const id = idSchema.safeParse(input.id);
  const active = z.boolean().safeParse(input.active);
  if (!level.success || !id.success || !active.success)
    return { ok: false, error: "Invalid request." };

  const config = TAXONOMY_LEVELS[level.data];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(config.table)
    .update({ is_active: active.data })
    .eq("id", id.data)
    .select("id");

  if (error) return { ok: false, error: "Could not update the value." };
  if (!data || data.length === 0)
    return { ok: false, error: "Value not found." };

  await logAdminAction({
    adminId,
    action: active.data ? "taxonomy_update" : "taxonomy_deactivate",
    targetType: "taxonomy",
    targetId: `${config.table}:${id.data}`,
    metadata: { level: level.data, is_active: active.data },
  });

  return { ok: true, id: id.data };
}

/**
 * Hard delete — succeeds ONLY when nothing references the value. The restrict
 * FKs raise 23503 otherwise, surfaced as the friendly "in use" message.
 */
export async function deleteValue(input: {
  level: string;
  id: number;
}): Promise<TaxonomyActionResult> {
  const { adminId } = await requireAdmin();

  const level = levelSchema.safeParse(input.level);
  const id = idSchema.safeParse(input.id);
  if (!level.success || !id.success)
    return { ok: false, error: "Invalid request." };

  const config = TAXONOMY_LEVELS[level.data];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(config.table)
    .delete()
    .eq("id", id.data)
    .select("id");

  if (error) {
    if (error.code === "23503") return { ok: false, error: IN_USE_ERROR };
    return { ok: false, error: "Could not delete the value." };
  }
  if (!data || data.length === 0)
    return { ok: false, error: "Value not found." };

  await logAdminAction({
    adminId,
    action: "taxonomy_delete",
    targetType: "taxonomy",
    targetId: `${config.table}:${id.data}`,
    metadata: { level: level.data },
  });

  return { ok: true, id: id.data };
}

// ---------------------------------------------------------------------------
// Slang (search_terms + search_term_targets) — ADMO-06.
// A target row resolves to EXACTLY ONE entity (exclusive-arc CHECK in 0003):
// make_id XOR model_id XOR config_id.
// ---------------------------------------------------------------------------

const slangTargetSchema = z.object({
  kind: z.enum(["make", "model", "config"]),
  id: idSchema,
});

export type SlangTargetInput = z.infer<typeof slangTargetSchema>;

const TARGET_COLUMN: Record<SlangTargetInput["kind"], string> = {
  make: "make_id",
  model: "model_id",
  config: "config_id",
};

function targetRows(termId: number, targets: SlangTargetInput[]) {
  return targets.map((t) => ({
    search_term_id: termId,
    make_id: t.kind === "make" ? t.id : null,
    model_id: t.kind === "model" ? t.id : null,
    config_id: t.kind === "config" ? t.id : null,
  }));
}

/** Create a slang term and its target mappings in one flow (≤3-click path). */
export async function createSlangTerm(input: {
  term: string;
  targets: SlangTargetInput[];
}): Promise<TaxonomyActionResult> {
  const { adminId } = await requireAdmin();

  const term = textValueSchema.safeParse(input.term);
  const targets = z.array(slangTargetSchema).max(20).safeParse(input.targets);
  if (!term.success || !targets.success)
    return { ok: false, error: "Invalid request." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("search_terms")
    .insert({ term: term.data })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505")
      return { ok: false, error: "That term already exists." };
    return { ok: false, error: "Could not create the term." };
  }

  if (targets.data.length > 0) {
    const { error: targetError } = await admin
      .from("search_term_targets")
      .insert(targetRows(data.id as number, targets.data));
    if (targetError)
      return {
        ok: false,
        error:
          "Term created, but mapping targets failed — edit the term to retry.",
      };
  }

  await logAdminAction({
    adminId,
    action: "taxonomy_create",
    targetType: "taxonomy",
    targetId: `search_terms:${data.id}`,
    metadata: {
      level: "terms",
      term: term.data,
      targets: targets.data.map((t) => `${TARGET_COLUMN[t.kind]}:${t.id}`),
    },
  });

  return { ok: true, id: data.id as number };
}

/** Rename a slang term (targets untouched). */
export async function updateSlangTerm(input: {
  id: number;
  term: string;
}): Promise<TaxonomyActionResult> {
  return updateValue({
    level: "terms",
    id: input.id,
    values: { term: input.term },
  });
}

/**
 * Replace a term's target mappings wholesale: delete existing
 * search_term_targets rows, insert the submitted set (the new full truth).
 */
export async function setSlangTargets(input: {
  termId: number;
  targets: SlangTargetInput[];
}): Promise<TaxonomyActionResult> {
  const { adminId } = await requireAdmin();

  const termId = idSchema.safeParse(input.termId);
  const targets = z.array(slangTargetSchema).max(20).safeParse(input.targets);
  if (!termId.success || !targets.success)
    return { ok: false, error: "Invalid request." };

  const admin = createAdminClient();

  // Term must exist (avoids silently "succeeding" on a deleted term).
  const { data: termRow } = await admin
    .from("search_terms")
    .select("id")
    .eq("id", termId.data)
    .maybeSingle();
  if (!termRow) return { ok: false, error: "Term not found." };

  const { error: deleteError } = await admin
    .from("search_term_targets")
    .delete()
    .eq("search_term_id", termId.data);
  if (deleteError)
    return { ok: false, error: "Could not update the term's targets." };

  if (targets.data.length > 0) {
    const { error: insertError } = await admin
      .from("search_term_targets")
      .insert(targetRows(termId.data, targets.data));
    if (insertError)
      return { ok: false, error: "Could not update the term's targets." };
  }

  await logAdminAction({
    adminId,
    action: "taxonomy_update",
    targetType: "taxonomy",
    targetId: `search_terms:${termId.data}`,
    metadata: {
      level: "terms",
      targets: targets.data.map((t) => `${TARGET_COLUMN[t.kind]}:${t.id}`),
    },
  });

  return { ok: true, id: termId.data };
}
