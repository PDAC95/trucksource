// search.contract.test.ts — no-PII contract on the search_listings RPC payload.
//
// The search read surface every downstream Phase-7 plan calls (search_listings) must
// NEVER ship seller PII (CLAUDE.md invariant #1, Pitfall 1). The RPC returns only
// public listing columns and resolves photos/fitment/seller separately — this gate
// proves that structurally: for every returned row, ZERO keys from the PII denylist
// appear. Mirrors public-profile.contract.test.ts.
//
// Runs against Supabase Staging with the anon key only (see _supabase.ts) and
// self-skips when the Supabase env vars are absent.
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, PII_KEYS, anonClient } from "./_supabase";

// The exact public column shape the RPC returns — no seller identity columns at all.
const ALLOWED_RPC_KEYS = [
  "id",
  "title",
  "asking_price",
  "condition_id",
  "date_listed",
  "rank",
  "total_count",
] as const;

const d = INTEGRATION_ENABLED ? describe : describe.skip;

d("contract: search_listings RPC exposes zero PII", () => {
  it("no returned row contains any PII key", async () => {
    const supabase = anonClient();
    const { data, error } = await supabase.rpc("search_listings", {
      p_q: null,
      p_model_id: null,
      p_config_id: null,
      p_category_id: null,
      p_condition_id: null,
      p_fits_model_id: null,
      p_fits_config_id: null,
      p_limit: 24,
      p_offset: 0,
    });

    expect(error).toBeNull();
    const rows = (data ?? []) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
      console.log("[search.contract] no active listings — call shape OK");
      return;
    }

    for (const row of rows) {
      const keys = Object.keys(row);
      // Returned keys are a SUBSET of the allowed public RPC columns...
      for (const k of keys) {
        expect(ALLOWED_RPC_KEYS).toContain(
          k as (typeof ALLOWED_RPC_KEYS)[number],
        );
      }
      // ...and contain NONE of the PII keys.
      for (const pii of PII_KEYS) {
        expect(keys).not.toContain(pii);
      }
    }
  });
});
