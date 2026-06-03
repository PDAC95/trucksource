import { describe, expect, it, vi, beforeEach } from "vitest";

const checkVerification = vi.fn();
vi.mock("@/lib/verify/twilio", () => ({
  sendVerification: vi.fn(),
  checkVerification: (to: string, code: string) => checkVerification(to, code),
}));

// Supabase server stub. from('profiles_private') supports BOTH chains:
//   read:  .select('phone').eq('id', uid).single()  -> { data: { phone } | null }
//   write: .update({ phone_verified_at }).eq('id', uid)
const getClaims = vi.fn();
const single = vi.fn();
const updateEq = vi.fn().mockResolvedValue({ error: null });
const updateSpy = vi.fn((_patch: unknown) => ({
  eq: (...a: unknown[]) => updateEq(...a),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: () => getClaims() },
    from: () => ({
      select: () => ({ eq: () => ({ single: () => single() }) }),
      update: (patch: unknown) => updateSpy(patch),
    }),
  }),
}));

import { checkOtp } from "@/lib/actions/verify";

const PHONE = "+15125550123";

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } } });
  single.mockResolvedValue({ data: { phone: PHONE } });
});

describe("checkOtp — sets phone_verified_at ONLY on Twilio 'approved'", () => {
  it("approved -> update with phone_verified_at, returns ok", async () => {
    checkVerification.mockResolvedValue(true);

    const res = await checkOtp({ code: "123456" });

    expect(res).toEqual({ ok: true });
    expect(checkVerification).toHaveBeenCalledWith(PHONE, "123456");
    expect(updateSpy).toHaveBeenCalledOnce();
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ phone_verified_at: expect.any(String) }),
    );
  });

  it("not approved -> NO update, invalid_code", async () => {
    checkVerification.mockResolvedValue(false);

    const res = await checkOtp({ code: "000000" });

    expect(res).toEqual({ ok: false, error: "invalid_code" });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("no pending phone -> no_pending, checkVerification NOT called", async () => {
    single.mockResolvedValue({ data: null });

    const res = await checkOtp({ code: "123456" });

    expect(res).toEqual({ ok: false, error: "no_pending" });
    expect(checkVerification).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
