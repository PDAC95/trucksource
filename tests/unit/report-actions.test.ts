import { describe, expect, it, vi, beforeEach } from "vitest";

// Unit-test the REPORT TRUST BOUNDARY's guard ORDER without a live DB (clone of
// social-actions.test.ts): unauthenticated short-circuit, schema gate, daily
// rate limit, exclusive-arc column mapping, 23505 → already_reported, RLS/FK
// rejection → not_found (no existence leak), and the best-effort admin email
// firing ONLY after a successful insert. The unique indexes + RLS policies
// themselves live in 0016_messaging.sql.

const getClaims = vi.fn();
const sendAdminReportCopy = vi.fn();

vi.mock("@/lib/messaging/notify", () => ({
  sendAdminReportCopy: (...a: unknown[]) => sendAdminReportCopy(...a),
}));

// --- Configurable chainable .from() builder (social-actions pattern) -------

type BuilderRecord = {
  table: string;
  op: "select" | "insert";
  eqs: [string, unknown][];
  insertedRow: unknown;
};

let builders: BuilderRecord[] = [];

// Per-test result knobs.
let rateLimitCount = 0;
let insertResult: { data: unknown; error: unknown } = {
  data: { id: 1, created_at: "2026-06-11T00:00:00Z" },
  error: null,
};
let profileRow: Record<string, unknown> | null = { username: "trucker99" };

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
  b.maybeSingle = vi.fn(async () => ({ data: profileRow, error: null }));
  b.single = vi.fn(async () => insertResult);
  // Awaited-chain terminal: the head-count rate-limit read is awaited directly.
  b.then = (resolve: (v: unknown) => unknown) => {
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

import { submitReport } from "@/lib/actions/reports";

const UID = "11111111-1111-1111-1111-111111111111";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    targetType: "comment",
    targetId: 7,
    reason: "spam",
    detail: "",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  builders = [];
  getClaims.mockResolvedValue({ data: { claims: { sub: UID } } });
  rateLimitCount = 0;
  insertResult = {
    data: { id: 1, created_at: "2026-06-11T00:00:00Z" },
    error: null,
  };
  profileRow = { username: "trucker99" };
  sendAdminReportCopy.mockResolvedValue(true);
});

describe("submitReport — guard ORDER", () => {
  it("1) unauthenticated -> short-circuits before ANY query or email", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const res = await submitReport(validInput());

    expect(res).toEqual({ ok: false, error: "unauthenticated" });
    expect(fromSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
    expect(sendAdminReportCopy).not.toHaveBeenCalled();
  });

  it("2) invalid input -> invalid before ANY query (schema gate)", async () => {
    const res = await submitReport(validInput({ reason: "i-just-dislike-it" }));

    expect(res).toEqual({ ok: false, error: "invalid" });
    expect(fromSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("3) rate-limit count at the cap -> rate_limited, inserts NOTHING, no email", async () => {
    rateLimitCount = 10;

    const res = await submitReport(validInput());

    expect(res).toEqual({ ok: false, error: "rate_limited" });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(sendAdminReportCopy).not.toHaveBeenCalled();
  });

  it("4) 23505 unique violation -> already_reported (friendly path), no email", async () => {
    insertResult = { data: null, error: { code: "23505" } };

    const res = await submitReport(validInput());

    expect(res).toEqual({ ok: false, error: "already_reported" });
    expect(sendAdminReportCopy).not.toHaveBeenCalled();
  });

  it("4b) any other insert rejection (FK miss / RLS policy) -> not_found, no leak, no email", async () => {
    insertResult = { data: null, error: { code: "42501" } };

    const res = await submitReport(validInput({ targetType: "message" }));

    expect(res).toEqual({ ok: false, error: "not_found" });
    expect(sendAdminReportCopy).not.toHaveBeenCalled();
  });

  it("5) happy path -> SELF-ATTRIBUTED insert, then admin email", async () => {
    const res = await submitReport(validInput({ detail: "obvious spam bot" }));

    expect(res).toEqual({ ok: true });
    expect(insertSpy).toHaveBeenCalledOnce();
    const [table, row] = insertSpy.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(table).toBe("reports");
    // Self-attribution: reporter_id is the verified caller, never client input.
    expect(row.reporter_id).toBe(UID);
    expect(row.comment_id).toBe(7);
    expect(row.reason).toBe("spam");
    expect(row.detail).toBe("obvious spam bot");
    // Exclusive arc: ONLY the mapped column is present.
    expect(row).not.toHaveProperty("listing_id");
    expect(row).not.toHaveProperty("message_id");

    expect(sendAdminReportCopy).toHaveBeenCalledOnce();
    expect(sendAdminReportCopy).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: 1,
        reporterUsername: "trucker99",
        targetType: "comment",
        targetId: 7,
        reason: "spam",
        detail: "obvious spam bot",
        createdAt: "2026-06-11T00:00:00Z",
      }),
    );
  });
});

describe("submitReport — target column mapping (exclusive arc)", () => {
  it.each([
    ["listing", "listing_id"],
    ["comment", "comment_id"],
    ["message", "message_id"],
  ] as const)("%s -> %s", async (targetType, column) => {
    const res = await submitReport(validInput({ targetType, targetId: 3 }));

    expect(res).toEqual({ ok: true });
    const [, row] = insertSpy.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(row[column]).toBe(3);
    for (const other of ["listing_id", "comment_id", "message_id"]) {
      if (other !== column) expect(row).not.toHaveProperty(other);
    }
  });
});

describe("submitReport — admin email is best-effort decoration", () => {
  it("missing username still emails with a fallback and the action succeeds", async () => {
    profileRow = { username: null };

    const res = await submitReport(validInput());

    expect(res).toEqual({ ok: true });
    expect(sendAdminReportCopy).toHaveBeenCalledWith(
      expect.objectContaining({ reporterUsername: "(no username)" }),
    );
  });
});
