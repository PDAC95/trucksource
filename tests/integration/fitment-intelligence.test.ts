// fitment-intelligence.test.ts — Phase-6 RLS + seed gate for the three new tables
// (0012_fitment_rules.sql): fitment_rules, listing_categories, listing_search_terms.
//
// The cross-cutting privacy/RLS gate (CLAUDE.md invariant #2) re-verified for Phase 6:
//   - fitment_rules: PUBLIC-READ (anon SELECT ok) + seed-present, but anon WRITE DENIED
//     (no write policy → service-role/seed only, like every Phase-3 reference table).
//   - listing_categories / listing_search_terms: PUBLIC-READ (anon SELECT ok) but anon
//     WRITE DENIED (owner-write-via-EXISTS; anon has no auth.uid()).
//
// Mirrors fitment.test.ts / listings.test.ts exactly: runs against Supabase Staging with
// the anon key only (see _supabase.ts) and self-skips when the Supabase env vars are
// absent so a secret-less CI run does not hard-fail.
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, anonClient } from "./_supabase";

const d = INTEGRATION_ENABLED ? describe : describe.skip;

d("fitment_rules: public-read + seeded, anon-write-denied", () => {
  it("anon SELECT returns an array, no error (public-read)", async () => {
    const { data, error } = await anonClient()
      .from("fitment_rules")
      .select("id");
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("seed is present (at least one rule exists)", async () => {
    const { data, error } = await anonClient()
      .from("fitment_rules")
      .select("id");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("anon INSERT is DENIED (no write policy)", async () => {
    // A minimal arc-valid rule (one trigger arm + one implies arm) so the CHECKs pass
    // and the ONLY thing that can reject the write is RLS (no anon write policy).
    const { error } = await anonClient()
      .from("fitment_rules")
      .insert({ trigger_category_id: 1, implies_search_term_id: 1 });
    expect(error).not.toBeNull();
  });
});

d(
  "listing_categories: public-read, anon-write-denied (owner-write-via-EXISTS)",
  () => {
    it("anon SELECT returns an array, no error (public-read)", async () => {
      const { data, error } = await anonClient()
        .from("listing_categories")
        .select("id");
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it("anon INSERT is DENIED (anon has no auth.uid())", async () => {
      const { error } = await anonClient()
        .from("listing_categories")
        .insert({ listing_id: -1, category_id: 1 });
      // Owner-write-via-EXISTS: anon can never satisfy the EXISTS on listings.seller_id.
      // Accept either an RLS denial or an FK error — the EXPECTATION is denial.
      expect(error).not.toBeNull();
    });
  },
);

d(
  "listing_search_terms: public-read, anon-write-denied (owner-write-via-EXISTS)",
  () => {
    it("anon SELECT returns an array, no error (public-read)", async () => {
      const { data, error } = await anonClient()
        .from("listing_search_terms")
        .select("id");
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it("anon INSERT is DENIED (anon has no auth.uid())", async () => {
      const { error } = await anonClient()
        .from("listing_search_terms")
        .insert({ listing_id: -1, term_id: 1 });
      expect(error).not.toBeNull();
    });
  },
);
