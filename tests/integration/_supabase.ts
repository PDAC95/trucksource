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
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** True only when an anon client can actually be built against Staging. */
export const INTEGRATION_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * True when the service-role key is ALSO available — required only by suites
 * that need authenticated fixtures (Staging has "Confirm email" ON, so a plain
 * signUp user cannot sign in with a password; fixtures are created confirmed
 * via the admin API instead). TEST-ONLY usage: fixtures + cleanup + reading
 * default-deny audit tables. App code never touches this path (invariant #3 —
 * the app's service-role usage stays in lib/supabase/admin.ts).
 */
export const SERVICE_INTEGRATION_ENABLED =
  INTEGRATION_ENABLED && Boolean(SUPABASE_SERVICE_ROLE_KEY);

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

/**
 * The complete, allowed shape of a public profile row (no PII).
 * Extended for the shipped non-PII columns: contact_preference (0009),
 * seller_type + display_name (0010). None is PII; all are owner-written.
 */
export const PUBLIC_PROFILE_KEYS = [
  "id",
  "username",
  "state_province",
  "country",
  "member_since",
  "username_changed_at",
  "contact_preference",
  "seller_type",
  "display_name",
] as const;

/** Fresh anon client (no cookies, no session) — the worst-case public caller. */
export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * TEST-ONLY service-role client for fixture setup/teardown (create confirmed
 * users, seed/delete listings, verify default-deny audit rows). Never used to
 * prove an RLS gate — gates are always asserted through anon/authenticated
 * clients. Throws if the key is absent; guard call sites with
 * SERVICE_INTEGRATION_ENABLED.
 */
export function serviceClient(): SupabaseClient {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY missing — fixture client unavailable",
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A disposable confirmed user fixture + a signed-in client acting as them. */
export interface TestUser {
  id: string;
  email: string;
  username: string;
  client: SupabaseClient;
}

/**
 * Create a confirmed throwaway user via the admin API (email-confirm is ON on
 * Staging, so signUp alone cannot yield a sign-in-able user), then sign in a
 * fresh anon-key client as them. The 0001 handle_new_user trigger seeds
 * profiles_public/profiles_private from the metadata. Callers MUST delete the
 * user in afterAll via deleteTestUser().
 */
export async function createTestUser(label: string): Promise<TestUser> {
  const admin = serviceClient();
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const username = `T${label}${suffix}`.slice(0, 20);
  const email = `takeoffparts.gsd+${label}${suffix}@gmail.com`;
  const password = `Pw-${suffix}-aB`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      first_name: "Throwaway",
      last_name: "Tester",
      phone: "+15555550123",
      state_province: "Texas",
      country: "USA",
      terms_accepted_at: new Date().toISOString(),
    },
  });
  if (error || !data.user) {
    throw new Error(`createTestUser(${label}) failed: ${error?.message}`);
  }

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    // Best-effort cleanup before failing the suite.
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`signIn(${label}) failed: ${signInError.message}`);
  }

  return { id: data.user.id, email, username, client };
}

/** Delete a fixture user (cascades profiles/listings/comments/saves via FKs). */
export async function deleteTestUser(
  user: TestUser | undefined,
): Promise<void> {
  if (!user) return;
  await user.client.auth.signOut().catch(() => undefined);
  await serviceClient().auth.admin.deleteUser(user.id);
}
