// messaging.test.ts — Phase-9 contact → private chat RLS gate (MSG-04, MSG-06).
//
// Gates the 0016 schema live against Staging, exactly as social.test.ts gated
// 0015 — these are structural claims about the database, provable only by
// driving real anon/authenticated clients at the live RLS surface:
//   1. contact_log: buyer-write self-attributed, participant-read, IMMUTABLE
//      (no UPDATE/DELETE policy exists — the absence IS the MSG-04 enforcement)
//   2. message_threads: participant-only read, buyer-only create (invariant #5:
//      threads exist only downstream of a contact_log row), participant-scoped
//      watermark updates, no delete path
//   3. messages: append-only — sender-attributed participant inserts only;
//      UPDATE/DELETE affect 0 rows for EVERY client including the sender
//   4. user_blocks: blocking gates SENDING (messages INSERT policy), never
//      reading history; unblock restores; blocker_id is self-attributed
//   5. reports: exclusive-arc (num_nonnulls = 1), one-report-per-target dedupe
//      (23505), message reports restricted to thread participants, immutable
//   6. realtime publication: messages must be in supabase_realtime (Pitfall 1 —
//      without it subscriptions connect and silently receive nothing); asserted
//      via the service_role-only definer helper from 0017
//
// Authenticated gates need real signed-in users; Staging has email-confirm ON,
// so fixtures are created confirmed via the TEST-ONLY service-role helpers in
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

d(
  "messaging: contact_log + threads + messages + blocks + reports RLS gates",
  () => {
    let seller: TestUser; // owns the fixture listing
    let buyer: TestUser; // initiates contact, sends messages
    let third: TestUser; // authenticated stranger — must see/touch nothing
    let svc: SupabaseClient; // fixtures/teardown + publication check ONLY

    let listingId: number;
    let contactLogId: number;
    let threadId: number;
    let messageId: number;

    beforeAll(async () => {
      svc = serviceClient();
      seller = await createTestUser("mslr");
      buyer = await createTestUser("mbyr");
      third = await createTestUser("mthd");

      const { data: cond, error: condError } = await svc
        .from("conditions")
        .select("id")
        .limit(1)
        .single();
      if (condError || !cond)
        throw new Error("no conditions seeded on Staging");

      const { data: listing, error } = await svc
        .from("listings")
        .insert({
          seller_id: seller.id,
          title: "messaging gate fixture",
          asking_price: 250,
          condition_id: cond.id,
          shipping_option: "local_pickup",
          status: "active",
        })
        .select("id")
        .single();
      if (error || !listing) {
        throw new Error(`fixture listing failed: ${error?.message}`);
      }
      listingId = listing.id;
    }, 60_000);

    afterAll(async () => {
      if (svc) {
        const userIds = [buyer?.id, seller?.id, third?.id].filter(Boolean);
        // FK order: reports → messages → threads → contact_log → blocks → listing.
        if (userIds.length) {
          await svc.from("reports").delete().in("reporter_id", userIds);
          await svc.from("user_blocks").delete().in("blocker_id", userIds);
        }
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

    // --- Gate 1: contact_log — buyer-write, participant-read, immutable --------

    it("buyer can INSERT a self-attributed contact_log row", async () => {
      const { data, error } = await buyer.client
        .from("contact_log")
        .insert({
          listing_id: listingId,
          buyer_id: buyer.id,
          seller_id: seller.id,
          buyer_name: "Throwaway Buyer",
          buyer_email: buyer.email,
          message_text: "Is this part still available?",
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      contactLogId = data!.id;
    });

    it("buyer CANNOT insert a contact_log row attributed to another buyer", async () => {
      const { error } = await buyer.client.from("contact_log").insert({
        listing_id: listingId,
        buyer_id: third.id, // impersonation attempt
        seller_id: seller.id,
        buyer_name: "Forged",
        buyer_email: "forged@example.com",
        message_text: "forged contact",
      });
      expect(isRlsDenial(error)).toBe(true);
    });

    it("buyer and seller can SELECT the contact row; third user and anon get 0 rows", async () => {
      const { data: buyerRows, error: buyerError } = await buyer.client
        .from("contact_log")
        .select("id")
        .eq("id", contactLogId);
      expect(buyerError).toBeNull();
      expect(buyerRows).toHaveLength(1);

      const { data: sellerRows, error: sellerError } = await seller.client
        .from("contact_log")
        .select("id")
        .eq("id", contactLogId);
      expect(sellerError).toBeNull();
      expect(sellerRows).toHaveLength(1);

      const { data: thirdRows, error: thirdError } = await third.client
        .from("contact_log")
        .select("id")
        .eq("id", contactLogId);
      expect(thirdError).toBeNull();
      expect(thirdRows ?? []).toHaveLength(0);

      const { data: anonRows, error: anonError } = await anonClient()
        .from("contact_log")
        .select("id")
        .eq("id", contactLogId);
      expect(anonError).toBeNull();
      expect(anonRows ?? []).toHaveLength(0);
    }, 20_000);

    it("contact_log UPDATE/DELETE affect 0 rows for every client (immutable, MSG-04)", async () => {
      for (const client of [buyer.client, seller.client, third.client]) {
        const { data: updated, error: updateError } = await client
          .from("contact_log")
          .update({ message_text: "tampered" })
          .eq("id", contactLogId)
          .select("id");
        expect(updateError).toBeNull();
        expect(updated ?? []).toHaveLength(0);

        const { data: deleted, error: deleteError } = await client
          .from("contact_log")
          .delete()
          .eq("id", contactLogId)
          .select("id");
        expect(deleteError).toBeNull();
        expect(deleted ?? []).toHaveLength(0);
      }

      // The row survived, unmodified.
      const { data: after } = await buyer.client
        .from("contact_log")
        .select("message_text")
        .eq("id", contactLogId)
        .single();
      expect(after?.message_text).toBe("Is this part still available?");
    }, 20_000);

    // --- Gate 2: message_threads — participant-only, buyer-only create ---------

    it("seller and third-party thread INSERTs are rejected; the buyer's succeeds", async () => {
      const threadRow = {
        listing_id: listingId,
        buyer_id: buyer.id,
        seller_id: seller.id,
        contact_log_id: contactLogId,
      };

      const { error: sellerInsert } = await seller.client
        .from("message_threads")
        .insert(threadRow);
      expect(isRlsDenial(sellerInsert)).toBe(true);

      const { error: thirdInsert } = await third.client
        .from("message_threads")
        .insert(threadRow);
      expect(isRlsDenial(thirdInsert)).toBe(true);

      const { data, error } = await buyer.client
        .from("message_threads")
        .insert(threadRow)
        .select("id")
        .single();
      expect(error).toBeNull();
      threadId = data!.id;
    }, 20_000);

    it("participants can SELECT the thread; third user and anon get 0 rows", async () => {
      for (const participant of [buyer, seller]) {
        const { data, error } = await participant.client
          .from("message_threads")
          .select("id")
          .eq("id", threadId);
        expect(error).toBeNull();
        expect(data).toHaveLength(1);
      }

      const { data: thirdRows, error: thirdError } = await third.client
        .from("message_threads")
        .select("id")
        .eq("id", threadId);
      expect(thirdError).toBeNull();
      expect(thirdRows ?? []).toHaveLength(0);

      const { data: anonRows, error: anonError } = await anonClient()
        .from("message_threads")
        .select("id")
        .eq("id", threadId);
      expect(anonError).toBeNull();
      expect(anonRows ?? []).toHaveLength(0);
    }, 20_000);

    it("participant can UPDATE watermark columns; third-user UPDATE affects 0 rows; no DELETE path", async () => {
      const readAt = new Date().toISOString();
      const { data: updated, error: updateError } = await buyer.client
        .from("message_threads")
        .update({ buyer_last_read_at: readAt })
        .eq("id", threadId)
        .select("id");
      expect(updateError).toBeNull();
      expect(updated).toHaveLength(1);

      const { data: thirdUpdated, error: thirdError } = await third.client
        .from("message_threads")
        .update({ seller_last_read_at: readAt })
        .eq("id", threadId)
        .select("id");
      expect(thirdError).toBeNull();
      expect(thirdUpdated ?? []).toHaveLength(0);

      // No DELETE policy exists — even a participant's delete affects 0 rows.
      const { data: deleted, error: deleteError } = await buyer.client
        .from("message_threads")
        .delete()
        .eq("id", threadId)
        .select("id");
      expect(deleteError).toBeNull();
      expect(deleted ?? []).toHaveLength(0);
    }, 20_000);

    // --- Gate 3: messages — append-only, sender-attributed, participant-only ---

    it("participant can INSERT a self-attributed message; sender spoofing is rejected", async () => {
      const { data, error } = await buyer.client
        .from("messages")
        .insert({
          thread_id: threadId,
          sender_id: buyer.id,
          body: "first message",
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      messageId = data!.id;

      const { error: spoofError } = await buyer.client.from("messages").insert({
        thread_id: threadId,
        sender_id: seller.id, // spoofed sender
        body: "spoofed sender",
      });
      expect(isRlsDenial(spoofError)).toBe(true);
    }, 20_000);

    it("non-participant INSERT is rejected; non-participant and anon SELECT return 0 rows", async () => {
      const { error: thirdInsert } = await third.client
        .from("messages")
        .insert({
          thread_id: threadId,
          sender_id: third.id, // self-attributed, but not a participant
          body: "intruder message",
        });
      expect(isRlsDenial(thirdInsert)).toBe(true);

      const { data: thirdRows, error: thirdError } = await third.client
        .from("messages")
        .select("id")
        .eq("thread_id", threadId);
      expect(thirdError).toBeNull();
      expect(thirdRows ?? []).toHaveLength(0);

      const { data: anonRows, error: anonError } = await anonClient()
        .from("messages")
        .select("id")
        .eq("thread_id", threadId);
      expect(anonError).toBeNull();
      expect(anonRows ?? []).toHaveLength(0);
    }, 20_000);

    it("UPDATE/DELETE on a message affect 0 rows for EVERY client incl. the sender (append-only)", async () => {
      for (const client of [
        buyer.client, // the sender
        seller.client,
        third.client,
        anonClient(),
      ]) {
        const { data: updated, error: updateError } = await client
          .from("messages")
          .update({ body: "edited!" })
          .eq("id", messageId)
          .select("id");
        expect(updateError).toBeNull();
        expect(updated ?? []).toHaveLength(0);

        const { data: deleted, error: deleteError } = await client
          .from("messages")
          .delete()
          .eq("id", messageId)
          .select("id");
        expect(deleteError).toBeNull();
        expect(deleted ?? []).toHaveLength(0);
      }

      const { data: after } = await buyer.client
        .from("messages")
        .select("body")
        .eq("id", messageId)
        .single();
      expect(after?.body).toBe("first message");
    }, 30_000);

    // --- Gate 4: blocks gate SENDING, never reading; unblock restores ----------

    it("blocker_id self-attribution is enforced", async () => {
      const { error } = await buyer.client.from("user_blocks").insert({
        blocker_id: seller.id, // forging a block on someone else's behalf
        blocked_id: buyer.id,
      });
      expect(isRlsDenial(error)).toBe(true);
    });

    it("a blocked user's message INSERT is rejected; history stays readable; unblock restores", async () => {
      // Seller blocks the buyer.
      const { error: blockError } = await seller.client
        .from("user_blocks")
        .insert({ blocker_id: seller.id, blocked_id: buyer.id });
      expect(blockError).toBeNull();

      // The buyer can no longer send into the shared thread.
      const { error: blockedSend } = await buyer.client
        .from("messages")
        .insert({
          thread_id: threadId,
          sender_id: buyer.id,
          body: "should be blocked",
        });
      expect(isRlsDenial(blockedSend)).toBe(true);

      // Both parties can still READ the existing history (blocks never gate reads).
      for (const participant of [buyer, seller]) {
        const { data, error } = await participant.client
          .from("messages")
          .select("id")
          .eq("thread_id", threadId);
        expect(error).toBeNull();
        expect((data ?? []).length).toBeGreaterThanOrEqual(1);
      }

      // Seller unblocks → the buyer can send again.
      const { error: unblockError } = await seller.client
        .from("user_blocks")
        .delete()
        .eq("blocker_id", seller.id)
        .eq("blocked_id", buyer.id);
      expect(unblockError).toBeNull();

      const { error: resumedSend } = await buyer.client
        .from("messages")
        .insert({
          thread_id: threadId,
          sender_id: buyer.id,
          body: "after unblock",
        });
      expect(resumedSend).toBeNull();
    }, 30_000);

    // --- Gate 5: reports — exclusive arc, dedupe, participant-scoped -----------

    it("reporter can insert one report per target; the duplicate violates 23505", async () => {
      const { error: firstError } = await buyer.client.from("reports").insert({
        reporter_id: buyer.id,
        listing_id: listingId,
        reason: "spam",
      });
      expect(firstError).toBeNull();

      const { error: dupError } = await buyer.client.from("reports").insert({
        reporter_id: buyer.id,
        listing_id: listingId,
        reason: "spam",
      });
      expect(dupError?.code).toBe("23505");
    }, 20_000);

    it("the exclusive arc rejects a report carrying two target columns", async () => {
      const { error } = await buyer.client.from("reports").insert({
        reporter_id: buyer.id,
        listing_id: listingId,
        message_id: messageId, // two targets → num_nonnulls check violation
        reason: "other",
      });
      expect(error?.code).toBe("23514");
    });

    it("a non-participant cannot report a message in a private thread; a participant can", async () => {
      const { error: thirdReport } = await third.client.from("reports").insert({
        reporter_id: third.id,
        message_id: messageId, // third never saw this thread
        reason: "harassment",
      });
      expect(isRlsDenial(thirdReport)).toBe(true);

      const { error: sellerReport } = await seller.client
        .from("reports")
        .insert({
          reporter_id: seller.id,
          message_id: messageId,
          reason: "harassment",
        });
      expect(sellerReport).toBeNull();
    }, 20_000);

    it("anon cannot insert a report; the reporter cannot UPDATE/DELETE their own report", async () => {
      const { error: anonError } = await anonClient().from("reports").insert({
        reporter_id: buyer.id,
        listing_id: listingId,
        reason: "spam",
      });
      expect(anonError).not.toBeNull();

      const { data: updated, error: updateError } = await buyer.client
        .from("reports")
        .update({ reason: "other" })
        .eq("reporter_id", buyer.id)
        .eq("listing_id", listingId)
        .select("id");
      expect(updateError).toBeNull();
      expect(updated ?? []).toHaveLength(0);

      const { data: deleted, error: deleteError } = await buyer.client
        .from("reports")
        .delete()
        .eq("reporter_id", buyer.id)
        .eq("listing_id", listingId)
        .select("id");
      expect(deleteError).toBeNull();
      expect(deleted ?? []).toHaveLength(0);
    }, 20_000);

    // --- Gate 6: realtime publication (Pitfall 1 regression guard) -------------

    it("messages is in the supabase_realtime publication; the helper is service-role-only", async () => {
      // 0017 definer helper — the only supabase-js-reachable view of pg_catalog.
      const { data, error } = await svc.rpc("messages_realtime_published");
      expect(error).toBeNull();
      expect(data).toBe(true);

      // Hygiene: anon (and by extension authenticated) cannot execute it.
      const { error: anonError } = await anonClient().rpc(
        "messages_realtime_published",
      );
      expect(anonError).not.toBeNull();
    });
  },
);
