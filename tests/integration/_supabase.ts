// Shared helpers for the privacy integration tests.
//
// These tests run against Supabase Staging using ONLY the public anon key
// (NEXT_PUBLIC_SUPABASE_*) — never the service role. They prove the privacy
// guarantee is structural (RLS + table split), not a matter of select-discipline.
//
// If the Supabase env vars are missing (e.g. CI without secrets), the suites
// self-skip via `INTEGRATION_ENABLED` so they never hard-fail a secret-less run.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True only when an anon client can actually be built against Staging. */
export const INTEGRATION_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * The PII denylist — the exact set of columns that live ONLY in profiles_private
 * and must NEVER appear in any anonymous/public response. This is the single
 * source of truth for the cross-cutting privacy gate every later phase re-runs.
 */
export const PII_KEYS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "street_address",
  "postal_code",
] as const;

/** The complete, allowed shape of a public profile row (no PII). */
export const PUBLIC_PROFILE_KEYS = [
  "id",
  "username",
  "state_province",
  "country",
  "member_since",
  "username_changed_at",
] as const;

/** Fresh anon client (no cookies, no session) — the worst-case public caller. */
export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
