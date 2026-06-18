// Shared Zod schema for a marketplace Listing — the SAME schema validates on the
// client (UX) and inside the Server Action (trust boundary). Single client+server
// source of truth (CLAUDE.md invariant). Downstream plans (the create/edit actions
// and the listing form) MUST import this — never re-derive these rules in a query
// or component.
//
// NOTE on what this schema deliberately does NOT enforce (server-side re-checks):
//   - It does NOT enforce model_configurations applicability (is this config valid
//     for this model?). That is a DB re-check in the actions plan, not a
//     client-expressible Zod rule (same posture as truckSchema).
//   - It does NOT enforce that submitted photoPaths actually belong to the caller.
//     Ownership of staged uploads is verified server-side in the action.
import { z } from "zod";

import { YEAR_MIN, YEAR_MAX } from "@/lib/listings/years";

/**
 * One fitment combination attached to a listing (multi-fit: a listing may carry
 * several). modelId is required (Make is implied by the model row); configId is
 * optional/nullable — omitted/null ⇒ a MODEL-LEVEL fit ("fits any 379").
 *
 * Radix Selects emit string values, so ids are coerced with z.coerce.number()
 * (same reason garage/schema.ts coerces select-driven ids).
 */
const fitmentEntry = z.object({
  modelId: z.coerce.number().int().positive(),
  configId: z.coerce.number().int().positive().nullable().optional(),
});

export type FitmentEntry = z.infer<typeof fitmentEntry>;

/**
 * A listing the user is creating/editing.
 *   - title: REQUIRED, 1..120 chars.
 *   - partNumber: optional; "" allowed (an empty field is "no part number").
 *   - askingPrice: REQUIRED positive USD amount, cents-precision (multipleOf 0.01).
 *     The DB column is integer-cents (never a float — Pitfall 6, enforced in the DB
 *     plan); this is the matching client rule: > 0, at most 2 decimals.
 *   - conditionId: REQUIRED — populated from the fitment-library `conditions` table
 *     (see lib/listings/cascade.ts getConditions).
 *   - shippingOption: one of the three account-/listing-level shipping choices.
 *   - damageNotes: optional; "" allowed.
 *   - isBarnyard: explicit "The Barnyard" toggle (anything-goes category).
 *   - fitment: zero-or-more fitment combos. The .refine below enforces the product
 *     rule "Make+Model required UNLESS Barnyard": a non-Barnyard listing must carry
 *     at least one fitment; a Barnyard listing may carry none.
 *   - photoPaths: storage paths of already-uploaded (EXIF-stripped) photos. A
 *     listing needs at least 3 photos to publish (LIST-08) and is capped at 8
 *     (CONTEXT limit). First entry is the cover. v1 publishes on create/edit, so
 *     the min applies to every schema-validated write.
 *   - categoryIds: optional Phase-6 part-category ids (FINT-03). NOT part of the
 *     barnyard-or-fitment requirement — a listing may carry zero categories.
 *   - searchTermIds: optional Phase-6 slang-tag (search_term) ids (FINT-03). Also
 *     NOT part of the fitment requirement. Both default to []; ids are coerced from
 *     the Radix-select string convention (same as fitment/conditionId).
 */
export const listingSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    partNumber: z.string().trim().max(80).optional().or(z.literal("")),
    askingPrice: z.coerce.number().positive().multipleOf(0.01),
    conditionId: z.coerce.number().int().positive(),
    shippingOption: z.enum([
      "shipping_available",
      "local_pickup",
      "shipping_assistance",
    ]),
    damageNotes: z.string().trim().max(2000).optional().or(z.literal("")),
    isBarnyard: z.boolean().default(false),
    fitment: z.array(fitmentEntry).default([]),
    // .prefault (NOT .default): Zod 4 returns a .default value without running
    // the checks, which would let an omitted photoPaths bypass the LIST-08
    // minimum; .prefault parses [] through min(3) so omission fails too.
    photoPaths: z
      .array(z.string())
      .min(3, "Add at least 3 photos to publish.")
      .max(8)
      .prefault([]),
    categoryIds: z.array(z.coerce.number().int().positive()).default([]),
    searchTermIds: z.array(z.coerce.number().int().positive()).default([]),
    // ── YEAR COMPATIBILITY (FITL-05 / FINT-03) ───────────────────────────────
    // Which truck YEARS this listing fits. The seller picks a MODE; the actual
    // DB columns (listings.year_start / year_end, migration 0026) are derived
    // from it via toYearColumns() below — never written raw from these fields.
    //   - universal: the part fits ALL years           → both columns null
    //   - specific: one year                           → year_start = year_end
    //   - range:    a start..end pair                  → year_start <= year_end
    // yearStart/yearEnd are coerced (Radix Selects emit strings) and bounded to
    // the SINGLE source range (YEAR_MIN..YEAR_MAX from lib/listings/years), the
    // same bounds the listings_year_bounds CHECK enforces in the DB.
    yearMode: z.enum(["universal", "specific", "range"]).default("universal"),
    yearStart: z.coerce
      .number()
      .int()
      .min(YEAR_MIN)
      .max(YEAR_MAX)
      .nullable()
      .optional(),
    yearEnd: z.coerce
      .number()
      .int()
      .min(YEAR_MIN)
      .max(YEAR_MAX)
      .nullable()
      .optional(),
  })
  .refine((v) => v.isBarnyard || v.fitment.length >= 1, {
    message: "Add at least one fitment, or mark The Barnyard.",
    path: ["fitment"],
  })
  // Cross-field year rules — the SAME rules the Server Action re-validates
  // (trust boundary) and the form surfaces inline. superRefine so each failure
  // attaches to the precise field. Universal ignores any stray year values; the
  // normaliser (toYearColumns) is what actually drops them to null on write.
  .superRefine((v, ctx) => {
    if (v.yearMode === "specific") {
      if (v.yearStart == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pick a year.",
          path: ["yearStart"],
        });
      } else if (v.yearEnd != null && v.yearEnd !== v.yearStart) {
        // A specific year stores year_start = year_end; a mismatched end is
        // a client bug. (The form keeps yearEnd in sync; this is the guard.)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A specific year must match its single value.",
          path: ["yearEnd"],
        });
      }
    } else if (v.yearMode === "range") {
      if (v.yearStart == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pick a start year.",
          path: ["yearStart"],
        });
      }
      if (v.yearEnd == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pick an end year.",
          path: ["yearEnd"],
        });
      }
      if (v.yearStart != null && v.yearEnd != null && v.yearStart > v.yearEnd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "End year must be on or after the start year.",
          path: ["yearEnd"],
        });
      }
    }
  });

export type ListingInput = z.infer<typeof listingSchema>;

/**
 * Map the validated form's year MODE + values onto the DB column pair
 * { year_start, year_end } (migration 0026 semantics):
 *   - universal → { null, null }
 *   - specific  → { y, y }   (year_start = year_end)
 *   - range     → { start, end }
 * Called by createListing/updateListing AFTER the schema validates, so the
 * cross-field rules above already guarantee the required values are present and
 * ordered. The single place form-shape → DB-shape happens (client + server).
 */
export function toYearColumns(v: {
  yearMode: ListingInput["yearMode"];
  yearStart?: number | null;
  yearEnd?: number | null;
}): { year_start: number | null; year_end: number | null } {
  if (v.yearMode === "specific" && v.yearStart != null) {
    return { year_start: v.yearStart, year_end: v.yearStart };
  }
  if (v.yearMode === "range" && v.yearStart != null && v.yearEnd != null) {
    return { year_start: v.yearStart, year_end: v.yearEnd };
  }
  return { year_start: null, year_end: null };
}

// The RHF working type — the schema's INPUT side (before z.coerce/defaults run).
// Selects/number inputs hand RHF strings; the resolver coerces them to ListingInput.
export type ListingFormValues = z.input<typeof listingSchema>;
