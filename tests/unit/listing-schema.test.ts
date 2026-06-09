// listing-schema.test.ts — unit coverage for the shared listingSchema
// (lib/listings/schema.ts).
//
// Plain Vitest unit test (no Supabase env needed — pure Zod). Proves the single
// client+server validation rules: required title/price, optional part#/damage,
// USD price rule (>0, cents, string-coercion), the barnyard-or-fitment refine,
// the shippingOption enum, and the 8-photo cap.
import { describe, it, expect } from "vitest";
import { listingSchema } from "@/lib/listings/schema";

// A minimal valid listing: title + price + condition + shipping + one fitment.
const base = {
  title: "Peterbilt 379 hood",
  askingPrice: 1999.99,
  conditionId: 2,
  shippingOption: "local_pickup",
  fitment: [{ modelId: 5 }],
} as const;

describe("listingSchema", () => {
  it("parses a valid minimal listing", () => {
    const r = listingSchema.parse({ ...base });
    expect(r.title).toBe("Peterbilt 379 hood");
    expect(r.askingPrice).toBe(1999.99);
    expect(r.conditionId).toBe(2);
    expect(r.shippingOption).toBe("local_pickup");
    expect(r.fitment).toHaveLength(1);
    // defaults applied
    expect(r.isBarnyard).toBe(false);
    expect(r.photoPaths).toEqual([]);
    // Phase-6 dimensions default to empty.
    expect(r.categoryIds).toEqual([]);
    expect(r.searchTermIds).toEqual([]);
  });

  it("rejects a missing title", () => {
    const { title, ...rest } = base;
    expect(listingSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(listingSchema.safeParse({ ...base, title: "" }).success).toBe(false);
  });

  it("rejects a non-positive askingPrice", () => {
    expect(listingSchema.safeParse({ ...base, askingPrice: 0 }).success).toBe(
      false,
    );
    expect(listingSchema.safeParse({ ...base, askingPrice: -5 }).success).toBe(
      false,
    );
  });

  it("accepts a cents-precision price", () => {
    expect(
      listingSchema.safeParse({ ...base, askingPrice: 19.99 }).success,
    ).toBe(true);
  });

  it("coerces a string price", () => {
    const r = listingSchema.parse({ ...base, askingPrice: "19.99" });
    expect(r.askingPrice).toBe(19.99);
  });

  it("treats partNumber as optional (omitted AND empty-string both pass)", () => {
    expect(listingSchema.safeParse({ ...base }).success).toBe(true);
    expect(listingSchema.safeParse({ ...base, partNumber: "" }).success).toBe(
      true,
    );
    const r = listingSchema.parse({ ...base, partNumber: "ABC-123" });
    expect(r.partNumber).toBe("ABC-123");
  });

  it("treats damageNotes as optional (omitted AND empty-string both pass)", () => {
    expect(listingSchema.safeParse({ ...base, damageNotes: "" }).success).toBe(
      true,
    );
  });

  it("rejects a non-Barnyard listing with no fitment (the refine)", () => {
    const { fitment, ...rest } = base;
    const r = listingSchema.safeParse({ ...rest });
    expect(r.success).toBe(false);
    if (!r.success) {
      // error attaches to the fitment section
      expect(r.error.issues.some((i) => i.path.includes("fitment"))).toBe(true);
    }
  });

  it("allows a Barnyard listing with no fitment", () => {
    const { fitment, ...rest } = base;
    expect(listingSchema.safeParse({ ...rest, isBarnyard: true }).success).toBe(
      true,
    );
  });

  it("rejects an invalid shippingOption", () => {
    expect(
      listingSchema.safeParse({ ...base, shippingOption: "carrier_pigeon" })
        .success,
    ).toBe(false);
  });

  it("rejects more than 8 photoPaths", () => {
    const photoPaths = Array.from({ length: 9 }, (_, i) => `p/${i}.webp`);
    expect(listingSchema.safeParse({ ...base, photoPaths }).success).toBe(
      false,
    );
  });

  it("accepts exactly 8 photoPaths", () => {
    const photoPaths = Array.from({ length: 8 }, (_, i) => `p/${i}.webp`);
    expect(listingSchema.safeParse({ ...base, photoPaths }).success).toBe(true);
  });

  it("accepts a model-level fitment (configId omitted/null)", () => {
    expect(
      listingSchema.safeParse({ ...base, fitment: [{ modelId: 5 }] }).success,
    ).toBe(true);
    expect(
      listingSchema.safeParse({
        ...base,
        fitment: [{ modelId: 5, configId: null }],
      }).success,
    ).toBe(true);
  });

  // --- Phase-6 dimensions: categoryIds + searchTermIds (FINT-03) ---

  it("accepts categoryIds + searchTermIds and coerces string ids", () => {
    const r = listingSchema.parse({
      ...base,
      categoryIds: ["3", 5],
      searchTermIds: ["2"],
    });
    expect(r.categoryIds).toEqual([3, 5]);
    expect(r.searchTermIds).toEqual([2]);
  });

  it("rejects non-positive / non-int category or term ids", () => {
    expect(listingSchema.safeParse({ ...base, categoryIds: [0] }).success).toBe(
      false,
    );
    expect(
      listingSchema.safeParse({ ...base, searchTermIds: [1.5] }).success,
    ).toBe(false);
  });

  it("categoryIds do NOT satisfy the barnyard-or-fitment refine", () => {
    // A non-Barnyard listing with NO fitment must still fail even when categoryIds
    // is non-empty — categories are not a fitment.
    const { fitment, ...rest } = base;
    const r = listingSchema.safeParse({ ...rest, categoryIds: [3, 5] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("fitment"))).toBe(true);
    }
  });
});
