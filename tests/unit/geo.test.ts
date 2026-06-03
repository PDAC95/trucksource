import { describe, expect, it } from "vitest";
import { COUNTRIES, statesForCountry } from "@/lib/geo/locations";

describe("COUNTRIES", () => {
  it("contains exactly USA and Canada (no Mexico)", () => {
    expect(COUNTRIES).toHaveLength(2);
    const codes = COUNTRIES.map((c) => c.code);
    expect(codes).toContain("USA");
    expect(codes).toContain("Canada");
    expect(codes).not.toContain("Mexico");
  });
});

describe("statesForCountry", () => {
  it("returns US states including Texas (TX)", () => {
    const states = statesForCountry("USA");
    expect(states.some((s) => s.code === "TX" && s.label === "Texas")).toBe(
      true,
    );
    // 50 states + DC
    expect(states).toHaveLength(51);
  });

  it("returns Canadian provinces including Ontario (ON)", () => {
    const provinces = statesForCountry("Canada");
    expect(
      provinces.some((p) => p.code === "ON" && p.label === "Ontario"),
    ).toBe(true);
    // 10 provinces + 3 territories
    expect(provinces).toHaveLength(13);
  });

  it("returns an empty array for an unknown country code", () => {
    expect(statesForCountry("Mexico")).toEqual([]);
    expect(statesForCountry("XX")).toEqual([]);
  });
});
