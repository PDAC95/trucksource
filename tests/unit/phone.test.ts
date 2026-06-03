import { describe, expect, it } from "vitest";
import { toE164Plus1 } from "@/lib/verify/phone";

describe("toE164Plus1 — +1-only E.164 normalizer (geo allowlist)", () => {
  it("passes through a valid US number already in E.164", () => {
    expect(toE164Plus1("+15125550123")).toBe("+15125550123");
  });

  it("normalizes a bare 10-digit US input (default region US)", () => {
    expect(toE164Plus1("512 555 0123")).toBe("+15125550123");
  });

  it("normalizes a formatted US number", () => {
    expect(toE164Plus1("(512) 555-0123")).toBe("+15125550123");
  });

  it("accepts a valid Canadian number and returns its +1 E.164", () => {
    // 416 = Toronto, ON (country 'CA', countryCallingCode '1')
    expect(toE164Plus1("+14165550123")).toBe("+14165550123");
  });

  it("rejects a UK (+44) number", () => {
    expect(toE164Plus1("+44 20 7946 0000")).toBeNull();
  });

  it("rejects a Mexico (+52) number — v1 is +1 only", () => {
    expect(toE164Plus1("+52 55 1234 5678")).toBeNull();
  });

  it("rejects an invalid short string", () => {
    expect(toE164Plus1("123")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(toE164Plus1("")).toBeNull();
  });
});
