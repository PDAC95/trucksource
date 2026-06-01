import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. NEVER import this into client components. The key is
// SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix) so it never reaches the
// browser bundle. Used only by app/admin/ and trusted route handlers.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
