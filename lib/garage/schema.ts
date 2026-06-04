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
 *   - nickname: optional, ≤40 chars; "" allowed (an empty field is "no nickname").
 *
 * Radix Selects emit string values, so ids are coerced with z.coerce.number()
 * (same reason register/actions.ts coerces select-driven ids).
 */
export const truckSchema = z.object({
  modelId: z.coerce.number().int().positive(),
  configId: z.coerce.number().int().positive().nullable().optional(),
  nickname: z.string().max(40).optional().or(z.literal("")),
});

export type TruckInput = z.infer<typeof truckSchema>;
