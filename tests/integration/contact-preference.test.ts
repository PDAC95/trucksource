// contact-preference.test.ts — LIST-07 RLS gate.
//
// Proves the account-level contact preference (migration 0009, on profiles_public)
// is:
//   1. a NON-PII enum readable by anon (it names a contact MODE, never an
//      email/phone) — so reading it leaks no PII and the value is always one of the
//      three allowed modes;
//   2. owner-only-writable — an anon UPDATE of contact_preference is DENIED because
//      profiles_public has no anon update policy (only the owner-update policy from
//      0001). This proves only the owner can change it.
//
// Runs against Supabase Staging with the anon key only (see _supabase.ts). The
// whole suite self-skips when the Supabase env vars are absent so a secret-less CI
// run does not hard-fail. Mirrors privacy.contract.test.ts / garage.test.ts.
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, PII_KEYS, anonClient } from "./_supabase";

const CONTACT_PREFERENCES = [
  "email_only",
  "email_phone",
  "messaging_only",
] as const;

const d = INTEGRATION_ENABLED ? describe : describe.skip;

d("contact preference (LIST-07): non-PII enum, owner-only writable", () => {
  it("anon can read contact_preference and it leaks no PII", async () => {
    const supabase = anonClient();
    const { data, error } = await supabase
      .from("profiles_public")
      .select("id, contact_preference")
      .limit(50);

    // Selecting contact_preference must succeed (it lives on the public table).
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    for (const row of data ?? []) {
      const keys = Object.keys(row);
      // The non-PII guarantee: no PII key is ever present in the row.
      for (const pii of PII_KEYS) {
        expect(keys).not.toContain(pii);
      }
      // The value is always one of the three allowed contact modes.
      expect(CONTACT_PREFERENCES).toContain(
        row.contact_preference as (typeof CONTACT_PREFERENCES)[number],
      );
    }
  });

  it("anon UPDATE of contact_preference is denied (owner-only)", async () => {
    const supabase = anonClient();
    // No anon update policy on profiles_public → the update affects zero rows.
    // RLS makes this a silent no-op (0 rows) rather than an error; either way the
    // anon caller can NEVER change another user's preference. Assert nothing was
    // updated.
    const { data, error } = await supabase
      .from("profiles_public")
      .update({ contact_preference: "email_phone" })
      .eq("contact_preference", "messaging_only")
      .select("id");

    // Anon update must not succeed in changing any row: either an RLS error, or
    // zero rows returned (the policy filtered every row out of the update).
    if (error) {
      expect(error).not.toBeNull();
    } else {
      expect(data ?? []).toHaveLength(0);
    }
  });
});
