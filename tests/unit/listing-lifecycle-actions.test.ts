import { describe, expect, it, vi, beforeEach } from "vitest";

// Unit-test the LIFECYCLE actions' guard order + invariants WITHOUT a live DB
// (mirrors tests/unit/listing-actions.test.ts). We prove:
//   - renewListing: unauthenticated short-circuits (no update); a renew updates
//     expires_at and is scoped to status='active'; zero rows -> not_found.
//   - reactivateListing: scoped to status='expired', sets status:'active'.
//   - "editing never renews": updateListing's update payload omits expires_at.
// The live RLS/owner behavior is covered by the integration suite; here we assert
// the chain shape (which .eq filters fire) + the update payload keys.

const getClaims = vi.fn();

// Records, per from() call, the update payload and the chain of .eq(col,val) filters,
// and lets each test set what the terminal .select() resolves to (the affected rows).
type EqCall = [string, unknown];
const updateCalls: Record<string, unknown>[] = [];
const eqCalls: EqCall[] = [];
let selectResult: { data: unknown[] | null; error: unknown } = {
  data: [{ id: 1, expires_at: "2026-09-07T00:00:00.000Z" }],
  error: null,
};

// Chainable .from() builder: .update() records the payload; .eq() records each
// filter and returns the chain; .select() is the awaitable terminal. .maybeSingle()
// resolves a benign combo row so updateListing's combo re-check passes.
function makeFrom() {
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.update = vi.fn((payload: Record<string, unknown>) => {
    updateCalls.push(payload);
    return chain;
  });
  chain.eq = vi.fn((col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return chain;
  });
  // .select() stays chainable so the 10-05 ADMO-05 reads
  // (.select().eq()… / .select().in().eq()) keep composing; awaiting the
  // chain (PostgREST builders are thenable) resolves selectResult.
  chain.select = vi.fn(ret);
  chain.in = vi.fn(ret);
  chain.delete = vi.fn(ret);
  chain.insert = vi.fn(ret);
  chain.maybeSingle = vi.fn(async () => ({
    data: { model_id: 1 },
    error: null,
  }));
  chain.single = vi.fn(async () => ({ data: { id: 1 }, error: null }));
  chain.order = vi.fn(ret);
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(selectResult).then(resolve);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: () => getClaims() },
    from: () => makeFrom(),
  }),
}));

// markSold/markAvailable revalidate the listing/saved/sell paths after the flip;
// outside a Next request context revalidatePath would throw, so stub it.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  renewListing,
  reactivateListing,
  updateListing,
  markSold,
  markAvailable,
} from "@/lib/actions/listings";

const UID = "11111111-1111-1111-1111-111111111111";

function eqHas(col: string, val: unknown): boolean {
  return eqCalls.some(([c, v]) => c === col && v === val);
}

beforeEach(() => {
  vi.clearAllMocks();
  updateCalls.length = 0;
  eqCalls.length = 0;
  selectResult = {
    data: [{ id: 1, expires_at: "2026-09-07T00:00:00.000Z" }],
    error: null,
  };
  getClaims.mockResolvedValue({ data: { claims: { sub: UID } } });
});

describe("renewListing — active-only, owner-scoped", () => {
  it("unauthenticated -> error, never updates", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const res = await renewListing(1);

    expect(res).toEqual({ ok: false, error: "unauthenticated" });
    expect(updateCalls).toHaveLength(0);
  });

  it("renews: updates expires_at, scoped to seller_id + status='active'", async () => {
    const res = await renewListing(1);

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.expiresAt).toBe("2026-09-07T00:00:00.000Z");
    // exactly one update, carrying expires_at (and NOT status — active stays active)
    expect(updateCalls).toHaveLength(1);
    expect(Object.keys(updateCalls[0])).toEqual(["expires_at"]);
    // owner + active scoping
    expect(eqHas("seller_id", UID)).toBe(true);
    expect(eqHas("status", "active")).toBe(true);
    expect(eqHas("status", "expired")).toBe(false);
  });

  it("zero rows affected -> not_found", async () => {
    selectResult = { data: [], error: null };

    const res = await renewListing(1);

    expect(res).toEqual({ ok: false, error: "not_found" });
  });

  it("invalid id -> invalid, never updates", async () => {
    const res = await renewListing(0);

    expect(res).toEqual({ ok: false, error: "invalid" });
    expect(updateCalls).toHaveLength(0);
  });
});

describe("reactivateListing — expired-only, flips to active", () => {
  it("reactivates: sets status:'active' + expires_at, scoped to status='expired'", async () => {
    const res = await reactivateListing(1);

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.expiresAt).toBe("2026-09-07T00:00:00.000Z");
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ status: "active" });
    expect(updateCalls[0]).toHaveProperty("expires_at");
    expect(eqHas("seller_id", UID)).toBe(true);
    expect(eqHas("status", "expired")).toBe(true);
    expect(eqHas("status", "active")).toBe(false);
  });

  it("zero rows affected -> not_found", async () => {
    selectResult = { data: [], error: null };

    const res = await reactivateListing(1);

    expect(res).toEqual({ ok: false, error: "not_found" });
  });
});

describe("markSold — active-only, owner-scoped, never touches expires_at", () => {
  it("unauthenticated -> error, never updates", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const res = await markSold(1);

    expect(res).toEqual({ ok: false, error: "unauthenticated" });
    expect(updateCalls).toHaveLength(0);
  });

  it("invalid id -> invalid, never updates", async () => {
    const res = await markSold(-3);

    expect(res).toEqual({ ok: false, error: "invalid" });
    expect(updateCalls).toHaveLength(0);
  });

  it("zero rows affected -> not_found (not mine / nonexistent / not active)", async () => {
    selectResult = { data: [], error: null };

    const res = await markSold(1);

    expect(res).toEqual({ ok: false, error: "not_found" });
  });

  it("flips active->sold: payload is exactly {status:'sold'}, scoped to status='active'", async () => {
    const res = await markSold(1);

    expect(res).toEqual({ ok: true });
    // exactly one update, carrying ONLY status — the 90-day clock must not move
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toEqual({ status: "sold" });
    expect(Object.keys(updateCalls[0])).toEqual(["status"]);
    expect(updateCalls[0]).not.toHaveProperty("expires_at");
    // owner + ACTIVE-only scoping (a sold/expired row never re-sells here)
    expect(eqHas("seller_id", UID)).toBe(true);
    expect(eqHas("status", "active")).toBe(true);
    expect(eqHas("status", "sold")).toBe(false);
  });
});

describe("markAvailable — sold-only, flips back to active, never touches expires_at", () => {
  it("unauthenticated -> error, never updates", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const res = await markAvailable(1);

    expect(res).toEqual({ ok: false, error: "unauthenticated" });
    expect(updateCalls).toHaveLength(0);
  });

  it("invalid id -> invalid, never updates", async () => {
    const res = await markAvailable(0);

    expect(res).toEqual({ ok: false, error: "invalid" });
    expect(updateCalls).toHaveLength(0);
  });

  it("zero rows affected -> not_found", async () => {
    selectResult = { data: [], error: null };

    const res = await markAvailable(1);

    expect(res).toEqual({ ok: false, error: "not_found" });
  });

  it("flips sold->active: payload is exactly {status:'active'}, scoped to status='sold'", async () => {
    const res = await markAvailable(1);

    expect(res).toEqual({ ok: true });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toEqual({ status: "active" });
    expect(Object.keys(updateCalls[0])).toEqual(["status"]);
    // an expired listing reactivates via reactivateListing, NOT this — so the
    // precondition is sold-only and expires_at is untouched
    expect(updateCalls[0]).not.toHaveProperty("expires_at");
    expect(eqHas("seller_id", UID)).toBe(true);
    expect(eqHas("status", "sold")).toBe(true);
    expect(eqHas("status", "expired")).toBe(false);
  });
});

describe("editing never renews — updateListing omits expires_at", () => {
  it("updateListing's update payload contains NO expires_at key", async () => {
    const input = {
      title: "Hood for 379",
      askingPrice: 250,
      conditionId: 1,
      shippingOption: "local_pickup",
      isBarnyard: true,
      fitment: [],
      photoPaths: [`${UID}/staging/abc.webp`],
    };

    const res = await updateListing(1, input);

    expect(res.ok).toBe(true);
    // exactly one listings update fired, and it must NOT move the 90-day clock
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).not.toHaveProperty("expires_at");
    expect(updateCalls[0]).not.toHaveProperty("status");
  });
});
