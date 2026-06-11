// app/api/admin/import/route.ts — CSV bulk import endpoint (ADMO-02).
//
// A ROUTE HANDLER, not a Server Action (Research Pitfall 6): 100 rows × up to
// 8 photo fetches × sharp re-encodes outlives the default function duration,
// so we declare maxDuration. NOTE: Vercel plan limits may cap this lower than
// 300s — if a large prod import times out, run it against Staging locally
// (the UI says so). The CSV text itself is tiny and arrives via FormData —
// photos arrive by URL server-side, which dodges the known ~4.5MB Vercel
// request-body cap entirely (the locked URLs-not-uploads decision).
//
// Security: requireAdmin() FIRST — route handlers are directly invocable; the
// admin layout gate is UX only. All writes go through the service-role client
// (the admin imports on behalf of real sellers; owner RLS can't admit that).
import { NextResponse } from "next/server";
import Papa from "papaparse";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { importRow, type RowResult } from "@/lib/admin/import";

export const maxDuration = 300;

const MAX_ROWS = 100; // v1 guidance (Research Pattern 11) — split larger files

export async function POST(req: Request): Promise<NextResponse> {
  // Gate BEFORE touching the body. Non-admins get the same 404 as every other
  // admin surface (requireAdmin -> notFound()).
  const { adminId } = await requireAdmin();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No CSV file provided." },
      { status: 400 },
    );
  }

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const rows = parsed.data;
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "The CSV has no data rows." },
      { status: 400 },
    );
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      {
        error: `Too many rows (${rows.length}). Limit is ${MAX_ROWS} per file — split the file and import in parts.`,
      },
      { status: 400 },
    );
  }

  // Sequential on purpose: photo fetches dominate, and sequencing keeps memory
  // and Storage pressure flat (Pitfall 6). Row numbers are 1-based DATA rows
  // (header excluded) — matching what a spreadsheet user expects to fix.
  const admin = createAdminClient();
  const results: RowResult[] = [];
  for (let i = 0; i < rows.length; i++) {
    results.push(await importRow(admin, rows[i], i + 1));
  }

  const imported = results.filter((r) => r.ok).length;
  const failed = results.length - imported;

  // Audit the import as one event (throws on failure — an unaudited admin
  // action must not silently succeed).
  await logAdminAction({
    adminId,
    action: "csv_import",
    targetType: "import",
    targetId: file.name || "upload.csv",
    metadata: { fileName: file.name || "upload.csv", imported, failed },
  });

  return NextResponse.json({ imported, failed, results });
}
