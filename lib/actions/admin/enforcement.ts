"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { sendEnforcementEmail } from "@/lib/admin/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { USERNAME_REGEX, isReservedUsername } from "@/lib/username/generate";

// ADMO-01 enforcement ladder: warn / suspend / ban / reactivate / rename.
//
// ANTI-PATTERN GUARD: every action gates ITSELF with requireAdmin() — the
// admin layout is UX only, never an authorization boundary. Order per action:
//   requireAdmin → zod validate → service-role writes → logAdminAction
//   (throws on failure — an unaudited action must not silently succeed) →
//   sendEnforcementEmail (best-effort) → revalidatePath.
//
// Listing hide/restore semantics (0019 §4): suspension hides with
// hidden_reason='suspension'; ban with 'ban' (overwriting 'suspension' rows);
// reactivation restores ONLY the reason matching the prior restriction state
// — 'moderation' rows are NEVER touched here.

export type EnforcementResult = { ok: true } | { ok: false; error: string };

const reasonSchema = z.string().trim().min(3).max(500);
const userIdSchema = z.string().uuid();

const SUSPEND_DURATIONS = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
} as const;

function revalidateUserSurfaces(userId: string) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

/** Warning: no state change — audit row + email carry the record. */
export async function warnUser(input: unknown): Promise<EnforcementResult> {
  const { adminId } = await requireAdmin();
  const parsed = z
    .object({ userId: userIdSchema, reason: reasonSchema })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { userId, reason } = parsed.data;

  await logAdminAction({
    adminId,
    action: "warn_user",
    targetType: "user",
    targetId: userId,
    reason,
  });
  await sendEnforcementEmail(userId, {
    subject: "Warning about your Take-Off Parts account",
    action: "warn",
    reason,
  });
  revalidateUserSurfaces(userId);
  return { ok: true };
}

/** Suspend with a preset duration; hides the user's visible listings. */
export async function suspendUser(input: unknown): Promise<EnforcementResult> {
  const { adminId } = await requireAdmin();
  const parsed = z
    .object({
      userId: userIdSchema,
      duration: z.enum(["24h", "7d", "30d"]),
      reason: reasonSchema,
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { userId, duration, reason } = parsed.data;
  if (userId === adminId)
    return { ok: false, error: "You can't suspend your own account." };

  const suspendedUntil = new Date(
    Date.now() + SUSPEND_DURATIONS[duration],
  ).toISOString();
  const admin = createAdminClient();

  const { error: upsertError } = await admin.from("user_restrictions").upsert({
    user_id: userId,
    state: "suspended",
    reason,
    suspended_until: suspendedUntil,
    created_by: adminId,
    created_at: new Date().toISOString(),
  });
  if (upsertError)
    return { ok: false, error: `Suspend failed: ${upsertError.message}` };

  // Hide currently-visible listings; reason 'suspension' so reactivation can
  // restore EXACTLY these rows (never 'moderation' ones).
  const { error: hideError } = await admin
    .from("listings")
    .update({
      hidden_at: new Date().toISOString(),
      hidden_reason: "suspension",
    })
    .eq("seller_id", userId)
    .is("hidden_at", null);
  if (hideError)
    return { ok: false, error: `Listing hide failed: ${hideError.message}` };

  await logAdminAction({
    adminId,
    action: "user_suspend",
    targetType: "user",
    targetId: userId,
    reason,
    metadata: { duration, suspended_until: suspendedUntil },
  });
  await sendEnforcementEmail(userId, {
    subject: "Your Take-Off Parts account has been suspended",
    action: "suspend",
    reason,
    until: suspendedUntil,
  });
  revalidateUserSurfaces(userId);
  return { ok: true };
}

/** Permanent ban; hides listings with reason 'ban' (overwrites 'suspension'). */
export async function banUser(input: unknown): Promise<EnforcementResult> {
  const { adminId } = await requireAdmin();
  const parsed = z
    .object({ userId: userIdSchema, reason: reasonSchema })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { userId, reason } = parsed.data;
  if (userId === adminId)
    return { ok: false, error: "You can't ban your own account." };

  const admin = createAdminClient();
  const { error: upsertError } = await admin.from("user_restrictions").upsert({
    user_id: userId,
    state: "banned",
    reason,
    suspended_until: null,
    created_by: adminId,
    created_at: new Date().toISOString(),
  });
  if (upsertError)
    return { ok: false, error: `Ban failed: ${upsertError.message}` };

  // Visible rows AND previously suspension-hidden rows become 'ban' (permanent);
  // 'moderation' rows keep their reason.
  const { error: hideError } = await admin
    .from("listings")
    .update({ hidden_at: new Date().toISOString(), hidden_reason: "ban" })
    .eq("seller_id", userId)
    .or("hidden_at.is.null,hidden_reason.eq.suspension");
  if (hideError)
    return { ok: false, error: `Listing hide failed: ${hideError.message}` };

  await logAdminAction({
    adminId,
    action: "user_ban",
    targetType: "user",
    targetId: userId,
    reason,
  });
  await sendEnforcementEmail(userId, {
    subject: "Your Take-Off Parts account has been banned",
    action: "ban",
    reason,
  });
  revalidateUserSurfaces(userId);
  return { ok: true };
}

/**
 * Lift the current restriction: delete the row and restore ONLY the listings
 * hidden by THAT restriction ('suspension' after a suspension, 'ban' after an
 * un-ban). 'moderation'-hidden listings are never touched.
 */
export async function reactivateUser(
  input: unknown,
): Promise<EnforcementResult> {
  const { adminId } = await requireAdmin();
  const parsed = z.object({ userId: userIdSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { userId } = parsed.data;

  const admin = createAdminClient();
  const { data: restriction } = await admin
    .from("user_restrictions")
    .select("state")
    .eq("user_id", userId)
    .maybeSingle();
  if (!restriction) return { ok: false, error: "This user is not restricted." };
  const priorState = (restriction as { state: "suspended" | "banned" }).state;

  const { error: deleteError } = await admin
    .from("user_restrictions")
    .delete()
    .eq("user_id", userId);
  if (deleteError)
    return { ok: false, error: `Reactivate failed: ${deleteError.message}` };

  const restoreReason = priorState === "banned" ? "ban" : "suspension";
  const { error: restoreError } = await admin
    .from("listings")
    .update({ hidden_at: null, hidden_reason: null })
    .eq("seller_id", userId)
    .eq("hidden_reason", restoreReason);
  if (restoreError)
    return {
      ok: false,
      error: `Listing restore failed: ${restoreError.message}`,
    };

  await logAdminAction({
    adminId,
    action: "user_reactivate",
    targetType: "user",
    targetId: userId,
    metadata: { prior_state: priorState },
  });
  await sendEnforcementEmail(userId, {
    subject: "Your Take-Off Parts account has been reactivated",
    action: "reactivate",
  });
  revalidateUserSurfaces(userId);
  return { ok: true };
}

/**
 * Moderation rename (e.g. offensive handle). Validates against the canonical
 * username rules; the 0001 30-day rename trigger fires for service-role
 * updates too, so the guard timestamp is cleared first (an admin rename must
 * never be blocked by the user's self-rename cooldown). The trigger then
 * re-stamps username_changed_at — the user's own 30-day window restarts.
 */
export async function renameUsername(
  input: unknown,
): Promise<EnforcementResult> {
  const { adminId } = await requireAdmin();
  const parsed = z
    .object({
      userId: userIdSchema,
      newUsername: z.string().trim().regex(USERNAME_REGEX),
      reason: reasonSchema,
    })
    .safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: "Invalid input — usernames are 3-20 letters and numbers.",
    };
  const { userId, newUsername, reason } = parsed.data;
  if (isReservedUsername(newUsername))
    return { ok: false, error: "That username is reserved." };

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("profiles_public")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  if (!current) return { ok: false, error: "User not found." };
  const oldUsername = (current as { username: string }).username;
  if (oldUsername.toLowerCase() === newUsername.toLowerCase())
    return { ok: false, error: "That is already this user's username." };

  // Step 1: clear the 30-day guard timestamp (username unchanged → the
  // trigger's rename arm does not fire for this update).
  const { error: clearError } = await admin
    .from("profiles_public")
    .update({ username_changed_at: null })
    .eq("id", userId);
  if (clearError)
    return { ok: false, error: `Rename failed: ${clearError.message}` };

  // Step 2: the actual rename (trigger re-stamps username_changed_at).
  const { error: renameError } = await admin
    .from("profiles_public")
    .update({ username: newUsername })
    .eq("id", userId);
  if (renameError) {
    if (renameError.code === "23505")
      return { ok: false, error: "That username is already taken." };
    return { ok: false, error: `Rename failed: ${renameError.message}` };
  }

  await logAdminAction({
    adminId,
    action: "username_rename",
    targetType: "user",
    targetId: userId,
    reason,
    metadata: { old_username: oldUsername, new_username: newUsername },
  });
  await sendEnforcementEmail(userId, {
    subject: "Your Take-Off Parts username has been changed",
    action: "rename",
    reason,
    newUsername,
  });
  revalidateUserSurfaces(userId);
  return { ok: true };
}
