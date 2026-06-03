"use server";

import { createClient } from "@/lib/supabase/server";
import { forgotSchema } from "@/lib/validation/auth";

export interface ForgotState {
  sent?: boolean;
  error?: string;
}

// 'use server' password-reset request. Always returns the same generic "sent"
// result whether or not the email exists (anti-enumeration). The recovery link
// redirects to /reset-password.
export async function requestPasswordReset(
  _prevState: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  // We deliberately ignore the result: never reveal whether the account exists.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
  });

  return { sent: true };
}
