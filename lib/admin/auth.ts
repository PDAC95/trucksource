import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// THE ONE admin gate (ADMO-01). Every admin surface — the app/admin layout
// (UX gate) AND every admin Server Action / route handler (security gate) —
// calls this. Layouts do not re-run on every nested navigation and are NOT an
// authorization boundary on their own.
//
// Identity: getClaims() verifies the JWT locally — NEVER getSession(), which
// trusts unverified cookie data (invariant #6). The admin flag lives in
// app_metadata.role, which is service-role-writable ONLY (users cannot
// self-modify it, unlike user_metadata) and rides in the verified token, so
// the check costs zero extra queries.
//
// Non-admins (and anon) get notFound() — a 404, never a login hint. The
// console's existence is not advertised.
export async function requireAdmin(): Promise<{ adminId: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const role = (claims?.app_metadata as { role?: string } | undefined)?.role;
  if (!claims?.sub || role !== "admin") notFound();
  return { adminId: claims.sub };
}
