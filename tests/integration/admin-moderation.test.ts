// admin-moderation.test.ts — Phase 10 plan 10-04 (ADMO-02), Pitfall 2 gate.
//
// Proves listing moderation is STRUCTURAL: once a listing is hidden (or is a
// draft), every public read path excludes it without app-side filtering —
// and the read paths cannot drift apart:
//   (a) search_listings RPC (security INVOKER → 0019 RLS applies) excludes it
//   (b) a direct anon `from('listings')` read returns nothing
//   (c) active_listing_count (security DEFINER → RLS does NOT apply; 0020
//       bakes the exclusion into the body) does not count it
//   (d) the OWNER still sees their own hidden/draft row (0019 owner arm)
//
// Fixtures are created by the spec itself via the service role (a dedicated
// seller + one listing) and removed in afterAll (user delete cascades the
// listing). The service role is used ONLY for fixtures/state flips — every
// gate is asserted through anon/owner clients (the _supabase.ts rule).
//
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  SERVICE_INTEGRATION_ENABLED,
  anonClient,
  serviceClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./_supabase";

const d = SERVICE_INTEGRATION_ENABLED ? describe : describe.skip;

// A nonsense unique token: tokenizes to a single FTS lexeme, so the search
// RPC's keyword arm finds the fixture (baseline) and ONLY the fixture.
const TOKEN = `zqxmodgate${Date.now()}`;

d("admin moderation (ADMO-02): hidden/draft structural exclusion", () => {
  let seller: TestUser;
  let listingId: number;

  beforeAll(async () => {
    seller = await createTestUser("Mod");

    const service = serviceClient();
    const { data: condition } = await service
      .from("conditions")
      .select("id")
      .limit(1)
      .single();
    expect(condition).not.toBeNull();

    const { data: listing, error } = await service
      .from("listings")
      .insert({
        seller_id: seller.id,
        title: `Moderation gate ${TOKEN}`,
        asking_price: 123.45,
        condition_id: (condition as { id: number }).id,
        shipping_option: "local_pickup",
        status: "active",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    listingId = (listing as { id: number }).id;
  }, 30_000);

  afterAll(async () => {
    await deleteTestUser(seller); // cascades the listing via the seller FK
  }, 30_000);

  /** ids returned by the public search RPC for our unique token. */
  async function anonSearchIds(): Promise<number[]> {
    const { data, error } = await anonClient().rpc("search_listings", {
      p_q: TOKEN,
    });
    expect(error).toBeNull();
    return ((data ?? []) as { id: number }[]).map((r) => r.id);
  }

  async function anonDirectRead(): Promise<unknown[]> {
    const { data, error } = await anonClient()
      .from("listings")
      .select("id, status")
      .eq("id", listingId);
    expect(error).toBeNull();
    return data ?? [];
  }

  async function activeCount(): Promise<number> {
    const { data, error } = await anonClient().rpc("active_listing_count", {
      profile_id: seller.id,
    });
    expect(error).toBeNull();
    return Number(data);
  }

  it("baseline: an active, un-hidden listing is publicly visible everywhere", async () => {
    expect(await anonSearchIds()).toContain(listingId);
    expect(await anonDirectRead()).toHaveLength(1);
    expect(await activeCount()).toBe(1); // fresh seller — exactly this listing
  });

  it("hidden: vanishes from search RPC, direct reads and the count RPC — but not from the owner", async () => {
    const { error } = await serviceClient()
      .from("listings")
      .update({
        hidden_at: new Date().toISOString(),
        hidden_reason: "moderation",
      })
      .eq("id", listingId);
    expect(error).toBeNull();

    // (a) search RPC is security invoker → the 0019 policy filters it.
    expect(await anonSearchIds()).not.toContain(listingId);
    // (b) direct anon read → empty (no existence leak, no error).
    expect(await anonDirectRead()).toHaveLength(0);
    // (c) the DEFINER count RPC (0020) no longer counts it.
    expect(await activeCount()).toBe(0);
    // (d) the owner still sees their own hidden row (0019 owner arm).
    const { data: ownRows, error: ownError } = await seller.client
      .from("listings")
      .select("id, hidden_reason")
      .eq("id", listingId);
    expect(ownError).toBeNull();
    expect(ownRows).toHaveLength(1);
    expect((ownRows![0] as { hidden_reason: string }).hidden_reason).toBe(
      "moderation",
    );
  });

  it("draft: excluded from search RPC and direct anon reads — owner-visible", async () => {
    const { error } = await serviceClient()
      .from("listings")
      .update({ hidden_at: null, hidden_reason: null, status: "draft" })
      .eq("id", listingId);
    expect(error).toBeNull();

    // (a) draft never reaches search (RLS arm AND the RPC's status filter).
    expect(await anonSearchIds()).not.toContain(listingId);
    // (b) direct anon read → empty.
    expect(await anonDirectRead()).toHaveLength(0);
    // (d) owner still sees the draft.
    const { data: ownRows, error: ownError } = await seller.client
      .from("listings")
      .select("id, status")
      .eq("id", listingId);
    expect(ownError).toBeNull();
    expect(ownRows).toHaveLength(1);
    expect((ownRows![0] as { status: string }).status).toBe("draft");
  });
});
