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
 *   - photoPaths: storage paths of already-uploaded (EXIF-stripped) photos, capped
 *     at 8 (CONTEXT limit). First entry is the cover.
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
    photoPaths: z.array(z.string()).max(8).default([]),
  })
  .refine((v) => v.isBarnyard || v.fitment.length >= 1, {
    message: "Add at least one fitment, or mark The Barnyard.",
    path: ["fitment"],
  });

export type ListingInput = z.infer<typeof listingSchema>;

// The RHF working type — the schema's INPUT side (before z.coerce/defaults run).
// Selects/number inputs hand RHF strings; the resolver coerces them to ListingInput.
export type ListingFormValues = z.input<typeof listingSchema>;
