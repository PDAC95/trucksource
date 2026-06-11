import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// THE ONE audit writer. Every enforcement / taxonomy / content-access admin
// action calls logAdminAction() in the same logical flow BEFORE returning
// success. admin_audit_log is default-deny RLS with ZERO policies — service
// role only, both directions — so the insert goes through createAdminClient().
//
// Retention: forever in v1. An audit log you prune is not an audit log.

/** The locked admin action vocabulary (Research Pattern 10). */
export type AdminAction =
  | "listing_hide"
  | "listing_restore"
  | "photo_remove"
  | "user_suspend"
  | "user_ban"
  | "user_reactivate"
  | "username_rename"
  | "warn_user"
  | "report_resolve"
  | "report_dismiss"
  | "thread_freeze"
  | "thread_unfreeze"
  | "thread_content_access"
  | "taxonomy_create"
  | "taxonomy_update"
  | "taxonomy_deactivate"
  | "taxonomy_delete"
  | "csv_import"
  | "bulk_publish";

export type AdminAuditEntry = {
  adminId: string;
  action: AdminAction;
  targetType:
    | "user"
    | "listing"
    | "photo"
    | "report_group"
    | "thread"
    | "taxonomy"
    | "import";
  /** text on purpose: covers uuid, bigint and composite targets. */
  targetId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Write one admin_audit_log row. THROWS on insert failure — an unaudited
 * admin action must not silently succeed; callers let the error propagate
 * (or fail the action) rather than swallowing it.
 */
export async function logAdminAction(entry: AdminAuditEntry): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("admin_audit_log").insert({
    admin_id: entry.adminId,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId,
    reason: entry.reason ?? null,
    metadata: entry.metadata ?? {},
  });
  if (error) {
    throw new Error(
      `admin audit write failed (${entry.action}): ${error.message}`,
    );
  }
}
