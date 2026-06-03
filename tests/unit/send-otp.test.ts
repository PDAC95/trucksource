import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock every paid/external dependency so nothing hits Twilio / Supabase / BotID for
// real. The phone normalizer (lib/verify/phone) is intentionally NOT mocked — we use
// the real +1/E.164 geo gate to prove a non-+1 number is rejected before any send.

const checkBotId = vi.fn();
vi.mock("botid/server", () => ({ checkBotId: () => checkBotId() }));

const sendVerification = vi.fn();
vi.mock("@/lib/verify/twilio", () => ({
  sendVerification: (to: string) => sendVerification(to),
  checkVerification: vi.fn(),
}));

const consumeSendBudget = vi.fn();
vi.mock("@/lib/verify/ratelimit", () => ({
  consumeSendBudget: (a: unknown) => consumeSendBudget(a),
}));

const alertSpendCap = vi.fn();
const logAbuse = vi.fn();
vi.mock("@/lib/verify/alert", () => ({
  alertSpendCap: (a: unknown) => alertSpendCap(a),
  logAbuse: (k: unknown, f: unknown) => logAbuse(k, f),
}));

// Supabase server stub: getClaims -> sub, and a from().update().eq() chain.
const getClaims = vi.fn();
const updateEq = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: () => getClaims() },
    from: () => ({
      update: () => ({ eq: (...a: unknown[]) => updateEq(...a) }),
    }),
  }),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => "203.0.113.7" }),
}));

import { sendOtp } from "@/lib/actions/verify";

const US = "512 555 0123"; // valid US -> +15125550123
const UK = "+44 20 7946 0000"; // non-+1 -> rejected by toE164Plus1

beforeEach(() => {
  vi.clearAllMocks();
  checkBotId.mockResolvedValue({ isBot: false });
  getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } } });
  consumeSendBudget.mockResolvedValue({ ok: true });
  sendVerification.mockResolvedValue({});
});

describe("sendOtp — hardened guard order (no paid SMS on any earlier failure)", () => {
  it("isBot=true short-circuits FIRST: no rate-limit, no Twilio", async () => {
    checkBotId.mockResolvedValue({ isBot: true });

    const res = await sendOtp({ phone: US });

    expect(res).toEqual({ ok: false, error: "blocked" });
    expect(consumeSendBudget).not.toHaveBeenCalled();
    expect(sendVerification).not.toHaveBeenCalled();
  });

  it("unauthenticated -> error, no Twilio", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const res = await sendOtp({ phone: US });

    expect(res).toEqual({ ok: false, error: "unauthenticated" });
    expect(sendVerification).not.toHaveBeenCalled();
  });

  it("non-+1 number (real geo gate) -> region_unsupported, no Twilio", async () => {
    const res = await sendOtp({ phone: UK });

    expect(res).toEqual({ ok: false, error: "region_unsupported" });
    expect(consumeSendBudget).not.toHaveBeenCalled();
    expect(sendVerification).not.toHaveBeenCalled();
    expect(logAbuse).toHaveBeenCalledWith(
      "region_blocked",
      expect.objectContaining({ userId: "u1" }),
    );
  });

  it("spend_cap -> alertSpendCap called, no Twilio", async () => {
    consumeSendBudget.mockResolvedValue({ ok: false, reason: "spend_cap" });

    const res = await sendOtp({ phone: US });

    expect(res).toEqual({ ok: false, error: "spend_cap" });
    expect(alertSpendCap).toHaveBeenCalledOnce();
    expect(sendVerification).not.toHaveBeenCalled();
  });

  it("rate_limited -> no Twilio, no spend alert", async () => {
    consumeSendBudget.mockResolvedValue({ ok: false, reason: "rate_limited" });

    const res = await sendOtp({ phone: US });

    expect(res).toEqual({ ok: false, error: "rate_limited" });
    expect(alertSpendCap).not.toHaveBeenCalled();
    expect(sendVerification).not.toHaveBeenCalled();
  });

  it("all green -> sendVerification called once with the E.164 string", async () => {
    const res = await sendOtp({ phone: US });

    expect(res).toEqual({ ok: true });
    expect(sendVerification).toHaveBeenCalledOnce();
    expect(sendVerification).toHaveBeenCalledWith("+15125550123");
  });
});
