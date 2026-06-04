// fitment.test.ts — Phase-3 fitment taxonomy verification gate (FITL-01..08).
//
// Proves, under RLS default-deny + public-read, that the fitment library is:
//   1. anon-readable on every one of the 10 reference tables (the taxonomy is
//      world-browsable — the product needs an unauthenticated buyer to search it);
//   2. anon-write-DENIED (no write policy => writes are service-role-only);
//   3. seeded with the user-reviewed launch dataset (Peterbilt/Kenworth + models +
//      configs + applicability + the flat L5–L8 dimensions);
//   4. structurally sound: EVERY seeded slang term resolves to at least one real
//      make/model/config (zero dangling terms — THE gated seed-integrity deliverable),
//      and the exclusive arc holds (exactly one of make/model/config per target row).
//
// Mirrors rls.test.ts exactly: runs against Supabase Staging with the anon key only
// (see _supabase.ts) and self-skips when the Supabase env vars are absent so a
// secret-less CI run does not hard-fail.
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, anonClient } from "./_supabase";

const d = INTEGRATION_ENABLED ? describe : describe.skip;

// The 10 Phase-3 reference tables (0003_fitment_taxonomy.sql). All are anon-readable,
// none has a write policy (writes are service-role-only).
const FITMENT_TABLES = [
  "makes",
  "models",
  "configurations",
  "model_configurations",
  "search_terms",
  "search_term_targets",
  "part_categories",
  "materials",
  "conditions",
  "special_filters",
] as const;

d("fitment reference tables: anon-readable, anon-write-denied", () => {
  it("every Phase-3 reference table is anon-readable (public SELECT)", async () => {
    const supabase = anonClient();
    for (const t of FITMENT_TABLES) {
      const { data, error } = await supabase.from(t).select("*");
      // Public read policy => no error, an array back (RLS does not filter reads here).
      expect(error, `table ${t} should be anon-readable`).toBeNull();
      expect(Array.isArray(data), `table ${t} should return an array`).toBe(
        true,
      );
    }
  });

  it("anon INSERT into a reference table is DENIED (no write policy)", async () => {
    const supabase = anonClient();
    const { error } = await supabase
      .from("makes")
      .insert({ name: "Hacker-" + Date.now() });
    // No INSERT policy on the table => RLS blocks the write for the anon key.
    expect(error).not.toBeNull();
  });
});

d("fitment seed integrity (gated deliverable)", () => {
  it("makes seeded: Peterbilt + Kenworth present", async () => {
    const { data, error } = await anonClient().from("makes").select("name");
    expect(error).toBeNull();
    const names = (data ?? []).map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(["Peterbilt", "Kenworth"]));
  });

  it("models seeded under makes (includes W900 + 379)", async () => {
    const { data, error } = await anonClient().from("models").select("name");
    expect(error).toBeNull();
    const names = (data ?? []).map((r) => r.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual(expect.arrayContaining(["W900", "379"]));
  });

  it("configurations + applicability seeded (Aerodyne present, join non-empty)", async () => {
    const configs = await anonClient().from("configurations").select("name");
    expect(configs.error).toBeNull();
    const configNames = (configs.data ?? []).map((r) => r.name);
    expect(configNames.length).toBeGreaterThan(0);
    expect(configNames).toEqual(expect.arrayContaining(["Aerodyne"]));

    const join = await anonClient()
      .from("model_configurations")
      .select("model_id, configuration_id");
    expect(join.error).toBeNull();
    expect((join.data ?? []).length).toBeGreaterThan(0);
  });

  it("L5–L8 dimensions seeded (categories tree + materials/conditions/special_filters)", async () => {
    const materials = await anonClient().from("materials").select("id");
    expect(materials.error).toBeNull();
    expect((materials.data ?? []).length).toBeGreaterThan(0);

    const conditions = await anonClient().from("conditions").select("id");
    expect(conditions.error).toBeNull();
    expect((conditions.data ?? []).length).toBeGreaterThan(0);

    const filters = await anonClient().from("special_filters").select("id");
    expect(filters.error).toBeNull();
    expect((filters.data ?? []).length).toBeGreaterThan(0);

    // part_categories is a self-referencing tree: at least one top-level
    // (parent_id null) and at least one child (parent_id not null).
    const cats = await anonClient()
      .from("part_categories")
      .select("id, parent_id");
    expect(cats.error).toBeNull();
    const rows = cats.data ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.parent_id === null)).toBe(true);
    expect(rows.some((r) => r.parent_id !== null)).toBe(true);
  });

  it("EVERY slang term resolves to a real entity (zero dangling terms)", async () => {
    // Read both sides under the anon key (both tables are public-read) and compute
    // the orphan set client-side: any search_term id with no matching target row.
    const terms = await anonClient().from("search_terms").select("id, term");
    expect(terms.error).toBeNull();
    const termRows = terms.data ?? [];
    expect(termRows.length).toBeGreaterThan(0);

    const targets = await anonClient()
      .from("search_term_targets")
      .select("search_term_id");
    expect(targets.error).toBeNull();
    const targetedIds = new Set(
      (targets.data ?? []).map((r) => r.search_term_id),
    );

    const orphans = termRows
      .filter((t) => !targetedIds.has(t.id))
      .map((t) => t.term);
    // THE gated assertion: the seed must contain no slang term that resolves to nothing.
    expect(orphans).toEqual([]);

    // The 5 doc-cited terms must be present in the dictionary.
    const termNames = termRows.map((t) => t.term);
    expect(termNames).toEqual(
      expect.arrayContaining([
        "359 Guys",
        "Flat Glass Kenworth",
        "Aerodyne",
        "Large Car",
        "Glider",
      ]),
    );
  });

  it("exclusive arc holds: exactly one of make/model/config per target row", async () => {
    const { data, error } = await anonClient()
      .from("search_term_targets")
      .select("make_id, model_id, config_id");
    expect(error).toBeNull();
    const rows = data ?? [];
    expect(rows.length).toBeGreaterThan(0);
    // Read-side double-check of the num_nonnulls=1 CHECK enforced at write time.
    for (const r of rows) {
      const nonNull = [r.make_id, r.model_id, r.config_id].filter(
        (v) => v !== null && v !== undefined,
      ).length;
      expect(nonNull).toBe(1);
    }
  });
});
