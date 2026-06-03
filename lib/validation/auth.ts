// Shared Zod schemas — the SAME schema validates on the client (UX) and inside
// the Server Action (trust boundary). Never duplicate validation rules.
import { z } from "zod";
import { USERNAME_REGEX } from "@/lib/username/generate";

// Re-export the single source of truth so callers can import it from here too.
export { USERNAME_REGEX };

export const registerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(7),
  country: z.enum(["USA", "Canada"]),
  stateProvince: z.string().min(1),
  // A valid handle OR empty string (the empty case triggers auto-generation).
  username: z.string().regex(USERNAME_REGEX).optional().or(z.literal("")),
  password: z.string().min(8),
  acceptTerms: z.literal(true),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotSchema = z.object({
  email: z.string().email(),
});

export const resetSchema = z.object({
  password: z.string().min(8),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotInput = z.infer<typeof forgotSchema>;
export type ResetInput = z.infer<typeof resetSchema>;
