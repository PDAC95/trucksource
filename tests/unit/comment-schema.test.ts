import { describe, expect, it } from "vitest";
import { commentSchema, COMMENT_MAX_LENGTH } from "@/lib/comments/schema";

// commentSchema is the single client+server source of truth for a comment post.
// These tests pin the body limits (lockstep with the 0015 DB CHECK), the trim
// rule, and the coercion conventions shared with listingSchema.

const base = { listingId: 1, body: "hello" };

describe("COMMENT_MAX_LENGTH — DB CHECK lockstep", () => {
  it("is exactly 1000 (must equal the listing_comments body CHECK in 0015)", () => {
    expect(COMMENT_MAX_LENGTH).toBe(1000);
  });
});

describe("commentSchema — body limits", () => {
  it("accepts a 1-char body", () => {
    expect(commentSchema.safeParse({ ...base, body: "x" }).success).toBe(true);
  });

  it("accepts a body of exactly COMMENT_MAX_LENGTH chars", () => {
    const body = "a".repeat(COMMENT_MAX_LENGTH);
    expect(commentSchema.safeParse({ ...base, body }).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(commentSchema.safeParse({ ...base, body: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only body (trimmed to empty)", () => {
    expect(commentSchema.safeParse({ ...base, body: "   \n\t " }).success).toBe(
      false,
    );
  });

  it("rejects a body of COMMENT_MAX_LENGTH + 1 chars", () => {
    const body = "a".repeat(COMMENT_MAX_LENGTH + 1);
    expect(commentSchema.safeParse({ ...base, body }).success).toBe(false);
  });

  it("trims surrounding whitespace from the body", () => {
    const parsed = commentSchema.safeParse({ ...base, body: "  hi there  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.body).toBe("hi there");
  });
});

describe("commentSchema — id coercion + parentId optionality", () => {
  it("coerces a string listingId", () => {
    const parsed = commentSchema.safeParse({ listingId: "7", body: "ok" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.listingId).toBe(7);
  });

  it("coerces a string parentId", () => {
    const parsed = commentSchema.safeParse({ ...base, parentId: "3" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.parentId).toBe(3);
  });

  it("accepts an omitted parentId (top-level comment)", () => {
    const parsed = commentSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.parentId).toBeUndefined();
  });

  it("accepts an explicit null parentId", () => {
    const parsed = commentSchema.safeParse({ ...base, parentId: null });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.parentId).toBeNull();
  });

  it("rejects a non-positive listingId", () => {
    expect(commentSchema.safeParse({ listingId: 0, body: "ok" }).success).toBe(
      false,
    );
    expect(commentSchema.safeParse({ listingId: -2, body: "ok" }).success).toBe(
      false,
    );
  });
});
