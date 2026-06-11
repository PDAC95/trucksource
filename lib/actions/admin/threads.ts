"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createAdminClient } from "@/lib/supabase/admin";

// ADMO-04 thread freeze/unfreeze — the admin's "stop this conversation" lever.
//
// ENFORCEMENT lives in the database, not here: the 0019 messages INSERT policy
// carries a `frozen_at is null` arm, so the moment frozen_at is set, NO
// participant can write another message through ANY code path. This action
// only flips the flag (service role — participants cannot touch these columns
// through their own RLS update policy's app-side column discipline).
//
// AUDIT: every flip writes an admin_audit_log row in the same flow
// (logAdminAction THROWS on failure — an unaudited freeze must not succeed
// silently; 10-02 posture).

export type ThreadActionResult = { ok: true } | { ok: false; error: string };

export async function freezeThread({
  threadId,
  reason,
}: {
  threadId: number;
  reason: string;
}): Promise<ThreadActionResult> {
  const { adminId } = await requireAdmin();
  if (!Number.isInteger(threadId) || threadId <= 0)
    return { ok: false, error: "invalid" };
  const trimmedReason = reason?.trim() ?? "";
  if (!trimmedReason) return { ok: false, error: "reason_required" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("message_threads")
    .update({ frozen_at: new Date().toISOString(), frozen_by: adminId })
    .eq("id", threadId)
    .is("frozen_at", null) // idempotence: never re-freeze / overwrite the original freeze record
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "update_failed" };
  if (!data) return { ok: false, error: "not_found" }; // missing OR already frozen

  await logAdminAction({
    adminId,
    action: "thread_freeze",
    targetType: "thread",
    targetId: String(threadId),
    reason: trimmedReason,
  });

  revalidatePath("/admin/messages");
  revalidatePath(`/admin/messages/threads/${threadId}`);
  return { ok: true };
}

export async function unfreezeThread({
  threadId,
}: {
  threadId: number;
}): Promise<ThreadActionResult> {
  const { adminId } = await requireAdmin();
  if (!Number.isInteger(threadId) || threadId <= 0)
    return { ok: false, error: "invalid" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("message_threads")
    .update({ frozen_at: null, frozen_by: null })
    .eq("id", threadId)
    .not("frozen_at", "is", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "update_failed" };
  if (!data) return { ok: false, error: "not_found" }; // missing OR not frozen

  await logAdminAction({
    adminId,
    action: "thread_unfreeze",
    targetType: "thread",
    targetId: String(threadId),
  });

  revalidatePath("/admin/messages");
  revalidatePath(`/admin/messages/threads/${threadId}`);
  return { ok: true };
}
