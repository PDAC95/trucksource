// Shared Zod schemas for Phase 9 (contact form, chat message, report) — the
// SAME schema validates on the client (UX) and inside the Server Action (trust
// boundary). Single client+server source of truth (CLAUDE.md invariant),
// mirroring lib/comments/schema.ts.
import { z } from "zod";

/**
 * The maximum message/contact body length. SINGLE SHARED CONSTANT — MUST equal
 * the DB CHECK on messages.body (migration 0016_messaging.sql:
 * `char_length(body) between 1 and 2000`). If the DB CHECK ever changes,
 * change BOTH (DB-zod lockstep, 08-02 precedent).
 */
export const MESSAGE_MAX_LENGTH = 2000;

/**
 * The contact form a buyer submits before a thread opens (MSG-01/02).
 *   - listingId: coerced (route params/hidden inputs hand strings).
 *   - name/email: the buyer's contact info — persisted to contact_log ONLY
 *     (the trust record the seller may read); never to messages.
 *   - phone: optional; empty string normalizes to undefined.
 *   - message: becomes both contact_log.message_text and the thread's first
 *     messages row — so it shares MESSAGE_MAX_LENGTH.
 */
export const contactSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  message: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});

export type ContactInput = z.infer<typeof contactSchema>;

/**
 * A chat message sent inside an existing thread (MSG-03).
 */
export const messageSchema = z.object({
  threadId: z.coerce.number().int().positive(),
  body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});

export type MessageInput = z.infer<typeof messageSchema>;

/**
 * Report reasons — MUST match the DB CHECK on reports.reason in
 * 0016_messaging.sql exactly. Labels are the UI dropdown copy (English only).
 */
export const REPORT_REASONS = [
  { value: "scam_fraud", label: "Scam / Fraud" },
  { value: "harassment", label: "Harassment" },
  { value: "spam", label: "Spam" },
  { value: "prohibited_item", label: "Prohibited item" },
  { value: "wrong_info", label: "Wrong info" },
  { value: "other", label: "Other" },
] as const;

/**
 * A report against a listing, comment, or message (MSG-07). The exclusive-arc
 * target (exactly one of listing/comment/message) and one-report-per-item are
 * enforced structurally in the DB; this schema shapes the action input.
 */
export const reportSchema = z.object({
  targetType: z.enum(["listing", "comment", "message"]),
  targetId: z.coerce.number().int().positive(),
  reason: z.enum([
    "scam_fraud",
    "harassment",
    "spam",
    "prohibited_item",
    "wrong_info",
    "other",
  ]),
  detail: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type ReportInput = z.infer<typeof reportSchema>;
