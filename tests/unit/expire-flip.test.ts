// expire-flip.test.ts — LIST-09 gate (c): the expiry-flip predicate.
//
// Pure predicate, no DB. Proves only `active`-past-expiry flips; `sold`-past-expiry
// and `active`-in-future do NOT (Pitfall 3). An already-`expired` row is terminal.
import { describe, it, expect } from "vitest";
import { shouldExpire } from "@/lib/listings/lifecycle";

describe("shouldExpire (LIST-09): only active-past-expiry flips", () => {
  const now = new Date("2026-06-09T00:00:00Z");
  const past = new Date("2026-06-08T00:00:00Z"); // before now
  const future = new Date("2026-09-07T00:00:00Z"); // after now

  it("active + past expiry → flips", () => {
    expect(shouldExpire("active", past, now)).toBe(true);
  });

  it("sold + past expiry → does NOT flip (terminal, no clock)", () => {
    expect(shouldExpire("sold", past, now)).toBe(false);
  });

  it("active + future expiry → does NOT flip", () => {
    expect(shouldExpire("active", future, now)).toBe(false);
  });

  it("expired + past expiry → does NOT flip (already terminal)", () => {
    expect(shouldExpire("expired", past, now)).toBe(false);
  });
});
