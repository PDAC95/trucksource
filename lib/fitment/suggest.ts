"use server";

// FINT-01 suggestion engine — a Server Action (the repo's cascade-reader precedent,
// NOT an Edge Function; ARCHITECTURE.md notes it is promotable later). Given the
// seller's chosen part-category id and (implicitly) their garage, it returns
// suggestions GROUPED BY SOURCE so the group label is the explainability layer.
//
// INVARIANTS HONORED:
//   - getClaims/RLS only: reads go through the cookie-bound createClient() (RLS-scoped).
//     The garage read is delegated to listMyTrucks() (owner-RLS); fitment_rules is
//     public-read. NEVER imports @/lib/supabase/admin (invariant #3).
//   - Precision over recall (CONTEXT, Pitfall 6): only rules at/above
//     MIN_SUGGESTION_CONFIDENCE surface. No score ever reaches the caller.
//   - Proposes only — NO writes, NO auto-apply. Returns { groups: [] } and never
//     throws when nothing matches (empty state is a pure client decision in 06-04).
//   - ONE mechanism: both category inference and garage→flat expansion read the SAME
//     fitment_rules table (RESEARCH Pattern 1) — no second inference store.
//   - No PII: this path never touches profiles_* — only fitment reference names.
import { createClient } from "@/lib/supabase/server";
import { listMyTrucks, type GarageTruck } from "@/lib/garage/queries";
import {
  type SuggestResult,
  type SuggestionGroup,
  type SuggestedFitment,
  type SuggestedTag,
  MIN_SUGGESTION_CONFIDENCE,
} from "@/lib/fitment/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function suggestFitment(input: {
  partCategoryId: number | null;
}): Promise<SuggestResult> {
  const supabase = await createClient();
  const groups: SuggestionGroup[] = [];

  // 1) GARAGE group — omit ENTIRELY if no trucks (CONTEXT "no garage → silent").
  const trucks = await listMyTrucks();
  if (trucks.length > 0) {
    const fitments: SuggestedFitment[] = trucks.map((t) => ({
      modelId: t.modelId,
      configId: t.configId,
      makeName: t.makeName,
      modelName: t.modelName,
      configName: t.configName,
    }));
    const tags = await garageExpansionTags(supabase, trucks);
    groups.push({
      source: "garage",
      label: "From your garage",
      fitments,
      tags,
    });
  }

  // 2) CATEGORY group — only when a category is chosen and it has content.
  if (input.partCategoryId != null) {
    const categoryGroup = await categorySuggestions(
      supabase,
      input.partCategoryId,
    );
    if (categoryGroup) groups.push(categoryGroup);
  }

  return { groups }; // never throw — empty state is a pure client decision
}

// ---------------------------------------------------------------------------
// Garage → flat expansion. A chosen garage model implies its slang/special-filter/
// category tags (RESEARCH Pattern 1: trigger_model_id → implies_* rows in the SAME
// fitment_rules table). Exact-fitment garage suggestions come from the truck itself
// (already in `fitments`), so model/config IMPLIES arms are OUT OF SCOPE here —
// we only emit flat tags. Config-scoped rules (trigger_config_id not null) only fire
// when a truck with that model also carries that config.
// ---------------------------------------------------------------------------
type RuleTagRow = {
  trigger_model_id: number | null;
  trigger_config_id: number | null;
  implies_category_id: number | null;
  implies_search_term_id: number | null;
  implies_special_filter_id: number | null;
  search_terms: { term: string } | null;
  special_filters: { name: string } | null;
  part_categories: { name: string } | null;
};

async function garageExpansionTags(
  supabase: SupabaseServerClient,
  trucks: GarageTruck[],
): Promise<SuggestedTag[]> {
  const modelIds = Array.from(new Set(trucks.map((t) => t.modelId))).filter(
    (id) => id > 0,
  );
  if (modelIds.length === 0) return [];

  const { data, error } = await supabase
    .from("fitment_rules")
    .select(
      "trigger_model_id, trigger_config_id, implies_category_id, implies_search_term_id, implies_special_filter_id, " +
        "search_terms:implies_search_term_id ( term ), " +
        "special_filters:implies_special_filter_id ( name ), " +
        "part_categories:implies_category_id ( name )",
    )
    .in("trigger_model_id", modelIds)
    .gte("confidence", MIN_SUGGESTION_CONFIDENCE);

  if (error || !data) return [];

  const rows = data as unknown as RuleTagRow[];
  const tags: SuggestedTag[] = [];
  const seen = new Set<string>(); // de-dupe by kind+id

  for (const r of rows) {
    // Config-scoped rule: only emit if a truck with this model ALSO has this config.
    if (r.trigger_config_id != null) {
      const match = trucks.some(
        (t) =>
          t.modelId === r.trigger_model_id &&
          t.configId === r.trigger_config_id,
      );
      if (!match) continue;
    }
    const tag = ruleToFlatTag(r);
    if (!tag || !tag.name) continue;
    const key = `${tag.kind}:${tag.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  return tags;
}

// Resolve whichever flat IMPLIES arm is set on a rule into a SuggestedTag. Returns
// null when the rule implies a model/config (not a flat tag) — out of scope here.
function ruleToFlatTag(r: {
  implies_category_id: number | null;
  implies_search_term_id: number | null;
  implies_special_filter_id: number | null;
  search_terms: { term: string } | null;
  special_filters: { name: string } | null;
  part_categories: { name: string } | null;
}): SuggestedTag | null {
  if (r.implies_search_term_id != null) {
    return {
      kind: "search_term",
      id: r.implies_search_term_id,
      name: r.search_terms?.term ?? "",
    };
  }
  if (r.implies_special_filter_id != null) {
    return {
      kind: "special_filter",
      id: r.implies_special_filter_id,
      name: r.special_filters?.name ?? "",
    };
  }
  if (r.implies_category_id != null) {
    return {
      kind: "category",
      id: r.implies_category_id,
      name: r.part_categories?.name ?? "",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Category inference. Rules triggered by the chosen part category imply fitments
// (implies_model_id, resolved to make/model/config names — mirrors the getListing
// fitment embed) AND flat tags (search term / special filter / category). The group
// label is "Common for <category name>". Returns null when the category produced
// zero fitments AND zero tags (so no empty group renders).
// ---------------------------------------------------------------------------
type RuleCategoryRow = {
  implies_model_id: number | null;
  implies_config_id: number | null;
  implies_category_id: number | null;
  implies_search_term_id: number | null;
  implies_special_filter_id: number | null;
  models: { name: string; makes: { name: string } | null } | null;
  configurations: { name: string } | null;
  search_terms: { term: string } | null;
  special_filters: { name: string } | null;
  implied_categories: { name: string } | null;
  trigger: { name: string } | null;
};

async function categorySuggestions(
  supabase: SupabaseServerClient,
  partCategoryId: number,
): Promise<SuggestionGroup | null> {
  const { data, error } = await supabase
    .from("fitment_rules")
    .select(
      "implies_model_id, implies_config_id, implies_category_id, implies_search_term_id, implies_special_filter_id, " +
        "models:implies_model_id ( name, makes:make_id ( name ) ), " +
        "configurations:implies_config_id ( name ), " +
        "search_terms:implies_search_term_id ( term ), " +
        "special_filters:implies_special_filter_id ( name ), " +
        "implied_categories:implies_category_id ( name ), " +
        "trigger:trigger_category_id ( name )",
    )
    .eq("trigger_category_id", partCategoryId)
    .gte("confidence", MIN_SUGGESTION_CONFIDENCE);

  if (error || !data) return null;

  const rows = data as unknown as RuleCategoryRow[];
  const fitments: SuggestedFitment[] = [];
  const tags: SuggestedTag[] = [];
  const seenFit = new Set<number>(); // de-dupe fitments by modelId+configId
  const seenTag = new Set<string>();
  let label = "";

  for (const r of rows) {
    if (r.trigger?.name && !label) label = `Common for ${r.trigger.name}`;

    // Fitment arm: implies a model (with optional config).
    if (r.implies_model_id != null && r.models?.name) {
      const fitKey = r.implies_model_id * 1e6 + (r.implies_config_id ?? 0);
      if (!seenFit.has(fitKey)) {
        seenFit.add(fitKey);
        fitments.push({
          modelId: r.implies_model_id,
          configId: r.implies_config_id,
          makeName: r.models.makes?.name ?? "",
          modelName: r.models.name,
          configName: r.configurations?.name ?? null,
        });
      }
      continue;
    }

    // Flat tag arm.
    const tag = ruleToFlatTag({
      implies_category_id: r.implies_category_id,
      implies_search_term_id: r.implies_search_term_id,
      implies_special_filter_id: r.implies_special_filter_id,
      search_terms: r.search_terms,
      special_filters: r.special_filters,
      part_categories: r.implied_categories,
    });
    if (!tag || !tag.name) continue;
    const key = `${tag.kind}:${tag.id}`;
    if (seenTag.has(key)) continue;
    seenTag.add(key);
    tags.push(tag);
  }

  if (fitments.length === 0 && tags.length === 0) return null;
  if (!label) label = "Common for this category";

  return { source: "category", label, fitments, tags };
}
