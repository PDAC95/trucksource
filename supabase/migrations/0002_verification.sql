-- 0002_verification.sql
-- Phase 2 — Verified Seller / Phone-OTP.
-- Extends the Phase-1 schema (0001_foundation_privacy.sql) with the DB foundation for:
--   * phone-OTP verification        (phone_verified_at)
--   * marketplace-terms acceptance  (marketplace_terms_accepted_at + terms_version, VERF-03)
--   * anti-abuse / rate-limit store  (otp_send_attempts, abuse_events — service-role only)
--   * the server-computed Verified Seller badge (is_verified_seller(), VERF-04)
--
-- Privacy invariants preserved (CLAUDE.md):
--   - phone stays PII: it lives ONLY in profiles_private (owner-only RLS). The public
--     surface NEVER sees the phone — only the derived badge boolean via RPC.
--   - RLS is enabled in the SAME migration that creates each new table (default-deny).
--   - The badge is NEVER a stored "is_verified=true" column (the "verification is
--     permanent" anti-pattern CONTEXT forbids). It is recomputed from three live signals,
--     so clearing any one (e.g. phone change clears phone_verified_at) auto-revokes it.
-- Function style mirrors active_listing_count(uuid) from 0001 verbatim
-- (`security definer set search_path = ''`, granted to anon + authenticated).

-- 1) Extend profiles_private (PII, owner-only RLS) -----------------------------

-- The registration phone is now an UNVERIFIED pre-fill convenience: verification is
-- keyed on phone_verified_at (set only when Twilio returns 'approved'), NOT on phone
-- presence. So phone is no longer required at signup.
alter table public.profiles_private alter column phone drop not null;

-- Set only when Twilio Verify returns 'approved'. Cleared on phone change → badge flips false.
alter table public.profiles_private add column phone_verified_at timestamptz;

-- The marketplace/selling terms acceptance (VERF-03). DISTINCT from the existing
-- registration/account terms_accepted_at — the badge keys on THIS column, never on
-- the registration phone or the registration terms_accepted_at.
alter table public.profiles_private add column marketplace_terms_accepted_at timestamptz;

-- Which marketplace-terms version the user accepted (audit trail for re-acceptance).
alter table public.profiles_private add column terms_version text;

comment on column public.profiles_private.phone_verified_at is
  'Set only when Twilio Verify returns approved. Cleared on phone change → Verified badge auto-revokes. The badge keys on THIS, never on phone presence.';
comment on column public.profiles_private.marketplace_terms_accepted_at is
  'Marketplace/selling terms acceptance (VERF-03). DISTINCT from registration terms_accepted_at; the badge keys on THIS column.';
comment on column public.profiles_private.terms_version is
  'Version of the marketplace terms accepted (audit trail).';

-- 2) otp_send_attempts — rate-limit + spend-cap counter store ------------------
-- Written/read ONLY by the service-role admin client (server-only; lib/verify/ratelimit.ts,
-- Plan 03). It therefore has RLS enabled with NO anon/authenticated policy: default-deny
-- (no policy) is the correct and intentional access model — the public key can never touch it.
create table public.otp_send_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text not null,
  ip text not null,
  created_at timestamptz not null default now()
);
create index otp_send_attempts_phone_idx   on public.otp_send_attempts (phone_e164, created_at);
create index otp_send_attempts_ip_idx      on public.otp_send_attempts (ip, created_at);
create index otp_send_attempts_created_idx on public.otp_send_attempts (created_at);

alter table public.otp_send_attempts enable row level security;
-- Intentionally NO policies: service-role-only table (default-deny for anon + authenticated).

-- 3) abuse_events — spend-cap breaches + blocked-bot records for Phase-10 admin queue
-- Same access model as otp_send_attempts: service-role-only, RLS enabled, no policies.
create table public.abuse_events (
  id bigint generated always as identity primary key,
  kind text not null,            -- 'spend_cap' | 'rate_limited' | 'bot_blocked' | 'region_blocked'
  user_id uuid references auth.users(id) on delete set null,
  phone_e164 text,
  ip text,
  detail jsonb,
  created_at timestamptz not null default now()
);

alter table public.abuse_events enable row level security;
-- Intentionally NO policies: service-role-only table (default-deny for anon + authenticated).

-- 4) is_verified_seller(profile_id) — the server-computed Verified badge (VERF-04) --
-- Authored from 02-RESEARCH.md Pattern 4, but keyed on marketplace_terms_accepted_at
-- (the selling terms, VERF-03) rather than the registration terms_accepted_at.
-- Mirrors active_listing_count exactly: a SECURITY DEFINER function the public profile
-- page calls via RPC so only the derived boolean — never any PII — is ever exposed.
-- NO stored is_verified column: the badge is recomputed each read, so clearing any of the
-- three live signals (email_confirmed_at, phone_verified_at, marketplace_terms_accepted_at)
-- auto-revokes it. VERF-01 contributes email_confirmed_at as the first input.
create or replace function public.is_verified_seller(profile_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select
    coalesce((select u.email_confirmed_at is not null
              from auth.users u where u.id = profile_id), false)
    and coalesce((select p.phone_verified_at is not null
                  from public.profiles_private p where p.id = profile_id), false)
    and coalesce((select p.marketplace_terms_accepted_at is not null
                  from public.profiles_private p where p.id = profile_id), false);
$$;

grant execute on function public.is_verified_seller(uuid) to anon, authenticated;
