"use client";

// CSV import form + results report (ADMO-02). Client component: it needs
// upload progress state and renders the per-row failure table after the
// route handler responds. The column reference below MUST stay in sync with
// csvRowSchema in lib/admin/import.ts (the single validation truth).
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

type RowResult =
  | { row: number; context: string; ok: true; listingId: number }
  | { row: number; context: string; ok: false; error: string };

type ImportResponse = {
  imported?: number;
  failed?: number;
  results?: RowResult[];
  error?: string;
};

// Keep in sync with csvRowSchema (lib/admin/import.ts).
const COLUMNS: { name: string; required: string; notes: string }[] = [
  {
    name: "seller",
    required: "Yes",
    notes:
      "Username or email of the REAL registered seller who will own the listing (contact flows to them).",
  },
  { name: "title", required: "Yes", notes: "1–120 characters." },
  { name: "part_number", required: "No", notes: "Up to 80 characters." },
  {
    name: "asking_price",
    required: "Yes",
    notes: "Positive USD amount, at most 2 decimals (e.g. 1250.50).",
  },
  {
    name: "condition",
    required: "Yes",
    notes:
      "Condition NAME exactly as in the Fitment Library (active values only).",
  },
  {
    name: "shipping_option",
    required: "Yes",
    notes:
      "One of: shipping_available, local_pickup, shipping_assistance (spaces and case are tolerated).",
  },
  { name: "damage_notes", required: "No", notes: "Up to 2000 characters." },
  {
    name: "is_barnyard",
    required: "No",
    notes: "yes/true/1 marks The Barnyard. Blank means no.",
  },
  {
    name: "fitments",
    required: "Unless Barnyard",
    notes:
      '"Make Model" entries separated by ";", optional ":Config" suffix — e.g. "Peterbilt 379;Kenworth W900:Aerodyne".',
  },
  {
    name: "categories",
    required: "No",
    notes: 'Part-category names separated by ";".',
  },
  {
    name: "photo_url_1 … photo_url_8",
    required: "No",
    notes:
      "https URLs only, max 10MB each (JPG/PNG/WebP). Photos are downloaded server-side and EXIF/GPS-stripped before storage.",
  },
];

export function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    failed: number;
    failures: Extract<RowResult, { ok: false }>[];
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/import", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as ImportResponse;

      if (!res.ok || json.results == null) {
        setErrorMsg(json.error ?? `Import failed (${res.status}).`);
        return;
      }
      setResult({
        imported: json.imported ?? 0,
        failed: json.failed ?? 0,
        failures: json.results.filter(
          (r): r is Extract<RowResult, { ok: false }> => !r.ok,
        ),
      });
    } catch {
      setErrorMsg(
        "Import request failed — if this was a large file on production, the function may have timed out. Try a smaller file or run the import against Staging locally.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Column reference (expandable) */}
      <div className="rounded-lg border">
        <button
          type="button"
          onClick={() => setShowColumns((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-accent/50"
        >
          {showColumns ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
          CSV column reference
        </button>
        {showColumns && (
          <div className="overflow-x-auto border-t">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-3 py-2 font-medium">Column</th>
                  <th className="px-3 py-2 font-medium">Required</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {COLUMNS.map((c) => (
                  <tr
                    key={c.name}
                    className="border-b last:border-b-0 align-top"
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                      {c.name}
                    </td>
                    <td className="px-3 py-2">{c.required}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {c.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-muted-foreground">
              First row must be the header. Max 100 data rows per file — split
              larger imports. Valid rows import as <strong>drafts</strong>; fix
              and re-upload only the failed rows.
            </p>
          </div>
        )}
      </div>

      {/* Upload form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-sm">
          <FileSpreadsheet className="size-5 text-muted-foreground" />
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
            aria-label="CSV file"
          />
        </label>
        <Button type="submit" disabled={!file || busy}>
          {busy ? "Importing…" : "Import CSV"}
        </Button>
        {busy && (
          <p className="text-sm text-muted-foreground">
            Importing — this can take a few minutes for files with many photos.
            Keep this tab open.
          </p>
        )}
      </form>

      {errorMsg && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {/* Results report */}
      {result && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-sm font-medium">
              Imported {result.imported} row{result.imported === 1 ? "" : "s"}{" "}
              as drafts · {result.failed} failed
            </p>
            {result.imported > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                Review and publish the imported drafts on the{" "}
                <Link
                  href="/admin/listings?status=draft"
                  className="font-medium underline"
                >
                  draft listings page
                </Link>
                .
              </p>
            )}
          </div>

          {result.failures.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="w-16 px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Seller — Title</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.failures.map((f) => (
                    <tr
                      key={f.row}
                      className="border-b last:border-b-0 align-top"
                    >
                      <td className="px-3 py-2 font-mono text-xs">{f.row}</td>
                      <td className="max-w-[20rem] px-3 py-2 text-muted-foreground">
                        {f.context}
                      </td>
                      <td className="px-3 py-2">{f.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Fix only these rows in your spreadsheet and upload a CSV with
                just the corrected rows — successful rows are already imported.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
