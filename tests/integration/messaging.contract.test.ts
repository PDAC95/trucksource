// messaging.contract.test.ts — READ-SURFACE PII gate for the Phase-9 chat (MSG-06).
//
// Mirrors social.contract.test.ts: runs the EXACT enumerated-column selects the
// messaging readers (lib/messaging/queries.ts) issue — thread list/detail shape,
// listing-card hydration, counterparty attribution, messages shape — AS a thread
// participant against live Staging, and recursively asserts no key from the PII
// denylist (_supabase.ts) appears anywhere in any response.
//
// Two messaging-specific guarantees ride on top:
//   1. REALTIME PAYLOAD SNAPSHOT — Postgres Changes ships the WHOLE messages
//      row to subscribers, so the contract is over `select *`, not a curated
//      list: the column set must be EXACTLY {id, thread_id, sender_id, body,
//      created_at}. A new column on messages must consciously pass this test
//      before it silently starts broadcasting (MSG-06 realtime guard).
//   2. THE SCOPED contact_log EXCEPTION — the seller's "initial contact
//      context" legitimately contains the buyer's form name/email (MSG-03, by
//      design). The contract is that this surface is reachable ONLY by the
//      buyer and the seller; a third user and anon get zero rows.
//
// Fixtures (listing → contact_log → thread → message) are created via the
// TEST-ONLY service-role helpers; every contract is asserted through
// authenticated/anon clients. Self-skips without the service key.
//
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SERVICE_INTEGRATION_ENABLED,
  PII_KEYS,
  anonClient,
  serviceClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./_supabase";

/**
 * The exact message_threads columns every reader works from (THREAD_COLUMNS in
 * lib/messaging/queries.ts — thread list, thread detail, unread count).
 */
export const THREAD_SELECT_COLUMNS = [
  "id",
  "listing_id",
  "buyer_id",
  "seller_id",
  "contact_log_id",
  "last_message_at",
  "buyer_last_read_at",
  "buyer_hidden_at",
  "seller_last_read_at",
  "seller_hidden_at",
  // Moderation freeze timestamp (0019, ADMO-04) — a non-PII flag the thread
  // view renders the closed-composer state from.
  "frozen_at",
] as const;

/** The exact listings columns the thread card hydration selects. */
export const THREAD_LISTING_COLUMNS = [
  "id",
  "title",
  "asking_price",
  "status",
] as const;

/** The exact profiles_public columns counterparty attribution batch-reads. */
export const THREAD_COUNTERPARTY_COLUMNS = [
  "id",
  "username",
  "display_name",
] as const;

/** The exact messages columns getThreadMessages selects (= MessageRow). */
export const MESSAGE_SELECT_COLUMNS = [
  "id",
  "thread_id",
  "sender_id",
  "body",
  "created_at",
] as const;

/**
 * The realtime payload snapshot: Postgres Changes ships the FULL messages row,
 * so this is the complete column inventory of the table. Adding a column to
 * messages widens what every subscriber receives — it must be added here
 * deliberately or the contract fails.
 */
export const MESSAGES_REALTIME_COLUMNS = [
  "id",
  "thread_id",
  "sender_id",
  "body",
  "created_at",
] as const;

const d = SERVICE_INTEGRATION_ENABLED ? describe : describe.skip;

/** Recursively assert no PII denylist key appears anywhere in the value. */
function expectNoPiiDeep(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) expectNoPiiDeep(item);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      expect(PII_KEYS).not.toContain(key);
      expectNoPiiDeep(nested);
    }
  }
}

/** Assert every row exposes ONLY the allowed keys (and, deeply, zero PII). */
function expectShape(
  rows: Record<string, unknown>[] | null,
  allowed: readonly string[],
) {
  expect(rows).not.toBeNull();
  for (const row of rows ?? []) {
    for (const key of Object.keys(row)) {
      expect(allowed).toContain(key);
    }
    expectNoPiiDeep(row);
  }
}

d("messaging read-surface contract: zero PII in thread/message shapes", () => {
  let seller: TestUser;
  let buyer: TestUser;
  let third: TestUser;
  let svc: SupabaseClient;

  let listingId: number;
  let contactLogId: number;
  let threadId: number;

  beforeAll(async () => {
    svc = serviceClient();
    seller = await createTestUser("cslr");
    buyer = await createTestUser("cbyr");
    third = await createTestUser("cthd");

    const { data: cond } = await svc
      .from("conditions")
      .select("id")
      .limit(1)
      .single();
    if (!cond) throw new Error("no conditions seeded on Staging");

    const { data: listing, error: listingError } = await svc
      .from("listings")
      .insert({
        seller_id: seller.id,
        title: "messaging contract fixture",
        asking_price: 99,
        condition_id: cond.id,
        shipping_option: "local_pickup",
        status: "active",
      })
      .select("id")
      .single();
    if (listingError || !listing) {
      throw new Error(`fixture listing failed: ${listingError?.message}`);
    }
    listingId = listing.id;

    const { data: contact, error: contactError } = await svc
      .from("contact_log")
      .insert({
        listing_id: listingId,
        buyer_id: buyer.id,
        seller_id: seller.id,
        buyer_name: "Contract Buyer",
        buyer_email: buyer.email,
        message_text: "contract fixture contact",
      })
      .select("id")
      .single();
    if (contactError || !contact) {
      throw new Error(`fixture contact_log failed: ${contactError?.message}`);
    }
    contactLogId = contact.id;

    const { data: thread, error: threadError } = await svc
      .from("message_threads")
      .insert({
        listing_id: listingId,
        buyer_id: buyer.id,
        seller_id: seller.id,
        contact_log_id: contactLogId,
      })
      .select("id")
      .single();
    if (threadError || !thread) {
      throw new Error(`fixture thread failed: ${threadError?.message}`);
    }
    threadId = thread.id;

    const { error: messageError } = await svc.from("messages").insert({
      thread_id: threadId,
      sender_id: buyer.id,
      body: "contract fixture message",
    });
    if (messageError) {
      throw new Error(`fixture message failed: ${messageError.message}`);
    }
  }, 60_000);

  afterAll(async () => {
    if (svc) {
      if (threadId) {
        await svc.from("messages").delete().eq("thread_id", threadId);
        await svc.from("message_threads").delete().eq("id", threadId);
      }
      if (listingId) {
        await svc.from("contact_log").delete().eq("listing_id", listingId);
        await svc.from("listings").delete().eq("id", listingId);
      }
      await deleteTestUser(third);
      await deleteTestUser(buyer);
      await deleteTestUser(seller);
    }
  }, 60_000);

  // --- The thread shapes (inbox list + detail share THREAD_COLUMNS) ---------

  it("the thread reader's exact select carries no PII keys", async () => {
    const { data, error } = await buyer.client
      .from("message_threads")
      .select(THREAD_SELECT_COLUMNS.join(","))
      .eq("id", threadId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expectShape(
      data as unknown as Record<string, unknown>[] | null,
      THREAD_SELECT_COLUMNS,
    );
  });

  it("the listing-card hydration shape carries no PII keys", async () => {
    const { data, error } = await buyer.client
      .from("listings")
      .select(THREAD_LISTING_COLUMNS.join(","))
      .eq("id", listingId);
    expect(error).toBeNull();
    expectShape(
      data as unknown as Record<string, unknown>[] | null,
      THREAD_LISTING_COLUMNS,
    );
  });

  it("counterparty identity resolves ONLY through profiles_public name fields", async () => {
    // The exact attribution read the thread shapes use for BOTH participants.
    const { data, error } = await buyer.client
      .from("profiles_public")
      .select(THREAD_COUNTERPARTY_COLUMNS.join(","))
      .in("id", [buyer.id, seller.id]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expectShape(
      data as unknown as Record<string, unknown>[] | null,
      THREAD_COUNTERPARTY_COLUMNS,
    );

    // And the PII table behind the names stays unreachable on this surface.
    const { data: privateRows, error: privateError } = await buyer.client
      .from("profiles_private")
      .select("*")
      .eq("id", seller.id);
    expect(privateError).toBeNull();
    expect(privateRows ?? []).toHaveLength(0);
  });

  // --- The messages shapes (reader select + realtime full row) --------------

  it("the message reader's exact select carries no PII keys", async () => {
    const { data, error } = await buyer.client
      .from("messages")
      .select(MESSAGE_SELECT_COLUMNS.join(","))
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
    expectShape(
      data as unknown as Record<string, unknown>[] | null,
      MESSAGE_SELECT_COLUMNS,
    );
  });

  it("the FULL messages row (the realtime payload) is exactly the snapshot column set", async () => {
    // Realtime ships `select *` to subscribers — the contract must cover the
    // whole row, not a curated select.
    const { data, error } = await seller.client
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .limit(1);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const keys = Object.keys(data![0] as Record<string, unknown>).sort();
    expect(keys).toEqual([...MESSAGES_REALTIME_COLUMNS].sort());
    expectNoPiiDeep(data![0]);
  });

  // --- The scoped contact_log exception (MSG-03, by design) -----------------

  it("the seller's initial-contact context DOES carry the buyer's form PII — and only participants can reach it", async () => {
    // The sanctioned exception: the seller reads the buyer's submitted
    // name/email from the immutable contact record (this is the trust feature,
    // not a leak — the columns are buyer_*-prefixed form inputs, never the
    // profiles_private row).
    const { data: sellerRows, error: sellerError } = await seller.client
      .from("contact_log")
      .select("id, buyer_name, buyer_email, buyer_phone, message_text")
      .eq("id", contactLogId);
    expect(sellerError).toBeNull();
    expect(sellerRows).toHaveLength(1);
    expect(sellerRows![0].buyer_name).toBe("Contract Buyer");
    expect(sellerRows![0].buyer_email).toBe(buyer.email);

    // ...but the surface is participant-scoped: a third user and anon get
    // ZERO rows (RLS, not select-discipline, is the boundary).
    const { data: thirdRows, error: thirdError } = await third.client
      .from("contact_log")
      .select("id, buyer_name, buyer_email")
      .eq("id", contactLogId);
    expect(thirdError).toBeNull();
    expect(thirdRows ?? []).toHaveLength(0);

    const { data: anonRows, error: anonError } = await anonClient()
      .from("contact_log")
      .select("id, buyer_name, buyer_email")
      .eq("id", contactLogId);
    expect(anonError).toBeNull();
    expect(anonRows ?? []).toHaveLength(0);
  }, 20_000);

  // --- Non-participant: the whole surface vanishes --------------------------

  it("a non-participant sees ZERO rows across the entire messaging surface", async () => {
    const surfaces = ["message_threads", "messages", "contact_log"] as const;
    for (const table of surfaces) {
      const { data, error } = await third.client.from(table).select("*");
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    }
  }, 20_000);
});
