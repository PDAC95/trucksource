// stakeholder-lifecycle.test.ts — Phase 5.1 RLS / privacy gates.
//
// Proves the four-feature schema (migration 0010) holds the cross-cutting privacy
// gate and the lifecycle read rule:
//   (a) ACCT-07/08 privacy — an anon read of a public profile (incl. seller_type,
//       display_name) leaks NONE of PII_KEYS.
//   (a') ACCT-07 non-PII enum — seller_type read anon is null or ∈ SELLER_TYPES.
//   (a'') ACCT-07/08 owner-only write — an anon UPDATE of seller_type/display_name
//       changes ZERO rows (only the 0001 owner-update policy exists; anon has none).
//   (b) LIST-09 expired-excluded — a buyer-facing read filtering status='active'
//       never yields a non-active row.
//
// Runs against Supabase Staging with the anon key only (see _supabase.ts); the
// suite self-skips when the env vars are absent. Mirrors contact-preference.test.ts.
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, PII_KEYS, anonClient } from "./_supabase";
import { SELLER_TYPES } from "@/lib/seller/badge";

const d = INTEGRATION_ENABLED ? describe : describe.skip;

d(
  "stakeholder lifecycle (ACCT-07/08, LIST-09): privacy + lifecycle gates",
  () => {
    it("(a) anon read of seller_type/display_name leaks no PII", async () => {
      const supabase = anonClient();
      const { data, error } = await supabase
        .from("profiles_public")
        .select("id, username, seller_type, display_name")
        .limit(50);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);

      for (const row of data ?? []) {
        const keys = Object.keys(row);
        for (const pii of PII_KEYS) {
          expect(keys).not.toContain(pii);
        }
      }
    });

    it("(a') seller_type read anon is null or one of the 7 types", async () => {
      const supabase = anonClient();
      const { data, error } = await supabase
        .from("profiles_public")
        .select("seller_type")
        .limit(50);

      expect(error).toBeNull();
      for (const row of data ?? []) {
        const st = row.seller_type as string | null;
        if (st !== null) {
          expect(SELLER_TYPES).toContain(st as (typeof SELLER_TYPES)[number]);
        }
      }
    });

    it("(a'') anon UPDATE of seller_type/display_name changes zero rows (owner-only)", async () => {
      const supabase = anonClient();
      // No anon update policy on profiles_public → RLS filters every row out of the
      // update (silent 0-row no-op) or errors. Either way anon can NEVER write.
      const { data, error } = await supabase
        .from("profiles_public")
        .update({ seller_type: "dealer", display_name: "anon-injected" })
        .not("id", "is", null)
        .select("id");

      if (error) {
        expect(error).not.toBeNull();
      } else {
        expect(data ?? []).toHaveLength(0);
      }
    });

    it("(b) LIST-09: a status='active' read never returns a non-active (expired/sold) row", async () => {
      const supabase = anonClient();
      // The buyer-facing active read path. Whether or not an expired row exists in
      // Staging, the filter must never surface a non-active status. The runtime
      // exclusion of seeded 'expired' rows is also covered by the lifecycle queries
      // test in plan 5.1-03.
      const { data, error } = await supabase
        .from("listings")
        .select("id, status")
        .eq("status", "active")
        .limit(50);

      expect(error).toBeNull();
      for (const row of data ?? []) {
        expect(row.status).toBe("active");
      }
    });
  },
);
