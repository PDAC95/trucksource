import { describe, expect, it } from "vitest";
import {
  generateUsername,
  isReservedUsername,
  USERNAME_REGEX,
} from "@/lib/username/generate";

describe("USERNAME_REGEX", () => {
  it("accepts 3–20 alphanumerics", () => {
    expect(USERNAME_REGEX.test("Rig123")).toBe(true);
    expect(USERNAME_REGEX.test("abc")).toBe(true);
    expect(USERNAME_REGEX.test("A".repeat(20))).toBe(true);
  });

  it("rejects too-short, too-long, and non-alphanumeric handles", () => {
    expect(USERNAME_REGEX.test("ab")).toBe(false);
    expect(USERNAME_REGEX.test("A".repeat(21))).toBe(false);
    expect(USERNAME_REGEX.test("has space")).toBe(false);
    expect(USERNAME_REGEX.test("under_score")).toBe(false);
  });
});

describe("generateUsername", () => {
  it("always produces a USERNAME_REGEX-valid handle across 100 runs", async () => {
    for (let i = 0; i < 100; i++) {
      const username = await generateUsername();
      expect(username).toMatch(USERNAME_REGEX);
    }
  });

  it("retries when isTaken returns true once, then false", async () => {
    let calls = 0;
    const isTaken = async () => {
      calls += 1;
      return calls === 1; // taken on first candidate only
    };
    const username = await generateUsername(isTaken);
    expect(calls).toBe(2);
    expect(username).toMatch(USERNAME_REGEX);
  });

  it("throws if no unique candidate is found within the retry budget", async () => {
    await expect(generateUsername(async () => true)).rejects.toThrow();
  });
});

describe("isReservedUsername", () => {
  it("rejects reserved words (case-insensitive)", () => {
    expect(isReservedUsername("admin")).toBe(true);
    expect(isReservedUsername("ADMIN")).toBe(true);
    expect(isReservedUsername("auth")).toBe(true);
  });

  it("allows ordinary handles", () => {
    expect(isReservedUsername("Rig123")).toBe(false);
  });
});
