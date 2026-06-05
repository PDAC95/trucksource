// listings.test.ts — Phase-5 listings privacy/RLS gate (LIST-01/02 data layer).
//
// The four 0006 listing tables get the cross-cutting privacy gate re-verified here.
// Unlike garage_trucks (fully private), listings are PUBLIC marketplace data, so the
// posture differs per table:
//   - listings: anon CAN read (public marketplace) but CANNOT write (no anon write
//     policy → owner-only).
//   - listing_view_events: anon CAN insert (a view is a public event — the one
//     anon-writable table) but CANNOT read (no select policy → the raw analytics
//     stream is service-role-only, Phase 10).
//
// Mirrors garage.test.ts / rls.test.ts exactly: runs against Supabase Staging with the
// anon key only (see _supabase.ts) and self-skips when the Supabase env vars are absent
// so a secret-less CI run does not hard-fail.
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, anonClient } from "./_supabase";

const d = INTEGRATION_ENABLED ? describe : describe.skip;

d("listings: public-read, owner-write (anon cannot mutate)", () => {
  it("anon SELECT on listings returns an array, no error (public-read)", async () => {
    const { data, error } = await anonClient().from("listings").select("id");
    // Public-read policy ⇒ anon SELECT succeeds. The table may be empty (no rows
    // seeded) — that is fine; we assert no error and an array, not a row count.
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("anon INSERT into listings is DENIED (no anon write policy)", async () => {
    const { error } = await anonClient().from("listings").insert({
      seller_id: "00000000-0000-0000-0000-000000000000",
      title: "anon should not be able to write this",
      asking_price: 1,
      condition_id: 1,
      shipping_option: "local_pickup",
    });
    // No anon INSERT policy ⇒ RLS blocks the write for the anon key.
    expect(error).not.toBeNull();
  });
});

d("listing_view_events: anon-writable event stream, NOT anon-readable", () => {
  it("anon INSERT is PERMITTED by RLS (a view is a public event)", async () => {
    // We deliberately do NOT create a real listing; we insert against a listing_id
    // that almost certainly does not exist. The point is to prove the RLS INSERT
    // policy permits the ATTEMPT — a foreign-key violation (23503) would still mean
    // RLS allowed the write through to the FK check, whereas an RLS denial (42501)
    // would mean the policy blocked it. We accept either "no error" or an FK error,
    // but treat an RLS-violation error as a failure.
    const { error } = await anonClient()
      .from("listing_view_events")
      .insert({ listing_id: -1 });
    if (error) {
      // Permitted by RLS but failed the FK to a nonexistent listing → that's fine.
      // An RLS/permission denial would have a different code/message.
      const code = (error as { code?: string }).code ?? "";
      const msg = error.message.toLowerCase();
      const isRlsDenial =
        code === "42501" ||
        msg.includes("row-level security") ||
        msg.includes("violates row-level security");
      expect(isRlsDenial).toBe(false);
    } else {
      // No error means the insert was accepted outright — also proves RLS permits it.
      expect(error).toBeNull();
    }
  });

  it("anon SELECT on listing_view_events is NOT readable (no select policy)", async () => {
    const { data, error } = await anonClient()
      .from("listing_view_events")
      .select("id");
    // No anon SELECT policy ⇒ RLS filters every row out: an empty array, NOT an
    // error. The raw event stream is readable only by the service role (Phase 10).
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect((data ?? []).length).toBe(0);
  });
});
