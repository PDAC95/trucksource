// garage-schema.test.ts — unit coverage for the shared truckSchema (lib/garage/schema.ts).
//
// Plain Vitest unit test (no Supabase env needed). Proves the single client+server
// validation rules: model required, config optional/nullable (model-level truck),
// year REQUIRED + range-bounded (1970..2027), nickname ≤40, string ids/year coerced
// (Radix Selects emit strings), and the empty-string nickname escape hatch.
import { describe, it, expect } from "vitest";
import { truckSchema } from "@/lib/garage/schema";

describe("truckSchema", () => {
  it("parses a full truck, coercing string ids/year to numbers", () => {
    const r = truckSchema.parse({
      modelId: "5",
      configId: "3",
      year: "2019",
      nickname: "Mi 379 rojo",
    });
    expect(r.modelId).toBe(5);
    expect(r.configId).toBe(3);
    expect(r.year).toBe(2019);
    expect(r.nickname).toBe("Mi 379 rojo");
  });

  it("parses with only modelId + year (config + nickname optional ⇒ model-level truck)", () => {
    const r = truckSchema.parse({ modelId: 5, year: 2020 });
    expect(r.modelId).toBe(5);
    expect(r.year).toBe(2020);
  });

  it("parses with configId explicitly null (nullable config)", () => {
    const r = truckSchema.parse({ modelId: 5, configId: null, year: 2020 });
    expect(r.configId).toBeNull();
  });

  it("allows an empty-string nickname", () => {
    const r = truckSchema.parse({ modelId: 5, year: 2020, nickname: "" });
    expect(r.nickname).toBe("");
  });

  it("rejects a missing modelId", () => {
    expect(truckSchema.safeParse({ year: 2020 }).success).toBe(false);
  });

  it("rejects a missing year (year is required)", () => {
    expect(truckSchema.safeParse({ modelId: 5 }).success).toBe(false);
  });

  it("rejects a year outside the 1970..2027 range", () => {
    expect(truckSchema.safeParse({ modelId: 5, year: 1969 }).success).toBe(
      false,
    );
    expect(truckSchema.safeParse({ modelId: 5, year: 2028 }).success).toBe(
      false,
    );
  });

  it("rejects a nickname longer than 40 chars", () => {
    expect(
      truckSchema.safeParse({
        modelId: 5,
        year: 2020,
        nickname: "x".repeat(41),
      }).success,
    ).toBe(false);
  });

  it("rejects a non-positive modelId", () => {
    expect(truckSchema.safeParse({ modelId: -1, year: 2020 }).success).toBe(
      false,
    );
    expect(truckSchema.safeParse({ modelId: 0, year: 2020 }).success).toBe(
      false,
    );
  });
});
