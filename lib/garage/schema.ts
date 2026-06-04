// Shared Zod schema for My Garage — the SAME schema validates on the client (UX)
// and inside the Server Action (trust boundary). Single client+server source of
// truth (CLAUDE.md invariant: same Zod schema both sides). Never duplicate these
// rules in a query or component.
//
// NOTE: this schema does NOT enforce model_configurations applicability (is this
// config valid for this model?). That is a server-side DB re-check in the action
// plan (Pattern 2), not a client-expressible Zod rule.
import { z } from "zod";

/**
 * A garage truck the user is adding/editing.
 *   - modelId: Make+Model required (the make is implied by the model row).
 *   - configId: optional/nullable — omitted/null ⇒ a MODEL-LEVEL truck ("any 379").
 *   - year: REQUIRED model/manufacture year (heavy-truck plausible range
 *     1970..2027, mirroring the DB CHECK in 0005). Year is a distinguishing
 *     attribute — same model/config in a different year is a distinct truck.
 *   - nickname: optional, ≤40 chars; "" allowed (an empty field is "no nickname").
 *
 * Radix Selects emit string values, so ids/year are coerced with z.coerce.number()
 * (same reason register/actions.ts coerces select-driven ids).
 */
export const truckSchema = z.object({
  modelId: z.coerce.number().int().positive(),
  configId: z.coerce.number().int().positive().nullable().optional(),
  year: z.coerce.number().int().min(1970).max(2027),
  nickname: z.string().max(40).optional().or(z.literal("")),
});

export type TruckInput = z.infer<typeof truckSchema>;

// The RHF working type — the schema's INPUT side (before z.coerce runs). Selects
// hand RHF strings; the resolver coerces them to the TruckInput (output) shape.
export type TruckFormValues = z.input<typeof truckSchema>;
