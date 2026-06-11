"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { LISTING_PHOTOS_BUCKET } from "@/lib/listings/storage";

// Admin listing moderation actions (ADMO-02). Every action:
//   1. requireAdmin() FIRST — the layout gate is UX only; THIS is the security
//      boundary (10-02 anti-pattern guard).
//   2. zod-validates its input (the client is untrusted, even the admin UI).
//   3. acts via createAdminClient() — moderation columns are service-role-only
//      (no user-facing write policy touches hidden_at/hidden_reason).
//   4. logAdminAction() BEFORE returning success (audit.ts throws on failure —
//      an unaudited admin action must not silently succeed).
//   5. revalidatePath('/admin/listings').
//
// LOCKED: the admin never edits seller content. There is no title/description/
// price write anywhere in this module — moderate (hide/restore/remove-photo/
// publish-draft) only.

const hideSchema = z.object({
  listingId: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
});

export type ModerationResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "not_found" | "update_failed" };

/**
 * Hide a listing for moderation (ADMO-02). Sets hidden_at + the 'moderation'
 * hidden_reason — the 0019 public-read policy then structurally excludes the
 * row from EVERY public surface (search RPC is security invoker, detail page
 * and feed read the table directly) while the owner keeps visibility.
 * Only un-hidden rows qualify: a suspension/ban hide is never re-labelled.
 */
export async function hideListing(input: {
  listingId: number;
  reason: string;
}): Promise<ModerationResult> {
  const { adminId } = await requireAdmin();

  const parsed = hideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { listingId, reason } = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("listings")
    .update({
      hidden_at: new Date().toISOString(),
      hidden_reason: "moderation",
    })
    .eq("id", listingId)
    .is("hidden_at", null)
    .select("id");

  if (error) return { ok: false, error: "update_failed" };
  if (!data || data.length === 0) return { ok: false, error: "not_found" };

  await logAdminAction({
    adminId,
    action: "listing_hide",
    targetType: "listing",
    targetId: String(listingId),
    reason,
  });

  // TODO(10-08): notify the seller via the enforcement email helper
  // (lib/admin/email.ts) once 10-03 lands — soft dependency, audit-only now.

  revalidatePath("/admin/listings");
  revalidatePath(`/listings/${listingId}`);
  return { ok: true };
}

const restoreSchema = z.object({
  listingId: z.number().int().positive(),
});

/**
 * Restore a MODERATION-hidden listing. Scoped to hidden_reason='moderation'
 * on purpose: suspension/ban hides are lifted by the user-reactivation flow,
 * never from the listing console (the hidden_reason column exists exactly so
 * these flows cannot undo each other).
 */
export async function restoreListing(input: {
  listingId: number;
}): Promise<ModerationResult> {
  const { adminId } = await requireAdmin();

  const parsed = restoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { listingId } = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("listings")
    .update({ hidden_at: null, hidden_reason: null })
    .eq("id", listingId)
    .eq("hidden_reason", "moderation")
    .select("id");

  if (error) return { ok: false, error: "update_failed" };
  if (!data || data.length === 0) return { ok: false, error: "not_found" };

  await logAdminAction({
    adminId,
    action: "listing_restore",
    targetType: "listing",
    targetId: String(listingId),
  });

  revalidatePath("/admin/listings");
  revalidatePath(`/listings/${listingId}`);
  return { ok: true };
}

const removePhotoSchema = z.object({
  photoId: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
});

/**
 * Remove ONE rule-violating photo: Storage object first, then the DB row,
 * then the audit row (audit failure throws — the action fails loudly).
 *
 * Deliberately does NOT auto-unpublish when the photo count drops below 3:
 * the 3-photo minimum is a publish-time gate only (Research Pattern 4).
 * Cover promotion is free: the cover is positional (lowest sort_order at
 * read time — see lib/listings/queries), so deleting the cover row makes
 * the next photo the cover with no write.
 */
export async function removeListingPhoto(input: {
  photoId: number;
  reason: string;
}): Promise<ModerationResult> {
  const { adminId } = await requireAdmin();

  const parsed = removePhotoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { photoId, reason } = parsed.data;

  const admin = createAdminClient();
  const { data: photo } = await admin
    .from("listing_photos")
    .select("id, storage_path, listing_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { ok: false, error: "not_found" };
  const row = photo as {
    id: number;
    storage_path: string;
    listing_id: number;
  };

  // Storage object first — if this fails we keep the row (retryable state);
  // an orphaned object with a live row is worse than a re-run.
  const { error: storageError } = await admin.storage
    .from(LISTING_PHOTOS_BUCKET)
    .remove([row.storage_path]);
  if (storageError) return { ok: false, error: "update_failed" };

  const { error: deleteError } = await admin
    .from("listing_photos")
    .delete()
    .eq("id", photoId);
  if (deleteError) return { ok: false, error: "update_failed" };

  await logAdminAction({
    adminId,
    action: "photo_remove",
    targetType: "photo",
    targetId: String(photoId),
    reason,
    metadata: { listingId: row.listing_id, path: row.storage_path },
  });

  revalidatePath("/admin/listings");
  revalidatePath(`/listings/${row.listing_id}`);
  return { ok: true };
}

const bulkPublishSchema = z.object({
  listingIds: z.array(z.number().int().positive()).min(1).max(500),
});

export type BulkPublishResult =
  | { ok: true; published: number }
  | { ok: false; error: "invalid" | "update_failed" };

/**
 * One-click bulk publish for draft listings (the second half of the locked
 * CSV-import flow): draft → active, stamping date_listed AND the 90-day
 * expires_at clock (0010 lifecycle — an active row without expires_at would
 * never expire). One statement, scoped to status='draft' so re-submits and
 * stray ids are no-ops; ONE audit row for the whole batch.
 */
export async function bulkPublishDrafts(input: {
  listingIds: number[];
}): Promise<BulkPublishResult> {
  const { adminId } = await requireAdmin();

  const parsed = bulkPublishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { listingIds } = parsed.data;

  const admin = createAdminClient();
  const now = new Date();
  const { data, error } = await admin
    .from("listings")
    .update({
      status: "active",
      date_listed: now.toISOString(),
      expires_at: new Date(now.getTime() + 90 * 864e5).toISOString(),
    })
    .in("id", listingIds)
    .eq("status", "draft")
    .select("id");

  if (error) return { ok: false, error: "update_failed" };
  const publishedIds = (data ?? []).map((r) => (r as { id: number }).id);

  await logAdminAction({
    adminId,
    action: "bulk_publish",
    targetType: "listing",
    targetId: publishedIds.join(",") || "none",
    metadata: { count: publishedIds.length, listingIds: publishedIds },
  });

  revalidatePath("/admin/listings");
  return { ok: true, published: publishedIds.length };
}

/**
 * Form-action wrapper for the index page's draft view: collects the checked
 * `ids` checkboxes and delegates to bulkPublishDrafts (which re-validates).
 */
export async function bulkPublishDraftsFromForm(
  formData: FormData,
): Promise<void> {
  const listingIds = formData
    .getAll("ids")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (listingIds.length === 0) return;
  await bulkPublishDrafts({ listingIds });
}
