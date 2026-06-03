import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { USERNAME_REGEX, isReservedUsername } from "@/lib/username/generate";

// Live username availability check used by the registration form's username
// field (debounced client-side). Anon-safe: only ever reads `id` from the
// world-readable `profiles_public` table; never touches PII.
export async function GET(request: NextRequest) {
  const candidate = request.nextUrl.searchParams.get("u")?.trim() ?? "";

  // Format-check first so we never hit the DB for obviously invalid input.
  if (!USERNAME_REGEX.test(candidate)) {
    return NextResponse.json({ available: false, reason: "invalid" });
  }
  if (isReservedUsername(candidate)) {
    return NextResponse.json({ available: false, reason: "reserved" });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles_public")
    .select("id")
    .eq("username", candidate) // citext column => case-insensitive compare
    .maybeSingle();

  if (error) {
    // Fail closed: don't claim "available" if we couldn't verify.
    return NextResponse.json({ available: false, reason: "error" });
  }

  return NextResponse.json({ available: !data });
}
