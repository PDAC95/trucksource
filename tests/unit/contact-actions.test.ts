import { describe, expect, it, vi, beforeEach } from "vitest";

// Unit-test the CONTACT → CHAT spine's guard ORDER without a live DB (clone of
// social-actions.test.ts): the invariant-#5 proof lives here — contact_log
// insert BEFORE the admin copy BEFORE the thread insert BEFORE the first
// message; a contact_log failure short-circuits everything downstream; an
// existing thread dedupes with ZERO inserts. RLS behavior itself is covered by
// the live integration suite.

const getClaims = vi.fn();
const revalidatePath = vi.fn();
const getExistingThreadIdMock = vi.fn();
const sendAdminContactCopyMock = vi.fn();
const sendNewMessageEmailMock = vi.fn();

// Global event log — the ORDER assertions read this.
let callOrder: string[] = [];

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

vi.mock("@/lib/messaging/queries", () => ({
  getExistingThreadId: (...a: unknown[]) => getExistingThreadIdMock(...a),
}));

vi.mock("@/lib/messaging/notify", () => ({
  sendAdminContactCopy: async (...a: unknown[]) => {
    callOrder.push("adminCopy");
    return sendAdminContactCopyMock(...a);
  },
  sendNewMessageEmail: async (...a: unknown[]) => {
    callOrder.push("sellerEmail");
    return sendNewMessageEmailMock(...a);
  },
}));

// --- Configurable chainable .from() builder -------------------------------
// Per-test knobs per table; every insert is logged to callOrder + insertSpy so
// guard-order assertions can inspect the sequence.

let rateLimitCount = 0;
let listingRow: Record<string, unknown> | null = null;
let profilesData: Record<string, unknown>[] = [];
let contactInsertResult: { data: unknown; error: unknown } = {
  data: { id: 100, created_at: "2026-06-11T00:00:00Z" },
  error: null,
};
let threadInsertResult: { data: unknown; error: unknown } = {
  data: { id: 55 },
  error: null,
};
let messageInsertResult: { error: unknown } = { error: null };

const insertSpy = vi.fn();
const fromSpy = vi.fn();

function makeFrom(table: string) {
  let op: "select" | "insert" = "select";
  let headCount = false;
  const b: Record<string, unknown> = {};
  const ret = () => b;

  b.select = vi.fn((_cols: string, opts?: { head?: boolean }) => {
    if (opts?.head) headCount = true;
    return b;
  });
  b.eq = vi.fn(ret);
  b.gte = vi.fn(ret);
  b.in = vi.fn(ret);
  b.insert = vi.fn((row: unknown) => {
    op = "insert";
    callOrder.push(`insert:${table}`);
    insertSpy(table, row);
    return b;
  });
  b.maybeSingle = vi.fn(async () => ({ data: listingRow, error: null }));
  b.single = vi.fn(async () => {
    if (table === "contact_log") return contactInsertResult;
    if (table === "message_threads") return threadInsertResult;
    return { data: null, error: { message: "unexpected single()" } };
  });
  // Awaited-chain terminal: head-count rate limit, profiles_public list read,
  // and the messages insert are awaited directly (thenable).
  b.then = (resolve: (v: unknown) => unknown) => {
    if (op === "insert") return resolve(messageInsertResult);
    if (headCount) return resolve({ count: rateLimitCount, error: null });
    return resolve({ data: profilesData, error: null });
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

import { submitContact } from "@/lib/actions/contact";

const BUYER = "11111111-1111-1111-1111-111111111111";
const SELLER = "22222222-2222-2222-2222-222222222222";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    listingId: 10,
    name: "Pat Driver",
    email: "pat@example.com",
    phone: "",
    message: "Is this hood still available?",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  callOrder = [];
  getClaims.mockResolvedValue({ data: { claims: { sub: BUYER } } });
  getExistingThreadIdMock.mockResolvedValue(null);
  sendAdminContactCopyMock.mockResolvedValue(true);
  sendNewMessageEmailMock.mockResolvedValue(undefined);
  rateLimitCount = 0;
  listingRow = { id: 10, status: "active", seller_id: SELLER, title: "Hood" };
  profilesData = [
    { id: BUYER, username: "buyer_handle", display_name: null },
    { id: SELLER, username: "seller_handle", display_name: "Big Rig Sales" },
  ];
  contactInsertResult = {
    data: { id: 100, created_at: "2026-06-11T00:00:00Z" },
    error: null,
  };
  threadInsertResult = { data: { id: 55 }, error: null };
  messageInsertResult = { error: null };
});

describe("submitContact — invariant #5 ORDER", () => {
  it("happy path: contact_log insert BEFORE admin copy BEFORE thread BEFORE message", async () => {
    const res = await submitContact(validInput());

    expect(res).toEqual({ ok: true, threadId: 55 });
    // THE invariant-#5 proof: the exact event order.
    expect(callOrder).toEqual([
      "insert:contact_log",
      "adminCopy",
      "insert:message_threads",
      "insert:messages",
      "sellerEmail",
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/messages");
  });

  it("happy path: contact_log row carries the form PII; messages row carries NONE", async () => {
    await submitContact(validInput({ phone: "555-0100" }));

    const contactCall = insertSpy.mock.calls.find(
      ([t]) => t === "contact_log",
    )!;
    const contactRow = contactCall[1] as Record<string, unknown>;
    expect(contactRow.buyer_id).toBe(BUYER); // self-attributed
    expect(contactRow.seller_id).toBe(SELLER);
    expect(contactRow.buyer_name).toBe("Pat Driver");
    expect(contactRow.buyer_email).toBe("pat@example.com");
    expect(contactRow.buyer_phone).toBe("555-0100");

    const messageCall = insertSpy.mock.calls.find(([t]) => t === "messages")!;
    const messageRow = messageCall[1] as Record<string, unknown>;
    // Zero PII on the realtime-published table (MSG-06).
    expect(Object.keys(messageRow).sort()).toEqual([
      "body",
      "sender_id",
      "thread_id",
    ]);
    expect(messageRow.sender_id).toBe(BUYER);
    expect(messageRow.thread_id).toBe(55);
  });

  it("contact_log insert failure -> NO thread, NO message, returns invalid", async () => {
    contactInsertResult = { data: null, error: { message: "boom" } };

    const res = await submitContact(validInput());

    expect(res).toEqual({ ok: false, error: "invalid" });
    const tables = insertSpy.mock.calls.map(([t]) => t);
    expect(tables).toEqual(["contact_log"]); // nothing after the failure
    expect(sendAdminContactCopyMock).not.toHaveBeenCalled();
    expect(sendNewMessageEmailMock).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("existing thread -> short-circuits with the existing id and ZERO inserts", async () => {
    getExistingThreadIdMock.mockResolvedValue(7);

    const res = await submitContact(validInput());

    expect(res).toEqual({ ok: true, threadId: 7, existing: true });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(sendAdminContactCopyMock).not.toHaveBeenCalled();
  });

  it("raced duplicate thread insert -> re-reads the winner, skips the message", async () => {
    threadInsertResult = { data: null, error: { code: "23505" } };
    // Step 5 sees no thread; the step-8 re-read finds the raced winner.
    getExistingThreadIdMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(9);

    const res = await submitContact(validInput());

    expect(res).toEqual({ ok: true, threadId: 9 });
    const tables = insertSpy.mock.calls.map(([t]) => t);
    expect(tables).toEqual(["contact_log", "message_threads"]); // no messages row
  });
});

describe("submitContact — guard branches", () => {
  it("1) unauthenticated -> short-circuits before ANY DB call", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const res = await submitContact(validInput());

    expect(res).toEqual({ ok: false, error: "unauthenticated" });
    expect(fromSpy).not.toHaveBeenCalled();
    expect(getExistingThreadIdMock).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("2) invalid body -> invalid before ANY DB call (schema gate)", async () => {
    const res = await submitContact(validInput({ email: "not-an-email" }));

    expect(res).toEqual({ ok: false, error: "invalid" });
    expect(fromSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("3) daily contact limit reached -> rate_limited, never inserts", async () => {
    rateLimitCount = 10;

    const res = await submitContact(validInput());

    expect(res).toEqual({ ok: false, error: "rate_limited" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("4) missing listing -> not_found, never inserts", async () => {
    listingRow = null;

    const res = await submitContact(validInput());

    expect(res).toEqual({ ok: false, error: "not_found" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("4b) sold listing -> contacts_closed, never inserts", async () => {
    listingRow = { id: 10, status: "sold", seller_id: SELLER, title: "Hood" };

    const res = await submitContact(validInput());

    expect(res).toEqual({ ok: false, error: "contacts_closed" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("4c) contacting your OWN listing -> invalid, never inserts", async () => {
    listingRow = { id: 10, status: "active", seller_id: BUYER, title: "Hood" };

    const res = await submitContact(validInput());

    expect(res).toEqual({ ok: false, error: "invalid" });
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
