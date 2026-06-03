import { describe, expect, it } from "vitest";
import { registerSchema } from "@/lib/validation/auth";

const validInput = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: "5551234567",
  country: "USA" as const,
  stateProvince: "TX",
  username: "Rig123",
  password: "supersecret",
  acceptTerms: true as const,
};

describe("registerSchema", () => {
  it("accepts a fully valid object", () => {
    expect(registerSchema.safeParse(validInput).success).toBe(true);
  });

  it("accepts a valid object with an empty username (auto-generate path)", () => {
    expect(
      registerSchema.safeParse({ ...validInput, username: "" }).success,
    ).toBe(true);
  });

  it("rejects a missing firstName", () => {
    const { firstName: _omit, ...rest } = validInput;
    expect(registerSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a sub-8-character password", () => {
    expect(
      registerSchema.safeParse({ ...validInput, password: "short77" }).success,
    ).toBe(false);
  });

  it("rejects acceptTerms: false", () => {
    expect(
      registerSchema.safeParse({ ...validInput, acceptTerms: false }).success,
    ).toBe(false);
  });

  it("rejects a too-short username", () => {
    expect(
      registerSchema.safeParse({ ...validInput, username: "ab" }).success,
    ).toBe(false);
  });

  it("rejects a username with a space", () => {
    expect(
      registerSchema.safeParse({ ...validInput, username: "has space" })
        .success,
    ).toBe(false);
  });
});
