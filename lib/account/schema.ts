import { z } from "zod";
import { SELLER_TYPES } from "@/lib/seller/badge";

// LIST-07 contact-preference contract — the single client+server source of truth
// (the form validates with it for UX, updateContactPreference re-validates with
// the SAME schema at the trust boundary). The three values mirror the CHECK in
// migration 0009 on profiles_public.contact_preference.
//
//   messaging_only — Marketplace Messaging Only (the most-private DEFAULT)
//   email_only     — share email through the contact flow
//   email_phone    — share email + phone through the contact flow
//
// This is a NON-PII enum (it names a contact MODE, not any email/phone). The
// email/phone it unlocks live in profiles_private and are never touched here.
export const CONTACT_PREFERENCES = [
  "email_only",
  "email_phone",
  "messaging_only",
] as const;

export type ContactPreference = (typeof CONTACT_PREFERENCES)[number];

export const contactPreferenceSchema = z.object({
  contactPreference: z.enum(CONTACT_PREFERENCES),
});

export type ContactPreferenceInput = z.infer<typeof contactPreferenceSchema>;

// ACCT-07 seller-type contract. The 7 values come from lib/seller/badge.ts (the
// single source of truth shared with Phase 7's feed/search card). Nullable
// because clearing the badge (empty = no badge, CONTEXT lock) is valid.
export const sellerTypeSchema = z.object({
  sellerType: z.enum(SELLER_TYPES).nullable(),
});

export type SellerTypeInput = z.infer<typeof sellerTypeSchema>;

// ACCT-08 public display-name contract. v1 validation is length/trim/non-empty
// ONLY — no blocklist (abuse handled via report/admin in Phase 9/10). Reveal: a
// non-empty trimmed 1-50 string. Revert: explicit null (restores the anonymous
// handle — see resolvePublicName in lib/seller/badge.ts).
export const displayNameSchema = z.object({
  displayName: z.string().trim().min(1).max(50).nullable(),
});

export type DisplayNameInput = z.infer<typeof displayNameSchema>;

// MSG (new-message email notifications) preference contract. `enabled: true`
// means "email me about new messages" (the DEFAULT) and maps to
// profiles_private.message_email_opt_out = false — the column stores the
// OPT-OUT, the UI exposes the positive toggle.
export const messageEmailSchema = z.object({
  enabled: z.boolean(),
});

export type MessageEmailInput = z.infer<typeof messageEmailSchema>;
