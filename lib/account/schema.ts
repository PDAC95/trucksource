import { z } from "zod";

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
