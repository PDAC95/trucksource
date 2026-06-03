// privacy.contract.test.ts — THE cross-cutting privacy gate (ACCT-02, PRIV-01, PRIV-02).
//
// Proves that PII can NEVER reach an anonymous public-profile fetch. The guarantee is
// structural — PII columns physically live only in profiles_private, and the
// profiles_public table is the only thing an anon caller can read — so this contract
// holds without any select-list discipline. Every later phase that adds a public
// surface re-runs this gate.
//
// Two layers of proof:
//   1. STRUCTURAL (deterministic, no seeding, rate-limit-free): selecting any PII
//      column from profiles_public errors `column ... does not exist`, proving the
//      PII columns are physically absent from the public table.
//   2. LIVE ROW (best-effort): seed one disposable user via the signup trigger and
//      assert the anon-readable row carries zero PII keys + only the allowed columns.
//      Staging has "Confirm email" ON, so signup sends a real email and can hit
//      Supabase's email rate limit; when seeding is unavailable the live-row assertion
//      is skipped (the structural layer already enforces the gate).
//
// Runs against Supabase Staging with the anon key only (see _supabase.ts). The whole
// suite self-skips when the Supabase env vars are absent so a secret-less CI run does
// not hard-fail.
//
// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import {
  INTEGRATION_ENABLED,
  PII_KEYS,
  PUBLIC_PROFILE_KEYS,
  anonClient,
} from "./_supabase";

const d = INTEGRATION_ENABLED ? describe : describe.skip;

d("privacy contract: anonymous public-profile fetch has zero PII keys", () => {
  // --- Layer 1: structural column-absence proof (no seeding required) ---
  it.each(PII_KEYS)(
    "profiles_public has no '%s' column (PII is physically absent)",
    async (piiCol) => {
      const supabase = anonClient();
      const { error } = await supabase.from("profiles_public").select(piiCol);
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/does not exist/i);
    },
  );

  it("exposes the allowed public columns to an anonymous caller", async () => {
    const supabase = anonClient();
    const { error } = await supabase
      .from("profiles_public")
      .select(PUBLIC_PROFILE_KEYS.join(","));
    expect(error).toBeNull();
  });

  // --- Layer 2: best-effort live-row contract via the signup trigger ---
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const username = `Test${suffix}`.slice(0, 20);
  // gmail.com passes Supabase's email-format validation; plus-addressing keeps it
  // disposable. (test.com/example.com are rejected as invalid by GoTrue.)
  const email = `takeoffparts.gsd+${suffix}@gmail.com`;
  const password = `Pw-${suffix}-aB`;

  let seeded = false;

  beforeAll(async () => {
    const supabase = anonClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          first_name: "Throwaway",
          last_name: "Tester",
          phone: "+15555550123",
          state_province: "Texas",
          country: "USA",
          street_address: "123 Secret St",
          postal_code: "75001",
          terms_accepted_at: new Date().toISOString(),
        },
      },
    });
    // The handle_new_user trigger fires `after insert on auth.users`, BEFORE email
    // confirmation, so the rows exist even for an unconfirmed user. Only treat a
    // clean signup as seeded; rate-limit/other errors leave seeded=false and the
    // live-row assertions skip (structural layer still enforces the gate).
    seeded = !error;
  });

  it("live public-profile row carries zero PII keys + only allowed columns", async (ctx) => {
    if (!seeded) ctx.skip();
    const supabase = anonClient();
    const { data, error } = await supabase
      .from("profiles_public")
      .select("*")
      .eq("username", username)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const keys = Object.keys(data ?? {});
    for (const pii of PII_KEYS) {
      expect(keys).not.toContain(pii);
    }
    for (const k of keys) {
      expect(PUBLIC_PROFILE_KEYS).toContain(
        k as (typeof PUBLIC_PROFILE_KEYS)[number],
      );
    }
  });
});

// --- Layer 3: the Verified Seller badge (VERF-04) is a derived boolean, not a PII path ---
//
// The badge on /u/[username] is rendered from is_verified_seller(uuid) — a SECURITY
// DEFINER boolean granted to anon, mirroring active_listing_count. This block proves the
// badge addition did NOT open a new PII path: an anon caller gets back ONLY a boolean,
// and the structural PII_KEYS layer above still proves phone + every other PII column is
// physically absent from profiles_public. There is NO new column on the public table — the
// flag is computed each read, so the worst-case anon caller can never reach phone/PII via it.
d("verified-seller badge: anon gets only a boolean, never a PII path", () => {
  it("is_verified_seller is anon-callable and returns a boolean", async () => {
    const supabase = anonClient();
    // An unknown user id → false. The point is the RPC is reachable by anon and the
    // ONLY thing it yields is a primitive boolean (no row, no PII columns).
    const { data, error } = await supabase.rpc("is_verified_seller", {
      profile_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).toBeNull();
    expect(typeof data).toBe("boolean");
    expect(data).toBe(false);
  });
});
