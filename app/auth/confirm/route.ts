import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET token-exchange for email confirmation AND password recovery links.
// Lives at app/auth/confirm/route.ts (NOT inside the (auth) group) so its URL
// is exactly /auth/confirm — the path on the Supabase redirect allowlist.
// On success it establishes the session (verifyOtp sets the auth cookies via
// the SSR client) and redirects to `next`; otherwise to /auth-code-error.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Recovery links land on the set-new-password page; everything else home.
  const next =
    searchParams.get("next") ?? (type === "recovery" ? "/reset-password" : "/");

  const redirectTo = request.nextUrl.clone();
  redirectTo.search = "";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      redirectTo.pathname = next;
      return NextResponse.redirect(redirectTo);
    }
  }

  redirectTo.pathname = "/auth-code-error";
  return NextResponse.redirect(redirectTo);
}
