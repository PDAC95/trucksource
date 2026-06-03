"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { registerSchema } from "@/lib/validation/auth";
import { generateUsername } from "@/lib/username/generate";

export interface RegisterState {
  error?: string;
}

// 'use server' registration action. Re-validates the SAME Zod schema the client
// uses (trust boundary), auto-generates a username when blank, then signs up
// with the 6 PII fields as metadata consumed by the handle_new_user trigger.
// Anti-enumeration: never branch the user-visible message on "already
// registered" — any non-duplicate failure returns a generic error.
export async function register(
  _prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const raw = Object.fromEntries(formData);
  // The checkbox arrives as the string "true"; coerce so z.literal(true) passes.
  const parsed = registerSchema.safeParse({
    ...raw,
    acceptTerms: raw.acceptTerms === "true" || raw.acceptTerms === "on",
  });

  if (!parsed.success) {
    return { error: "Please check the form and try again." };
  }

  const v = parsed.data;
  const supabase = await createClient();

  // citext-backed collision check reused by the generator's retry loop.
  const isTaken = async (candidate: string): Promise<boolean> => {
    const { data } = await supabase
      .from("profiles_public")
      .select("id")
      .eq("username", candidate)
      .maybeSingle();
    return !!data;
  };

  const username =
    v.username && v.username.length > 0
      ? v.username
      : await generateUsername(isTaken);

  const { error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
      data: {
        first_name: v.firstName,
        last_name: v.lastName,
        phone: v.phone,
        country: v.country,
        state_province: v.stateProvince,
        username,
        terms_accepted_at: new Date().toISOString(),
      },
    },
  });

  if (error) {
    // Generic message for ALL errors — including "already registered" — to
    // avoid account enumeration. Supabase returns an obfuscated user object for
    // existing-but-unconfirmed emails, so the happy path still routes to
    // /check-email below; only true failures land here.
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/check-email");
}
