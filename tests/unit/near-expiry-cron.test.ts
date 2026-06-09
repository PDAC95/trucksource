import { describe, expect, it, vi, beforeEach } from "vitest";

// Unit-test the near-expiry cron route's GUARD (Pitfall 6) + selection/notify-once
// logic WITHOUT a live DB or real Resend. We prove:
//   - No Authorization: Bearer ${CRON_SECRET} -> 401 and NO email/insert (the guard).
//   - With the secret: only near-expiry ACTIVE rows are notified; sold / active-future
//     / already-notified rows are excluded; a notification row is inserted + an email
//     attempted per notified listing.
//   - A Resend (fetch) failure does NOT abort the batch — the notification still inserts.
//
// The admin client is mocked as a chainable query builder whose terminal awaitable
// resolves per-table from test-controlled fixtures. Resend is mocked via global.fetch.

const CRON_SECRET = "test-secret";

// --- Test-controlled fixtures the mocked admin client reads from. ---
let listingsRows: Array<{
  id: number;
  title: string;
  seller_id: string;
  expires_at: string | null;
}> = [];
let existingNotifRows: Array<{ listing_id: number | null }> = [];
let privateRows: Array<{ id: string; email: string | null }> = [];

// --- Spies on the write side. ---
const insertSpy = vi.fn((_payload: Record<string, unknown>) => ({
  error: null as unknown,
}));

// A chainable builder. The terminal resolution is decided by the table + whether
// a count/head was requested; .insert() is terminal and records the payload.
function makeBuilder(table: string) {
  const state: { isHead?: boolean } = {};
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.gt = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.insert = vi.fn((payload: Record<string, unknown>) =>
    insertSpy(payload),
  );
  // The builder is awaited directly (no .single()) in the route — make it thenable.
  chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => {
    let data: unknown[] = [];
    if (table === "listings") data = listingsRows;
    else if (table === "notifications") data = existingNotifRows;
    else if (table === "profiles_private") data = privateRows;
    return resolve({ data, error: null });
  };
  void state;
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => makeBuilder(table),
  }),
}));

import { GET } from "@/app/api/cron/near-expiry/route";

function req(auth?: string) {
  const headers = new Headers();
  if (auth) headers.set("authorization", auth);
  return { headers } as unknown as Request;
}

// expires_at helpers relative to now.
const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString();

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  vi.stubEnv("RESEND_API_KEY", "re_test");
  listingsRows = [];
  existingNotifRows = [];
  privateRows = [];
  insertSpy.mockClear();
  insertSpy.mockImplementation(() => ({ error: null as unknown }));
  global.fetch = vi.fn(async () => new Response("{}", { status: 200 }));
});

describe("GET /api/cron/near-expiry — guard (Pitfall 6)", () => {
  it("rejects with 401 and does NO work when the Bearer secret is missing", async () => {
    listingsRows = [
      { id: 1, title: "Hood", seller_id: "s1", expires_at: inDays(3) },
    ];
    const res = await GET(req() as never);
    expect(res.status).toBe(401);
    expect(insertSpy).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects with 401 on a wrong secret", async () => {
    const res = await GET(req("Bearer nope") as never);
    expect(res.status).toBe(401);
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/near-expiry — selection & notify-once", () => {
  it("notifies only near-expiry active listings (sold/future already excluded by query; in-window passes)", async () => {
    // The DB query filters status='active' and the 7-day window; the route also
    // re-checks isExpiringSoon. Provide two in-window actives + an already-notified one.
    listingsRows = [
      { id: 1, title: "Hood", seller_id: "s1", expires_at: inDays(3) },
      { id: 2, title: "Bumper", seller_id: "s2", expires_at: inDays(6) },
      { id: 3, title: "Mirror", seller_id: "s1", expires_at: inDays(5) },
    ];
    existingNotifRows = [{ listing_id: 3 }]; // id 3 already notified -> excluded
    privateRows = [
      { id: "s1", email: "s1@example.com" },
      { id: "s2", email: "s2@example.com" },
    ];

    const res = await GET(req(`Bearer ${CRON_SECRET}`) as never);
    const body = await res.json();
    expect(body.notified).toBe(2); // ids 1 and 2 only
    expect(insertSpy).toHaveBeenCalledTimes(2);
    // each insert is a listing_expiring row for the seller
    const kinds = insertSpy.mock.calls.map((c) => c[0].kind);
    expect(kinds).toEqual(["listing_expiring", "listing_expiring"]);
    expect(global.fetch).toHaveBeenCalledTimes(2); // one email attempt each
  });

  it("excludes an out-of-window active row (isExpiringSoon re-check)", async () => {
    // A row 30 days out would normally be excluded by the SQL window; assert the
    // route's isExpiringSoon re-check drops it even if it leaked through.
    listingsRows = [
      { id: 1, title: "Far", seller_id: "s1", expires_at: inDays(30) },
    ];
    privateRows = [{ id: "s1", email: "s1@example.com" }];
    const res = await GET(req(`Bearer ${CRON_SECRET}`) as never);
    const body = await res.json();
    expect(body.notified).toBe(0);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("returns notified:0 when every candidate was already notified", async () => {
    listingsRows = [
      { id: 1, title: "Hood", seller_id: "s1", expires_at: inDays(3) },
    ];
    existingNotifRows = [{ listing_id: 1 }];
    const res = await GET(req(`Bearer ${CRON_SECRET}`) as never);
    const body = await res.json();
    expect(body.notified).toBe(0);
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/near-expiry — best-effort email", () => {
  it("still inserts the notification when the Resend fetch throws", async () => {
    listingsRows = [
      { id: 1, title: "Hood", seller_id: "s1", expires_at: inDays(3) },
    ];
    privateRows = [{ id: "s1", email: "s1@example.com" }];
    global.fetch = vi.fn(async () => {
      throw new Error("resend down");
    });

    const res = await GET(req(`Bearer ${CRON_SECRET}`) as never);
    const body = await res.json();
    expect(body.notified).toBe(1); // email failed, notification row still wrote
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });
});
