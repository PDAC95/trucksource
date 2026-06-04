// garage.test.ts — Phase-4 My Garage privacy/RLS gate (GRGE-01/02 data layer).
//
// garage_trucks is the project's FIRST owner-scoped read+write `authenticated`
// table, so the cross-cutting privacy gate is re-verified here: a garage is
// private account data and must NEVER appear on a public surface. Under RLS
// default-deny with NO anon policy, the worst-case public caller (a fresh anon
// client) must:
//   - SELECT and see NOTHING (0 rows — not an error: no anon policy ⇒ RLS filters
//     every row out, so a public read returns an empty array);
//   - INSERT and be DENIED (no anon insert policy ⇒ the write errors).
//
// Mirrors rls.test.ts / fitment.test.ts exactly: runs against Supabase Staging
// with the anon key only (see _supabase.ts) and self-skips when the Supabase env
// vars are absent so a secret-less CI run does not hard-fail.
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, anonClient } from "./_supabase";

const d = INTEGRATION_ENABLED ? describe : describe.skip;

d("garage_trucks: owner-scoped private, invisible to anon", () => {
  it("anon SELECT returns 0 rows (RLS default-deny, no anon policy)", async () => {
    const { data, error } = await anonClient()
      .from("garage_trucks")
      .select("*");
    // No anon SELECT policy ⇒ RLS filters every row out: an empty array, NOT an error.
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect((data ?? []).length).toBe(0);
  });

  it("anon INSERT is DENIED (no anon insert policy)", async () => {
    const { error } = await anonClient().from("garage_trucks").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      model_id: 1,
    });
    // No anon INSERT policy ⇒ RLS blocks the write for the anon key.
    expect(error).not.toBeNull();
  });
});
