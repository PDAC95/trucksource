"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { parseTargetKey, targetColumn } from "@/lib/admin/reports-queries";
import { createAdminClient } from "@/lib/supabase/admin";

// ADMO-03 queue workflow — the LOCKED group semantics:
//
//   One action resolves ALL pending reports on the target. Resolve and dismiss
//   are a single service-role UPDATE over every status='pending' row of the
//   target's arc column — there is no per-report workflow. The admin note is
//   required and lands on every row it touched, so the resolved/dismissed
//   views can show it.
//
//   Enforcement (hide listing / warn / suspend / ban / freeze) is a SEPARATE,
//   explicit action reusing 10-03/10-04/10-07 — resolving never auto-enforces
//   and enforcing never auto-resolves.
//
// AUDIT: 'report_resolve' / 'report_dismiss' with { targetKey, count }
// metadata; logAdminAction THROWS on failure (10-02 posture).

export type ReportActionResult = { ok: true } | { ok: false; error: string };

async function closeReportGroup(
  status: "resolved" | "dismissed",
  action: "report_resolve" | "report_dismiss",
  { targetKey, adminNote }: { targetKey: string; adminNote: string },
): Promise<ReportActionResult> {
  const { adminId } = await requireAdmin();

  const parsed = parseTargetKey(targetKey);
  if (!parsed) return { ok: false, error: "invalid" };
  const note = adminNote?.trim() ?? "";
  if (!note) return { ok: false, error: "note_required" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reports")
    .update({
      status,
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
      admin_note: note,
    })
    .eq(targetColumn(parsed.type), parsed.id)
    .eq("status", "pending") // only pending rows flip — closed history is immutable
    .select("id");
  if (error) return { ok: false, error: "update_failed" };
  const count = (data ?? []).length;
  if (count === 0) return { ok: false, error: "not_found" }; // nothing pending (already handled?)

  await logAdminAction({
    adminId,
    action,
    targetType: "report_group",
    targetId: targetKey,
    reason: note,
    metadata: { targetKey, count },
  });

  revalidatePath("/admin/reports");
  revalidatePath(`/admin/reports/${encodeURIComponent(targetKey)}`);
  return { ok: true };
}

export async function resolveReportGroup(input: {
  targetKey: string;
  adminNote: string;
}): Promise<ReportActionResult> {
  return closeReportGroup("resolved", "report_resolve", input);
}

export async function dismissReportGroup(input: {
  targetKey: string;
  adminNote: string;
}): Promise<ReportActionResult> {
  return closeReportGroup("dismissed", "report_dismiss", input);
}
