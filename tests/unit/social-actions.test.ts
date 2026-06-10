import { describe, expect, it, vi, beforeEach } from "vitest";

// Unit-test the COMMENT TRUST BOUNDARY's guard ORDER without a live DB (clone of
// listing-actions.test.ts): unauthenticated short-circuit, schema gate, rate
// limit, sold-listing pre-check, self-attributed insert, RLS-decided delete with
// no existence leak, and the owner-scoped seen-watermark. The RLS behavior
// itself is covered by 08-01's live integration tests.

const getClaims = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

// --- Configurable chainable .from() builder -------------------------------
// Each test wires per-table results; every builder records its table, the ops
// invoked (select/insert/delete/update), and every .eq() so guard-order and
// owner-scoping assertions can inspect the chain.

type BuilderRecord = {
  table: string;
  op: "select" | "insert" | "delete" | "update";
  eqs: [string, unknown][];
  insertedRow: unknown;
};

let builders: BuilderRecord[] = [];

// Per-test result knobs.
let rateLimitCount = 0;
let listingRow: Record<string, unknown> | null = null;
let insertResult: { data: unknown; error: unknown } = {
  data: { id: 1 },
  error: null,
};
let deleteResult: { data: unknown[]; error: unknown } = {
  data: [],
  error: null,
};
let updateResult: { data: unknown[]; error: unknown } = {
  data: [],
  error: null,
};

const insertSpy = vi.fn();
const fromSpy = vi.fn();

function makeFrom(table: string) {
  const rec: BuilderRecord = {
    table,
    op: "select",
    eqs: [],
    insertedRow: null,
  };
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
    rec.insertedRow = row;
    insertSpy(table, row);
    return b;
  });
  b.delete = vi.fn(() => {
    rec.op = "delete";
    return b;
  });
  b.update = vi.fn(() => {
    rec.op = "update";
    return b;
  });
  b.maybeSingle = vi.fn(async () => ({ data: listingRow, error: null }));
  b.single = vi.fn(async () => insertResult);
  // Awaited-chain terminal: the head-count rate-limit read, the delete chain,
  // and the update chain are all awaited directly (thenable).
  b.then = (resolve: (v: unknown) => unknown) => {
    if (rec.op === "delete") return resolve(deleteResult);
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
  addComment,
  deleteComment,
  markCommentsSeen,
} from "@/lib/actions/comments";

const UID = "11111111-1111-1111-1111-111111111111";

const FUTURE = new Date(Date.now() + 30 * 864e5).toISOString();

function validCommentInput(overrides: Record<string, unknown> = {}) {
  return { listingId: 10, body: "Is this hood still available?", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  builders = [];
  getClaims.mockResolvedValue({ data: { claims: { sub: UID } } });
  rateLimitCount = 0;
  listingRow = { id: 10, status: "active", expires_at: FUTURE };
  insertResult = { data: { id: 42 }, error: null };
  deleteResult = { data: [], error: null };
  updateResult = { data: [], error: null };
});

describe("addComment — guard ORDER", () => {
  it("1) unauthenticated -> short-circuits before ANY query", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const res = await addComment(validCommentInput());

    expect(res).toEqual({ ok: false, error: "unauthenticated" });
    expect(fromSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("2) invalid body -> invalid before ANY query (schema gate)", async () => {
    const res = await addComment(validCommentInput({ body: "   " }));

    expect(res).toEqual({ ok: false, error: "invalid" });
    expect(fromSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("3) rate-limit count at the cap -> rate_limited, never inserts", async () => {
    rateLimitCount = 5;

    const res = await addComment(validCommentInput());

    expect(res).toEqual({ ok: false, error: "rate_limited" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("4) sold listing pre-check -> comments_closed, never inserts", async () => {
    listingRow = { id: 10, status: "sold", expires_at: FUTURE };

    const res = await addComment(validCommentInput());

    expect(res).toEqual({ ok: false, error: "comments_closed" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("4b) expired listing pre-check -> comments_closed, never inserts", async () => {
    listingRow = {
      id: 10,
      status: "active",
      expires_at: new Date(Date.now() - 864e5).toISOString(),
    };

    const res = await addComment(validCommentInput());

    expect(res).toEqual({ ok: false, error: "comments_closed" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("4c) missing listing -> not_found, never inserts", async () => {
    listingRow = null;

    const res = await addComment(validCommentInput());

    expect(res).toEqual({ ok: false, error: "not_found" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("5) happy path -> SELF-ATTRIBUTED insert + revalidate", async () => {
    const res = await addComment(validCommentInput({ parentId: "3" }));

    expect(res).toEqual({ ok: true, id: 42 });
    expect(insertSpy).toHaveBeenCalledOnce();
    const [table, row] = insertSpy.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(table).toBe("listing_comments");
    // Self-attribution: author_id is the verified caller, never client input.
    expect(row.author_id).toBe(UID);
    expect(row.listing_id).toBe(10);
    expect(row.parent_id).toBe(3); // coerced reply handle
    expect(revalidatePath).toHaveBeenCalledWith("/listings/10");
  });
});

describe("deleteComment — RLS decides, no existence leak", () => {
  it("unauthenticated -> short-circuits before ANY query", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const res = await deleteComment(5);

    expect(res).toEqual({ ok: false, error: "unauthenticated" });
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("zero rows affected (not authorized OR nonexistent) -> not_found", async () => {
    deleteResult = { data: [], error: null };

    const res = await deleteComment(5);

    expect(res).toEqual({ ok: false, error: "not_found" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("success -> revalidates the listing path from the returned row", async () => {
    deleteResult = { data: [{ id: 5, listing_id: 7 }], error: null };

    const res = await deleteComment(5);

    expect(res).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith("/listings/7");
  });
});

describe("markCommentsSeen — owner-scoped watermark", () => {
  it("the update chain is owner-scoped via eq('seller_id', uid)", async () => {
    updateResult = { data: [{ id: 10 }], error: null };

    const res = await markCommentsSeen(10);

    expect(res).toEqual({ ok: true });
    const update = builders.find(
      (b) => b.table === "listings" && b.op === "update",
    );
    expect(update).toBeDefined();
    expect(update!.eqs).toContainEqual(["seller_id", UID]);
    expect(update!.eqs).toContainEqual(["id", 10]);
  });

  it("zero rows affected (not the caller's listing) -> not_found", async () => {
    updateResult = { data: [], error: null };

    const res = await markCommentsSeen(10);

    expect(res).toEqual({ ok: false, error: "not_found" });
  });

  it("unauthenticated -> short-circuits before ANY query", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const res = await markCommentsSeen(10);

    expect(res).toEqual({ ok: false, error: "unauthenticated" });
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
