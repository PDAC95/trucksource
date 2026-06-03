// rls.test.ts — RLS enforcement gate (ACCT-02).
//
// Proves the privacy split direction is correct under RLS default-deny:
//   - profiles_private has NO anon SELECT policy => an anon SELECT returns 0 rows
//     (RLS denies → empty array, NOT an error).
//   - profiles_public IS anon-readable (returns an array) => the public side is open.
//
// Runs against Supabase Staging with the anon key only (see _supabase.ts). Self-skips
// when the Supabase env vars are absent so a secret-less CI run does not hard-fail.
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, anonClient } from "./_supabase";

const d = INTEGRATION_ENABLED ? describe : describe.skip;

d("RLS: profiles_private is anon-deny, profiles_public is anon-read", () => {
  it("anon SELECT on profiles_private returns 0 rows (not an error)", async () => {
    const supabase = anonClient();
    const { data, error } = await supabase.from("profiles_private").select("*");
    // RLS default-deny: the query succeeds but every row is filtered out.
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it("anon SELECT on profiles_public is allowed (returns an array)", async () => {
    const supabase = anonClient();
    const { data, error } = await supabase.from("profiles_public").select("*");
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("active_listing_count is callable by anon and returns 0 in Phase 1", async () => {
    const supabase = anonClient();
    const { data, error } = await supabase.rpc("active_listing_count", {
      profile_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).toBeNull();
    expect(data).toBe(0);
  });

  // Phase 2 (0002_verification.sql): the anti-abuse tables are service-role-only.
  // They have RLS enabled with NO anon/authenticated policy, so an anon SELECT is
  // filtered to 0 rows (default-deny → empty array, NOT an error).
  it("anon SELECT on otp_send_attempts returns 0 rows (RLS default-deny)", async () => {
    const supabase = anonClient();
    const { data, error } = await supabase
      .from("otp_send_attempts")
      .select("*");
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it("anon SELECT on abuse_events returns 0 rows (RLS default-deny)", async () => {
    const supabase = anonClient();
    const { data, error } = await supabase.from("abuse_events").select("*");
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });
});
