import { requireAdmin } from "@/lib/admin/auth";
import { ImportForm } from "@/components/admin/import-form";

// CSV bulk import (ADMO-02) — the cold-start onboarding surface. Valid rows
// become DRAFT listings owned by the real seller referenced per row; drafts
// are then reviewed + bulk-published from /admin/listings?status=draft.
export const dynamic = "force-dynamic";

export default async function AdminImportPage() {
  await requireAdmin(); // security gate — the layout gate is UX only

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CSV Import</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bulk-import listings as drafts for real seller accounts. Photos are
          fetched from the URLs in the file and EXIF/GPS-stripped through the
          same pipeline as regular uploads.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
