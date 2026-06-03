"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resetSchema } from "@/lib/validation/auth";

export interface ResetState {
  error?: string;
}

// 'use server' set-new-password action. The recovery link has already
// established a session (recovery type) by the time this runs, so updateUser
// applies to the authenticated user. Re-validates resetSchema (min 8).
export async function resetPassword(
  _prevState: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      error: "Could not update your password. Request a new reset link.",
    };
  }

  redirect("/login?reset=success");
}
