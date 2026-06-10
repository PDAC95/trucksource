// social.test.ts — Phase-8 social layer RLS gate (SOCL-01 comments, SOCL-02 saves).
//
// Proves the three structural comment rules live at the DB layer (not app code):
//   - self-attribution: an authenticated insert with author_id ≠ own uid is rejected
//   - comments closed when sold: inserts against a non-active listing are rejected
//     (Pitfall 2 — the l.status='active' arm lives in the INSERT RLS policy)
//   - depth-1: a reply's parent must itself be top-level (Pitfall 3)
// Plus: comments are public-read but anon-write-denied; NO update path exists
// (locked: no editing — the absent policy IS the enforcement); saves are owner-only
// on every operation; comment_deletion_log is default-deny for all clients and the
// BEFORE DELETE definer trigger audits parents AND FK-cascaded replies; the
// my_listing_save_counts definer RPC is revoked from anon and seller-scoped.
//
// Authenticated gates need real signed-in users; Staging has email-confirm ON, so
// fixtures are created confirmed via the TEST-ONLY service-role helpers in
// _supabase.ts (the gates themselves are always asserted through anon/authed
// clients — never the service role). The whole suite self-skips without the
// service key so a secret-less CI run does not hard-fail.
//
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SERVICE_INTEGRATION_ENABLED,
  anonClient,
  serviceClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./_supabase";

const d = SERVICE_INTEGRATION_ENABLED ? describe : describe.skip;

/** True when the error is an RLS denial (42501 / policy violation). */
function isRlsDenial(
  error: { code?: string; message: string } | null,
): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = error.message.toLowerCase();
  return code === "42501" || msg.includes("row-level security");
}

d("social layer: comments + saves + deletion audit RLS gates", () => {
  let seller: TestUser; // owns the fixture listings
  let buyer: TestUser; // comments + saves
  let svc: SupabaseClient; // fixtures/teardown + audit-row verification ONLY

  let activeListingId: number;
  let soldListingId: number;
  let parentCommentId: number;
  let replyCommentId: number;

  beforeAll(async () => {
    svc = serviceClient();
    seller = await createTestUser("slr");
    buyer = await createTestUser("byr");

    // A real seeded condition id (FK on listings.condition_id).
    const { data: cond, error: condError } = await svc
      .from("conditions")
      .select("id")
      .limit(1)
      .single();
    if (condError || !cond) throw new Error("no conditions seeded on Staging");

    const base = {
      seller_id: seller.id,
      asking_price: 100,
      condition_id: cond.id,
      shipping_option: "local_pickup",
    };
    const { data: rows, error } = await svc
      .from("listings")
      .insert([
        { ...base, title: "social gate fixture ACTIVE", status: "active" },
        { ...base, title: "social gate fixture SOLD", status: "sold" },
      ])
      .select("id, status");
    if (error || !rows || rows.length !== 2) {
      throw new Error(`fixture listings failed: ${error?.message}`);
    }
    activeListingId = rows.find((r) => r.status === "active")!.id;
    soldListingId = rows.find((r) => r.status === "sold")!.id;
  }, 60_000);

  afterAll(async () => {
    // Listings cascade comments + saves; the audit log has no FK, clean explicitly.
    if (svc) {
      if (activeListingId || soldListingId) {
        await svc
          .from("listings")
          .delete()
          .in("id", [activeListingId, soldListingId].filter(Boolean));
        await svc
          .from("comment_deletion_log")
          .delete()
          .in("listing_id", [activeListingId, soldListingId].filter(Boolean));
      }
      await deleteTestUser(buyer);
      await deleteTestUser(seller);
    }
  }, 60_000);

  // --- Gate 1+2: public-read, anon-write-denied ---------------------------

  it("anon can SELECT listing_comments (public-read)", async () => {
    const { data, error } = await anonClient()
      .from("listing_comments")
      .select("id, listing_id, author_id, parent_id, body, created_at");
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("anon INSERT into listing_comments is DENIED", async () => {
    const { error } = await anonClient().from("listing_comments").insert({
      listing_id: activeListingId,
      author_id: "00000000-0000-0000-0000-000000000000",
      body: "anon should not write this",
    });
    expect(error).not.toBeNull();
  });

  // --- Gate 3: self-attribution --------------------------------------------

  it("authenticated insert with author_id ≠ own uid is RLS-rejected", async () => {
    const { error } = await buyer.client.from("listing_comments").insert({
      listing_id: activeListingId,
      author_id: seller.id, // impersonation attempt
      body: "not my identity",
    });
    expect(isRlsDenial(error)).toBe(true);
  });

  // --- Gate 4: comments closed when sold (Pitfall 2) -----------------------

  it("insert on a SOLD listing is RLS-rejected (comments closed)", async () => {
    const { error } = await buyer.client.from("listing_comments").insert({
      listing_id: soldListingId,
      author_id: buyer.id,
      body: "should be closed",
    });
    expect(isRlsDenial(error)).toBe(true);
  });

  // --- Gate 5: depth-1 (Pitfall 3) ------------------------------------------

  it("top-level comment + depth-1 reply succeed; reply-to-reply is rejected", async () => {
    const { data: parent, error: parentError } = await buyer.client
      .from("listing_comments")
      .insert({
        listing_id: activeListingId,
        author_id: buyer.id,
        body: "top-level comment",
      })
      .select("id")
      .single();
    expect(parentError).toBeNull();
    parentCommentId = parent!.id;

    const { data: reply, error: replyError } = await seller.client
      .from("listing_comments")
      .insert({
        listing_id: activeListingId,
        author_id: seller.id,
        parent_id: parentCommentId,
        body: "depth-1 reply",
      })
      .select("id")
      .single();
    expect(replyError).toBeNull();
    replyCommentId = reply!.id;

    const { error: nestedError } = await buyer.client
      .from("listing_comments")
      .insert({
        listing_id: activeListingId,
        author_id: buyer.id,
        parent_id: replyCommentId, // parent is itself a reply → depth-2
        body: "nested reply must be rejected",
      });
    expect(isRlsDenial(nestedError)).toBe(true);
  });

  // --- Gate 6: no update path -----------------------------------------------

  it("authenticated UPDATE of own comment affects 0 rows (no UPDATE policy)", async () => {
    const { data, error } = await buyer.client
      .from("listing_comments")
      .update({ body: "edited!" })
      .eq("id", parentCommentId)
      .select("id");
    // No UPDATE policy → RLS filters every target row out: zero rows, no edit.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    const { data: after } = await anonClient()
      .from("listing_comments")
      .select("body")
      .eq("id", parentCommentId)
      .single();
    expect(after?.body).toBe("top-level comment");
  });

  // --- Gate 7: saves owner-only ----------------------------------------------

  it("saves are owner-only: self-insert OK, anon read 0, cross-user insert rejected", async () => {
    const { error: insertError } = await buyer.client
      .from("saved_listings")
      .insert({ user_id: buyer.id, listing_id: activeListingId });
    expect(insertError).toBeNull();

    const { data: own, error: ownError } = await buyer.client
      .from("saved_listings")
      .select("user_id, listing_id")
      .eq("listing_id", activeListingId);
    expect(ownError).toBeNull();
    expect(own).toHaveLength(1);

    // Anon: no policy at all → default-deny filters to 0 rows, no error.
    const { data: anonRows, error: anonError } = await anonClient()
      .from("saved_listings")
      .select("user_id, listing_id");
    expect(anonError).toBeNull();
    expect(anonRows ?? []).toHaveLength(0);

    // Another authed user can't see the buyer's save either.
    const { data: crossRows } = await seller.client
      .from("saved_listings")
      .select("user_id")
      .eq("listing_id", activeListingId);
    expect(crossRows ?? []).toHaveLength(0);

    // Inserting a save attributed to someone else is rejected.
    const { error: crossInsert } = await seller.client
      .from("saved_listings")
      .insert({ user_id: buyer.id, listing_id: activeListingId });
    expect(isRlsDenial(crossInsert)).toBe(true);
  });

  // --- Gate 8: audit log default-deny ------------------------------------------

  it("comment_deletion_log is default-deny for anon AND authenticated", async () => {
    const { data: anonRows, error: anonError } = await anonClient()
      .from("comment_deletion_log")
      .select("id");
    expect(anonError).toBeNull();
    expect(anonRows ?? []).toHaveLength(0);

    const { data: authRows, error: authError } = await buyer.client
      .from("comment_deletion_log")
      .select("id");
    expect(authError).toBeNull();
    expect(authRows ?? []).toHaveLength(0);

    const { error: insertError } = await buyer.client
      .from("comment_deletion_log")
      .insert({
        comment_id: 1,
        listing_id: activeListingId,
        author_id: buyer.id,
        body: "forged audit row",
        comment_created_at: new Date().toISOString(),
      });
    expect(insertError).not.toBeNull();
  });

  // --- Gate 9: audit trigger fires for parent + cascaded reply -----------------

  it("deleting a parent cascades the reply and audits BOTH rows", async () => {
    // The buyer authored the parent; the reply (seller's) cascades via FK.
    const { error: deleteError } = await buyer.client
      .from("listing_comments")
      .delete()
      .eq("id", parentCommentId);
    expect(deleteError).toBeNull();

    const { data: remaining } = await anonClient()
      .from("listing_comments")
      .select("id")
      .in("id", [parentCommentId, replyCommentId]);
    expect(remaining ?? []).toHaveLength(0);

    // Audit verification is service-role territory (the log is default-deny).
    const { data: auditRows, error: auditError } = await svc
      .from("comment_deletion_log")
      .select("comment_id, deleted_by")
      .in("comment_id", [parentCommentId, replyCommentId]);
    expect(auditError).toBeNull();
    expect(auditRows).toHaveLength(2);
    for (const row of auditRows ?? []) {
      expect(row.deleted_by).toBe(buyer.id);
    }
  });

  // --- Gate 10: definer RPC hygiene ---------------------------------------------

  it("my_listing_save_counts: anon rejected; seller sees only own listings", async () => {
    const { error: anonError } = await anonClient().rpc(
      "my_listing_save_counts",
    );
    expect(anonError).not.toBeNull(); // execute revoked from anon

    // Seller sees the buyer's save as a COUNT (never WHO) on their own listing.
    const { data: sellerCounts, error: sellerError } = await seller.client.rpc(
      "my_listing_save_counts",
    );
    expect(sellerError).toBeNull();
    const row = (sellerCounts ?? []).find(
      (r: { listing_id: number }) => r.listing_id === activeListingId,
    );
    expect(row?.save_count).toBe(1);
    // Every returned listing belongs to the caller (only fixture listings here).
    for (const r of sellerCounts ?? []) {
      expect([activeListingId, soldListingId]).toContain(r.listing_id);
    }

    // The buyer sells nothing → empty result, never other sellers' counts.
    const { data: buyerCounts, error: buyerError } = await buyer.client.rpc(
      "my_listing_save_counts",
    );
    expect(buyerError).toBeNull();
    expect(buyerCounts ?? []).toHaveLength(0);
  });
});
