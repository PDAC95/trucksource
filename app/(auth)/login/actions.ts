"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";

export interface LoginState {
  error?: string;
}

// 'use server' login action. Re-validates loginSchema (trust boundary), then
// signInWithPassword. Session persistence is the @supabase/ssr default (no
// "remember me"). Generic error message — never reveal whether the email exists
// or the password was wrong specifically.
export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Invalid email or password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Invalid email or password." };
  }

  // Land on the (app) home/feed.
  redirect("/");
}
