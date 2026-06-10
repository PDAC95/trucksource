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

// The seller's public profile grid (/u/[username]) reads the seller's ACTIVE listings
// directly from the public-read `listings` table with an enumerated select — NOT via
// the RPC. This is a distinct public surface (the cross-cutting gate: "public profile
// surface renders no PII"), so it gets its own assertion: as anon, read a seller's
// active listings exactly as the profile page does and prove ZERO PII keys appear and
// the enumerated shape is honored.
const PROFILE_GRID_KEYS = [
  "id",
  "title",
  "asking_price",
  "condition_id",
  "date_listed",
] as const;

d("contract: profile-grid listings read exposes zero PII", () => {
  it("the anon seller active-listings read returns no PII keys", async () => {
    const supabase = anonClient();

    // Discover a real seller_id from any public listing (no seeded id assumed).
    const { data: seed, error: seedError } = await supabase
      .from("listings")
      .select("seller_id")
      .eq("status", "active")
      .limit(1);
    expect(seedError).toBeNull();

    const seller = (seed ?? [])[0] as { seller_id: string } | undefined;
    if (!seller) {
      console.log(
        "[search.contract] no active listings — profile-grid shape OK",
      );
      return;
    }

    // Read the seller's active listings EXACTLY as app/(public)/u/[username]/page.tsx does.
    const { data, error } = await supabase
      .from("listings")
      .select("id, title, asking_price, condition_id, date_listed")
      .eq("seller_id", seller.seller_id)
      .eq("status", "active");

    expect(error).toBeNull();
    const rows = (data ?? []) as Array<Record<string, unknown>>;

    for (const row of rows) {
      const keys = Object.keys(row);
      // The enumerated select shape is honored — only the allowed public columns...
      for (const k of keys) {
        expect(PROFILE_GRID_KEYS).toContain(
          k as (typeof PROFILE_GRID_KEYS)[number],
        );
      }
      // ...and ZERO PII keys.
      for (const pii of PII_KEYS) {
        expect(keys).not.toContain(pii);
      }
    }
  });
});
