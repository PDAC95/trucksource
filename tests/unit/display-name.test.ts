// display-name.test.ts — ACCT-08 gate (d): reveal/revert restores the ORIGINAL handle.
//
// Pure resolver, no DB. The public name = resolvePublicName(display_name, username)
// = coalesce(display_name, username). `username` (the immutable anonymous handle) is
// NEVER mutated — revealing only sets display_name, reverting NULLs it, so the SAME
// original handle comes back (no new handle generated — Pitfall 2).
import { describe, it, expect } from "vitest";
import { resolvePublicName } from "@/lib/seller/badge";

describe("resolvePublicName (ACCT-08): reveal/revert keeps the original handle", () => {
  const username = "swift-otter-4821"; // the immutable anonymous handle

  it("reveal: a set display_name covers the handle", () => {
    expect(resolvePublicName("Patricio's Truck Parts", username)).toBe(
      "Patricio's Truck Parts",
    );
  });

  it("revert: display_name=null restores the SAME original handle", () => {
    // Reveal then revert — the handle is structurally preserved, not regenerated.
    expect(resolvePublicName("Patricio's Truck Parts", username)).not.toBe(
      username,
    );
    expect(resolvePublicName(null, username)).toBe(username);
  });
});
