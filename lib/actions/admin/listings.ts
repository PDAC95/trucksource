"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createAdminClient } from "@/lib/supabase/admin";

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
