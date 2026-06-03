import { describe, expect, it, vi, beforeEach } from "vitest";

// Controllable admin-client stub. consumeSendBudget issues, in this exact order:
//   1) global day count   2) phone hour   3) phone day   4) ip hour   5) ip day
//   6) insert (only on the allow path)
// Each count query is `.select('id',{count,head}).gt('created_at',since)[.eq(col,val)]`
// then awaited. We model the builder as a thenable that resolves { count } from a
// programmable queue, and capture inserts.

let countQueue: number[] = [];
const insertSpy = vi.fn().mockResolvedValue({ error: null });

function makeBuilder() {
  // A thenable that ignores intermediate .gt/.eq and resolves the next queued count.
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.gt = chain;
  builder.eq = chain;
  builder.then = (resolve: (v: { count: number }) => unknown) => {
    const count = countQueue.shift() ?? 0;
    return Promise.resolve({ count }).then(resolve);
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => makeBuilder(),
      insert: (row: unknown) => insertSpy(row),
    }),
  }),
}));

import { consumeSendBudget } from "@/lib/verify/ratelimit";

const ARGS = { userId: "u1", e164: "+15125550123", ip: "203.0.113.7" };

beforeEach(() => {
  vi.clearAllMocks();
  countQueue = [];
  delete process.env.OTP_SEND_DAILY_CAP;
});

describe("consumeSendBudget — window edges per phone AND per IP + spend cap", () => {
  it("allows the 3rd send in the hour (counts: global, phoneHour=2)", async () => {
    // global=0, phoneHour=2 (under 3), phoneDay=2, ipHour=2, ipDay=2 -> allow
    countQueue = [0, 2, 2, 2, 2];
    const res = await consumeSendBudget(ARGS);
    expect(res).toEqual({ ok: true });
    expect(insertSpy).toHaveBeenCalledOnce();
  });

  it("blocks the 4th send/hour per phone -> rate_limited, no insert", async () => {
    // global=0, phoneHour=3 (== max) -> rate_limited
    countQueue = [0, 3];
    const res = await consumeSendBudget(ARGS);
    expect(res).toEqual({ ok: false, reason: "rate_limited" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("allows the 5th send in the day, blocks the 6th/day per phone", async () => {
    // 5th: global=0, phoneHour=0, phoneDay=4 (<5), ipHour=0, ipDay=4 -> allow
    countQueue = [0, 0, 4, 0, 4];
    expect(await consumeSendBudget(ARGS)).toEqual({ ok: true });

    // 6th: global=0, phoneHour=0, phoneDay=5 (== max) -> rate_limited
    insertSpy.mockClear();
    countQueue = [0, 0, 5];
    const res = await consumeSendBudget(ARGS);
    expect(res).toEqual({ ok: false, reason: "rate_limited" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("global count >= OTP_SEND_DAILY_CAP -> spend_cap (checked first)", async () => {
    process.env.OTP_SEND_DAILY_CAP = "200";
    countQueue = [200]; // global day already at cap
    const res = await consumeSendBudget(ARGS);
    expect(res).toEqual({ ok: false, reason: "spend_cap" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("per-IP hour cap trips independently of the phone", async () => {
    // global=0, phoneHour=0, phoneDay=0, ipHour=3 (== max) -> rate_limited
    countQueue = [0, 0, 0, 3];
    const res = await consumeSendBudget(ARGS);
    expect(res).toEqual({ ok: false, reason: "rate_limited" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("default cap is 200 when env unset (199 global allows)", async () => {
    countQueue = [199, 0, 0, 0, 0];
    const res = await consumeSendBudget(ARGS);
    expect(res).toEqual({ ok: true });
  });
});
