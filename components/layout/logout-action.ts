"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Server action: clears the session then sends the user to /login (ACCT-06).
// Lives in its own 'use server' module so the client UserMenu can import and
// submit it (a 'use server' function cannot be declared inside a "use client" file).
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
