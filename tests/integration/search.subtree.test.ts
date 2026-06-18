// search.subtree.test.ts — subtree-match contract on the search_listings RPC.
//
// Phase 16 (SRCH-03 / FINT-03): selecting a category ANCESTOR (root or
// subcategory) must return every listing tagged at any DESCENDANT leaf — the
// recursive-CTE subtree expansion added in migration 0025. This gate proves the
// behavior end-to-end against Staging: the result set for an ancestor id is a
// SUPERSET of the result set for one of its leaf ids.
//
// Runs against Supabase Staging with the anon key only (part_categories is
// public-read) and self-skips when the Supabase env vars are absent, exactly
// like search.contract.test.ts.
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, anonClient } from "./_supabase";

const ROOT_NAME = "Fuel Tanks, Straps & Accessories";
const SUBCATEGORY_NAME = "Fuel Tanks";
const LEAF_NAME = "Driver Side Fuel Tanks";

const d = INTEGRATION_ENABLED ? describe : describe.skip;

/** Call search_listings with only a category filter; return the listing ids. */
async function searchByCategory(
  supabase: ReturnType<typeof anonClient>,
  categoryId: number,
): Promise<number[]> {
  const { data, error } = await supabase.rpc("search_listings", {
    p_q: null,
    p_model_id: null,
    p_config_id: null,
    p_category_id: categoryId,
    p_condition_id: null,
    p_fits_model_id: null,
    p_fits_config_id: null,
    p_limit: 100,
    p_offset: 0,
  });
  expect(error).toBeNull();
  return ((data ?? []) as Array<{ id: number }>).map((r) => r.id);
}

d(
  "contract: search_listings expands a category selection to its subtree",
  () => {
    it("ancestor (root) result set is a superset of the leaf result set", async () => {
      const supabase = anonClient();

      // 1) Resolve the root id (public-read part_categories).
      const { data: rootRows, error: rootErr } = await supabase
        .from("part_categories")
        .select("id")
        .is("parent_id", null)
        .eq("name", ROOT_NAME)
        .limit(1);
      expect(rootErr).toBeNull();
      const root = (rootRows ?? [])[0] as { id: number } | undefined;
      if (!root) {
        console.log(
          `[search.subtree] root "${ROOT_NAME}" not on staging — skipping`,
        );
        return;
      }

      // Resolve the subcategory id ('Fuel Tanks' under the root).
      const { data: subRows, error: subErr } = await supabase
        .from("part_categories")
        .select("id")
        .eq("parent_id", root.id)
        .eq("name", SUBCATEGORY_NAME)
        .limit(1);
      expect(subErr).toBeNull();
      const sub = (subRows ?? [])[0] as { id: number } | undefined;
      if (!sub) {
        console.log(
          `[search.subtree] subcategory "${SUBCATEGORY_NAME}" not on staging — skipping`,
        );
        return;
      }

      // Resolve the leaf id ('Driver Side Fuel Tanks' under the subcategory).
      const { data: leafRows, error: leafErr } = await supabase
        .from("part_categories")
        .select("id")
        .eq("parent_id", sub.id)
        .eq("name", LEAF_NAME)
        .limit(1);
      expect(leafErr).toBeNull();
      const leaf = (leafRows ?? [])[0] as { id: number } | undefined;
      if (!leaf) {
        console.log(
          `[search.subtree] leaf "${LEAF_NAME}" not on staging — skipping`,
        );
        return;
      }

      // 2) Search by the ROOT id and by the LEAF id.
      const rootIds = await searchByCategory(supabase, root.id);
      const leafIds = await searchByCategory(supabase, leaf.id);

      if (leafIds.length === 0) {
        console.log(
          "[search.subtree] no listings tagged under the subtree — call shape OK",
        );
        return;
      }

      // 3) Every listing matched at the LEAF must also be matched at the ROOT
      //    (ancestor selection is a superset of the descendant — subtree match).
      const rootSet = new Set(rootIds);
      for (const id of leafIds) {
        expect(rootSet.has(id)).toBe(true);
      }

      // The subcategory selection must likewise be a superset of the leaf.
      const subIds = await searchByCategory(supabase, sub.id);
      const subSet = new Set(subIds);
      for (const id of leafIds) {
        expect(subSet.has(id)).toBe(true);
      }
    });
  },
);
