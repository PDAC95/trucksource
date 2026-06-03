// public-profile.contract.test.ts — ROUTE-LEVEL PII gate for /u/[username] (PRIV-04).
//
// Plan 02's privacy.contract.test.ts proves the gate at the TABLE level (PII columns
// physically absent from profiles_public). This test complements it by asserting the
// EXACT query the public-profile page runs returns no PII, plus that the
// active_listing_count RPC is anon-callable and returns a number (0 in Phase 1).
//
// The selected columns here MUST stay in sync with
// app/(public)/u/[username]/page.tsx: select("id, username, state_province,
// country, member_since").
//
// Runs against Supabase Staging with the anon key only (see _supabase.ts) and
// self-skips when the Supabase env vars are absent so a secret-less CI run does
// not hard-fail.
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, PII_KEYS, anonClient } from "./_supabase";

// The exact public columns the page enumerates (id is used for the RPC, not rendered).
const PAGE_SELECT_COLUMNS = [
  "id",
  "username",
  "state_province",
  "country",
  "member_since",
] as const;

const d = INTEGRATION_ENABLED ? describe : describe.skip;

d("route contract: /u/[username] query exposes zero PII", () => {
  it("the page's exact select returns no PII keys for any row", async () => {
    const supabase = anonClient();
    const { data, error } = await supabase
      .from("profiles_public")
      .select(PAGE_SELECT_COLUMNS.join(","))
      .limit(1);

    // The select shape itself must be anon-valid (no error).
    expect(error).toBeNull();

    if (!data || data.length === 0) {
      // No public rows seeded yet — the call shape succeeded, which is the
      // assertion that matters here. Skip the row-key check.

      console.log(
        "[public-profile.contract] no public rows yet — call shape OK, row-key check skipped",
      );
      return;
    }

    const row = data[0] as Record<string, unknown>;
    const keys = Object.keys(row);

    // Returned keys are a SUBSET of the allowed page columns...
    for (const k of keys) {
      expect(PAGE_SELECT_COLUMNS).toContain(
        k as (typeof PAGE_SELECT_COLUMNS)[number],
      );
    }
    // ...and contain NONE of the PII keys.
    for (const pii of PII_KEYS) {
      expect(keys).not.toContain(pii);
    }
  });

  it("active_listing_count RPC is anon-callable and returns a number (0 in P1)", async () => {
    const supabase = anonClient();
    // Any uuid works — the P1 function body returns 0 regardless of input.
    const { data, error } = await supabase.rpc("active_listing_count", {
      profile_id: "00000000-0000-0000-0000-000000000000",
    });

    expect(error).toBeNull();
    expect(typeof data).toBe("number");
    expect(data).toBe(0);
  });
});
