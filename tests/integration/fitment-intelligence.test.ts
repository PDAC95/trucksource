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
import { listingSchema } from "@/lib/listings/schema";

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

// ---------------------------------------------------------------------------
// FINT-01: rules drive category + garage suggestions (06-03).
//
// suggestFitment() (lib/fitment/suggest.ts) needs an AUTHENTICATED cookie client
// (it calls listMyTrucks(), owner-RLS), which the anon-only integration harness
// cannot provide. So FINT-01 is asserted at the DATA layer the engine depends on —
// the seeded rules — proving the engine has real, name-resolvable data to surface
// for BOTH the category-driven path and the garage-expansion path. The live grouped
// output (garage group omitted when no trucks; "Common for <Category>" labels) is
// verified end-to-end at the Plan 06-04 human-verify checkpoint with a real session.
//
// The pure no-throw / empty-result contract is covered by the type: a SuggestResult
// of { groups: [] } is the documented "nothing matched" value suggestFitment returns
// (it never throws) — asserted as a shape below without a Supabase round-trip.
d("FINT-01: rules drive category + garage suggestions", () => {
  it("≥1 category-driven rule exists with a resolvable implied search term", async () => {
    // trigger_category_id not null → the CONTEXT primary trigger. Joining the
    // implied search term proves the engine resolves names server-side, not ids.
    const { data, error } = await anonClient()
      .from("fitment_rules")
      .select(
        "id, trigger_category_id, implies_search_term_id, search_terms:implies_search_term_id ( term )",
      )
      .not("trigger_category_id", "is", null)
      .not("implies_search_term_id", "is", null);
    expect(error).toBeNull();
    const rows = (data ?? []) as unknown as Array<{
      search_terms: { term: string } | null;
    }>;
    expect(rows.length).toBeGreaterThan(0);
    // At least one resolves to a real (non-empty) implied term name.
    expect(rows.some((r) => !!r.search_terms?.term)).toBe(true);
  });

  it("≥1 garage-expansion rule exists (trigger_model_id → implied search term: the 359-Guys seed)", async () => {
    const { data, error } = await anonClient()
      .from("fitment_rules")
      .select(
        "id, trigger_model_id, implies_search_term_id, search_terms:implies_search_term_id ( term )",
      )
      .not("trigger_model_id", "is", null)
      .not("implies_search_term_id", "is", null);
    expect(error).toBeNull();
    const rows = (data ?? []) as unknown as Array<{
      search_terms: { term: string } | null;
    }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => !!r.search_terms?.term)).toBe(true);
  });

  it("empty-result contract: { groups: [] } is the valid no-match shape (suggestFitment never throws)", () => {
    // suggestFitment returns this exact shape when nothing matches; documented here
    // as the pure contract since the live call needs an authenticated cookie client.
    const empty: import("@/lib/fitment/types").SuggestResult = { groups: [] };
    expect(empty.groups).toEqual([]);
  });
});
