// garage-schema.test.ts — unit coverage for the shared truckSchema (lib/garage/schema.ts).
//
// Plain Vitest unit test (no Supabase env needed). Proves the single client+server
// validation rules: model required, config optional/nullable (model-level truck),
// nickname ≤40, string ids coerced (Radix Selects emit strings), and the empty-string
// nickname escape hatch.
import { describe, it, expect } from "vitest";
import { truckSchema } from "@/lib/garage/schema";

describe("truckSchema", () => {
  it("parses a full truck, coercing string ids to numbers", () => {
    const r = truckSchema.parse({
      modelId: "5",
      configId: "3",
      nickname: "Mi 379 rojo",
    });
    expect(r.modelId).toBe(5);
    expect(r.configId).toBe(3);
    expect(r.nickname).toBe("Mi 379 rojo");
  });

  it("parses with only modelId (config + nickname optional ⇒ model-level truck)", () => {
    const r = truckSchema.parse({ modelId: 5 });
    expect(r.modelId).toBe(5);
  });

  it("parses with configId explicitly null (nullable config)", () => {
    const r = truckSchema.parse({ modelId: 5, configId: null });
    expect(r.configId).toBeNull();
  });

  it("allows an empty-string nickname", () => {
    const r = truckSchema.parse({ modelId: 5, nickname: "" });
    expect(r.nickname).toBe("");
  });

  it("rejects a missing modelId", () => {
    expect(truckSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a nickname longer than 40 chars", () => {
    expect(
      truckSchema.safeParse({ modelId: 5, nickname: "x".repeat(41) }).success,
    ).toBe(false);
  });

  it("rejects a non-positive modelId", () => {
    expect(truckSchema.safeParse({ modelId: -1 }).success).toBe(false);
    expect(truckSchema.safeParse({ modelId: 0 }).success).toBe(false);
  });
});
