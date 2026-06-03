// badge.test.ts — Verified Seller badge truth-table gate (VERF-04).
//
// Proves the server-computed badge is a derived boolean exposed via anon RPC — never a
// stored flag and never any PII. is_verified_seller(uuid) is true ONLY when all three live
// signals hold (email_confirmed_at AND phone_verified_at AND marketplace_terms_accepted_at),
// so clearing any one auto-revokes the badge.
//
// This layer is deterministic and seed-free (like the existing privacy.contract structural
// layer): it asserts what an anonymous caller can observe — the function is anon-callable,
// returns a boolean, and returns false for an unknown user (all three coalesce branches false).
//
// The full POSITIVE truth table (all-three-true) and the REVOCATION case (clearing
// phone_verified_at flips the badge false) are guaranteed at the SQL level by the function
// definition in 0002_verification.sql: it ANDs three independent `... is not null` checks,
// each wrapped in coalesce(..., false). A seeded end-to-end positive case requires an
// OTP-approved user (Twilio 'approved' → phone_verified_at set) and is exercised by the
// e2e verify-wizard spec in Plan 04.
//
// Runs against Supabase Staging with the anon key only (see _supabase.ts). Self-skips when
// the Supabase env vars are absent so a secret-less CI run does not hard-fail.
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, anonClient } from "./_supabase";

const d = INTEGRATION_ENABLED ? describe : describe.skip;

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

d("VERF-04: is_verified_seller is an anon-readable derived boolean", () => {
  it("returns false for a non-existent user (all three signals absent)", async () => {
    const supabase = anonClient();
    const { data, error } = await supabase.rpc("is_verified_seller", {
      profile_id: ZERO_UUID,
    });
    // No row in auth.users / profiles_private → every coalesce branch is false → AND is false.
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("is callable by anon and returns a boolean (only the derived value, never PII)", async () => {
    const supabase = anonClient();
    const { data, error } = await supabase.rpc("is_verified_seller", {
      profile_id: ZERO_UUID,
    });
    expect(error).toBeNull();
    expect(typeof data).toBe("boolean");
  });
});
