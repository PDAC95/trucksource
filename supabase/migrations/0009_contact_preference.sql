-- 0009_contact_preference.sql
--
-- LIST-07: a seller's account-level contact preference — one of three contact
-- modes, set ONCE in account settings (not per-listing). Default is the
-- most-private option (Marketplace Messaging Only), per 05-CONTEXT.
--
-- WHY profiles_public (not profiles_private):
--   contact_preference is a NON-PII enum (it names a contact MODE, not any
--   email/phone). Phase-9's contact flow must read it to decide which surface to
--   show a buyer, so it belongs on the world-readable table. The actual
--   email/phone it governs stay in profiles_private and are NEVER exposed here.
--
-- WHY no new policy:
--   profiles_public already has an owner-update policy from 0001
--   ("owner updates own public profile" — (select auth.uid()) = id), so the
--   owner-scoped write of contact_preference is already covered. Anon has no
--   update policy → anon cannot change it (proven by the RLS test in this plan).
alter table public.profiles_public
  add column if not exists contact_preference text not null
    default 'messaging_only'
    check (contact_preference in ('email_only', 'email_phone', 'messaging_only'));
