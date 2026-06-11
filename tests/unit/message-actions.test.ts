import { describe, expect, it, vi, beforeEach } from "vitest";

// Unit-test the CHAT ACTIONS' guard order without a live DB (clone of
// contact-actions.test.ts): sendMessage's unauthenticated/schema/rate-limit
// gates and the RLS-rejection collapse (blocked and invalid are
// indistinguishable — no block-state leak), plus the role-scoped watermark
// rule: markThreadRead/hideThread touch ONLY the caller's own side column.
// The RLS block enforcement itself is policy-level (0016) — integration scope.

const getClaims = vi.fn();
const revalidatePath = vi.fn();
const sendNewMessageEmailMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

vi.mock("@/lib/messaging/notify", () => ({
  sendNewMessageEmail: async (...a: unknown[]) => sendNewMessageEmailMock(...a),
}));

// --- Configurable chainable .from() builder -------------------------------

type BuilderRecord = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  eqs: [string, unknown][];
  payload: unknown;
};

let builders: BuilderRecord[] = [];

// Per-test knobs.
let rateLimitCount = 0;
let threadRow: Record<string, unknown> | null = null;
let listingRow: Record<string, unknown> | null = null;
let senderProfile: Record<string, unknown> | null = null;
let messageInsertResult: { data: unknown; error: unknown } = {
  data: null,
  error: null,
};
let updateResult: { data: unknown[]; error: unknown } = {
  data: [{ id: 1 }],
  error: null,
};
let blockWriteError: unknown = null;

const insertSpy = vi.fn();
const fromSpy = vi.fn();

function makeFrom(table: string) {
  const rec: BuilderRecord = { table, op: "select", eqs: [], payload: null };
  builders.push(rec);

  let headCount = false;
  const b: Record<string, unknown> = {};
  const ret = () => b;

  b.select = vi.fn((_cols: string, opts?: { head?: boolean }) => {
    if (opts?.head) headCount = true;
    return b;
  });
  b.eq = vi.fn((col: string, val: unknown) => {
    rec.eqs.push([col, val]);
    return b;
  });
  b.gte = vi.fn(ret);
  b.insert = vi.fn((row: unknown) => {
    rec.op = "insert";
    rec.payload = row;
    insertSpy(table, row);
    return b;
  });
  b.update = vi.fn((row: unknown) => {
    rec.op = "update";
    rec.payload = row;
    return b;
  });
  b.delete = vi.fn(() => {
    rec.op = "delete";
    return b;
  });
  b.maybeSingle = vi.fn(async () => {
    if (table === "message_threads") return { data: threadRow, error: null };
    if (table === "listings") return { data: listingRow, error: null };
    if (table === "profiles_public")
      return { data: senderProfile, error: null };
    return { data: null, error: null };
  });
  b.single = vi.fn(async () => messageInsertResult);
  // Awaited-chain terminal: head-count, thread update, block insert/delete.
  b.then = (resolve: (v: unknown) => unknown) => {
    if (rec.op === "insert" || rec.op === "delete")
      return resolve({ error: blockWriteError });
    if (rec.op === "update") return resolve(updateResult);
    if (headCount) return resolve({ count: rateLimitCount, error: null });
    return resolve({ data: [], error: null });
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: () => getClaims() },
    from: (table: string) => {
      fromSpy(table);
      return makeFrom(table);
    },
  }),
}));

import {
  sendMessage,
  markThreadRead,
  hideThread,
  blockUser,
  unblockUser,
} from "@/lib/actions/messages";

const BUYER = "11111111-1111-1111-1111-111111111111";
const SELLER = "22222222-2222-2222-2222-222222222222";

const INSERTED_ROW = {
  id: 900,
  thread_id: 55,
  sender_id: BUYER,
  body: "Still available?",
  created_at: "2026-06-11T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  builders = [];
  getClaims.mockResolvedValue({ data: { claims: { sub: BUYER } } });
  sendNewMessageEmailMock.mockResolvedValue(undefined);
  rateLimitCount = 0;
  threadRow = { id: 55, listing_id: 10, buyer_id: BUYER, seller_id: SELLER };
  listingRow = { title: "Hood" };
  senderProfile = { username: "buyer_handle", display_name: null };
  messageInsertResult = { data: INSERTED_ROW, error: null };
  updateResult = { data: [{ id: 55 }], error: null };
  blockWriteError = null;
});

describe("sendMessage — guard ORDER", () => {
  it("1) unauthenticated -> short-circuits before ANY query", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const res = await sendMessage({ threadId: 55, body: "hi" });

    expect(res).toEqual({ ok: false, error: "unauthenticated" });
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("2) invalid body -> invalid before ANY query (schema gate)", async () => {
    const res = await sendMessage({ threadId: 55, body: "   " });

    expect(res).toEqual({ ok: false, error: "invalid" });
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("3) over the burst limit -> rate_limited, never inserts", async () => {
    rateLimitCount = 21;

    const res = await sendMessage({ threadId: 55, body: "hi" });

    expect(res).toEqual({ ok: false, error: "rate_limited" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("3b) exactly AT the limit (20) still sends — the limit is '>'", async () => {
    rateLimitCount = 20;

    const res = await sendMessage({ threadId: 55, body: "hi" });

    expect(res).toEqual({ ok: true, message: INSERTED_ROW });
  });

  it("4) RLS rejection (blocked OR non-participant) collapses to blocked_or_invalid", async () => {
    messageInsertResult = { data: null, error: { message: "policy" } };

    const res = await sendMessage({ threadId: 55, body: "hi" });

    expect(res).toEqual({ ok: false, error: "blocked_or_invalid" });
    // Nothing downstream: no activity bump, no email, no revalidate.
    expect(builders.some((b) => b.op === "update")).toBe(false);
    expect(sendNewMessageEmailMock).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("5) happy path: self-attributed insert, activity bump, email to the OTHER side", async () => {
    const res = await sendMessage({ threadId: 55, body: "Still available?" });

    expect(res).toEqual({ ok: true, message: INSERTED_ROW });

    const insert = builders.find(
      (b) => b.table === "messages" && b.op === "insert",
    )!;
    const row = insert.payload as Record<string, unknown>;
    expect(row.sender_id).toBe(BUYER); // verified caller, never client input
    expect(Object.keys(row).sort()).toEqual(["body", "sender_id", "thread_id"]);

    const bump = builders.find(
      (b) => b.table === "message_threads" && b.op === "update",
    )!;
    expect(Object.keys(bump.payload as object)).toEqual(["last_message_at"]);

    // Buyer sent -> seller receives the (throttled) email.
    expect(sendNewMessageEmailMock).toHaveBeenCalledOnce();
    const emailArg = sendNewMessageEmailMock.mock.calls[0][0] as {
      recipientId: string;
      snippet: string;
    };
    expect(emailArg.recipientId).toBe(SELLER);
    expect(revalidatePath).toHaveBeenCalledWith("/messages/55");
    expect(revalidatePath).toHaveBeenCalledWith("/messages");
  });
});

describe("markThreadRead / hideThread — viewer-side column ONLY", () => {
  it("buyer marks read -> updates buyer_last_read_at only, owner-scoped", async () => {
    const res = await markThreadRead(55);

    expect(res).toEqual({ ok: true });
    const update = builders.find(
      (b) => b.table === "message_threads" && b.op === "update",
    )!;
    expect(Object.keys(update.payload as object)).toEqual([
      "buyer_last_read_at",
    ]);
    expect(update.eqs).toContainEqual(["id", 55]);
    expect(update.eqs).toContainEqual(["buyer_id", BUYER]);
  });

  it("seller marks read -> updates seller_last_read_at only", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: SELLER } } });

    const res = await markThreadRead(55);

    expect(res).toEqual({ ok: true });
    const update = builders.find(
      (b) => b.table === "message_threads" && b.op === "update",
    )!;
    expect(Object.keys(update.payload as object)).toEqual([
      "seller_last_read_at",
    ]);
    expect(update.eqs).toContainEqual(["seller_id", SELLER]);
  });

  it("hideThread flips ONLY the viewer-side hidden flag (hide != delete)", async () => {
    const res = await hideThread(55);

    expect(res).toEqual({ ok: true });
    const update = builders.find(
      (b) => b.table === "message_threads" && b.op === "update",
    )!;
    expect(Object.keys(update.payload as object)).toEqual(["buyer_hidden_at"]);
  });

  it("non-participant (RLS zero rows) -> not_found, no update", async () => {
    threadRow = null;

    const res = await markThreadRead(55);

    expect(res).toEqual({ ok: false, error: "not_found" });
    expect(builders.some((b) => b.op === "update")).toBe(false);
  });

  it("unauthenticated -> short-circuits before ANY query", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const res = await hideThread(55);

    expect(res).toEqual({ ok: false, error: "unauthenticated" });
    expect(fromSpy).not.toHaveBeenCalled();
  });
});

describe("blockUser / unblockUser — owner-RLS, idempotent", () => {
  it("happy path: self-attributed insert on user_blocks", async () => {
    const res = await blockUser(SELLER);

    expect(res).toEqual({ ok: true });
    const [table, row] = insertSpy.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(table).toBe("user_blocks");
    expect(row.blocker_id).toBe(BUYER);
    expect(row.blocked_id).toBe(SELLER);
  });

  it("re-blocking (unique violation) is idempotent success", async () => {
    blockWriteError = { code: "23505" };

    const res = await blockUser(SELLER);

    expect(res).toEqual({ ok: true });
  });

  it("blocking yourself -> invalid, never inserts", async () => {
    const res = await blockUser(BUYER);

    expect(res).toEqual({ ok: false, error: "invalid" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("non-UUID handle -> invalid, never inserts", async () => {
    const res = await blockUser("1; drop table users");

    expect(res).toEqual({ ok: false, error: "invalid" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("unblock: owner-scoped delete on the pair", async () => {
    const res = await unblockUser(SELLER);

    expect(res).toEqual({ ok: true });
    const del = builders.find(
      (b) => b.table === "user_blocks" && b.op === "delete",
    )!;
    expect(del.eqs).toContainEqual(["blocker_id", BUYER]);
    expect(del.eqs).toContainEqual(["blocked_id", SELLER]);
  });
});
