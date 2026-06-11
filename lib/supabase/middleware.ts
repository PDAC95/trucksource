import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // Expose the pathname to server layouts via a request header: the (app)
  // layout's suspension gate needs it to allow read-only /messages access for
  // suspended users (ADMO-01). Mutating request.headers here propagates
  // through every NextResponse.next({ request }) below.
  request.headers.set("x-pathname", request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // No credentials configured. Before .env.local is wired this is expected,
  // so skip session refresh instead of crashing every request. In production,
  // though, missing env vars are a real misconfiguration that would silently
  // run the whole app unauthenticated — fail loudly there instead.
  if (!url || !anonKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Supabase env vars missing in production: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refreshes the auth token. getUser() contacts the Auth server (verified);
  // do not use getSession() here.
  await supabase.auth.getUser();

  return supabaseResponse;
}
