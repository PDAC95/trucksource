"use client";

// Generic taxonomy CRUD table (ADMO-05) — ONE client component serves every
// non-slang level, its add/edit form generated from the TAXONOMY_LEVELS config
// (RHF + zod). Lifecycle: Deactivate hides a value from NEW-listing pickers
// only (existing listings keep it); Delete is FK-guarded server-side and
// surfaces the "in use — deactivate instead" message.

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";

import type { TaxonomyLevel } from "@/lib/admin/taxonomy-config";
import {
  createValue,
  deleteValue,
  setActive,
  updateValue,
} from "@/lib/actions/admin/taxonomy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export type ParentOption = { id: number; name: string };

export type TaxonomyRowData = {
  id: number;
  isActive: boolean;
  parentId: number | null;
  values: Record<string, string | number | null>;
};

// All form fields are strings (inputs/selects); the submit handler converts.
type FormValues = Record<string, string>;

function buildSchema(level: TaxonomyLevel): z.ZodType<FormValues, FormValues> {
  const shape: Record<string, z.ZodType<string>> = {};
  for (const col of level.columns) {
    if (col.kind === "text") {
      shape[col.key] = col.required
        ? z.string().trim().min(1, `${col.label} is required.`).max(120)
        : z.string().trim().max(120);
    } else {
      shape[col.key] = z
        .string()
        .regex(/^\d*$/, `${col.label} must be a whole number.`);
    }
  }
  if (level.parent) {
    shape[level.parent.column] = level.parent.required
      ? z.string().min(1, `${level.parent.label} is required.`)
      : z.string();
  }
  return z.object(shape) as unknown as z.ZodType<FormValues, FormValues>;
}

function emptyDefaults(level: TaxonomyLevel): FormValues {
  const d: FormValues = {};
  for (const col of level.columns) d[col.key] = "";
  if (level.parent) d[level.parent.column] = "";
  return d;
}

function rowDefaults(level: TaxonomyLevel, row: TaxonomyRowData): FormValues {
  const d: FormValues = {};
  for (const col of level.columns)
    d[col.key] = String(row.values[col.key] ?? "");
  if (level.parent) d[level.parent.column] = row.parentId?.toString() ?? "";
  return d;
}

function toActionValues(
  level: TaxonomyLevel,
  form: FormValues,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const col of level.columns) {
    const v = form[col.key] ?? "";
    if (col.kind === "number") values[col.key] = v === "" ? null : Number(v);
    else values[col.key] = v;
  }
  if (level.parent) {
    const v = form[level.parent.column] ?? "";
    values[level.parent.column] = v === "" ? null : Number(v);
  }
  return values;
}

export function TaxonomyCrud({
  level,
  rows,
  parentOptions,
}: {
  level: TaxonomyLevel;
  rows: TaxonomyRowData[];
  parentOptions: ParentOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [dialog, setDialog] = React.useState<
    { mode: "add" } | { mode: "edit"; row: TaxonomyRowData } | null
  >(null);
  const [deleting, setDeleting] = React.useState<TaxonomyRowData | null>(null);
  const [pendingId, setPendingId] = React.useState<number | null>(null);

  const parentName = React.useMemo(
    () => new Map(parentOptions.map((p) => [p.id, p.name])),
    [parentOptions],
  );

  // part_categories renders as an indented tree (roots first, children under
  // their parent); everything else is the flat library order from the server.
  const displayRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (r: TaxonomyRowData) =>
      String(r.values[level.nameColumn] ?? "")
        .toLowerCase()
        .includes(q);

    if (level.parent?.optionsTable !== "part_categories") {
      const flat = q ? rows.filter(matches) : rows;
      return flat.map((r) => ({ row: r, depth: 0 }));
    }

    const byParent = new Map<number | null, TaxonomyRowData[]>();
    for (const r of rows) {
      const list = byParent.get(r.parentId) ?? [];
      list.push(r);
      byParent.set(r.parentId, list);
    }
    const out: { row: TaxonomyRowData; depth: number }[] = [];
    const walk = (parentId: number | null, depth: number) => {
      for (const r of byParent.get(parentId) ?? []) {
        out.push({ row: r, depth });
        walk(r.id, depth + 1);
      }
    };
    walk(null, 0);
    // Searching a tree: keep matches (flattened, no indent confusion).
    return q
      ? out
          .filter(({ row }) => matches(row))
          .map(({ row }) => ({ row, depth: 0 }))
      : out;
  }, [rows, search, level]);

  async function run(
    id: number,
    fn: () => Promise<{ ok: boolean } & { error?: string }>,
    okMsg: string,
  ) {
    setPendingId(id);
    const result = await fn();
    setPendingId(null);
    if (result.ok) {
      toast.success(okMsg);
      router.refresh();
    } else {
      toast.error(
        ("error" in result && result.error) || "Something went wrong.",
      );
    }
    return result.ok;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${level.label.toLowerCase()}…`}
            className="pl-8"
          />
        </div>
        <Button onClick={() => setDialog({ mode: "add" })}>
          <Plus className="size-4" />
          Add {level.singular.toLowerCase()}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">
                {level.columns[0]?.label ?? "Name"}
              </th>
              {level.parent && (
                <th className="px-3 py-2 font-medium">{level.parent.label}</th>
              )}
              {level.columns.some((c) => c.key === "sort_order") && (
                <th className="px-3 py-2 font-medium">Sort</th>
              )}
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-muted-foreground px-3 py-8 text-center"
                >
                  {search ? "No matches." : "No values yet."}
                </td>
              </tr>
            )}
            {displayRows.map(({ row, depth }) => (
              <tr
                key={row.id}
                className={cn(
                  "border-b last:border-0",
                  !row.isActive && "opacity-60",
                )}
              >
                <td className="px-3 py-2">
                  <span style={{ paddingLeft: `${depth * 1.25}rem` }}>
                    {String(row.values[level.nameColumn] ?? "")}
                  </span>
                </td>
                {level.parent && (
                  <td className="text-muted-foreground px-3 py-2">
                    {row.parentId != null
                      ? (parentName.get(row.parentId) ?? `#${row.parentId}`)
                      : "—"}
                  </td>
                )}
                {level.columns.some((c) => c.key === "sort_order") && (
                  <td className="text-muted-foreground px-3 py-2">
                    {String(row.values.sort_order ?? 0)}
                  </td>
                )}
                <td className="px-3 py-2">
                  {row.isActive ? (
                    <Badge variant="outline">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialog({ mode: "edit", row })}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pendingId === row.id}
                      onClick={() =>
                        run(
                          row.id,
                          () =>
                            setActive({
                              level: level.slug,
                              id: row.id,
                              active: !row.isActive,
                            }),
                          row.isActive
                            ? "Deactivated — hidden from new-listing pickers. Existing listings keep it."
                            : "Reactivated.",
                        )
                      }
                    >
                      {row.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleting(row)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog && (
        <ValueFormDialog
          level={level}
          parentOptions={parentOptions}
          editingRow={dialog.mode === "edit" ? dialog.row : null}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      )}

      <AlertDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “
              {deleting ? String(deleting.values[level.nameColumn] ?? "") : ""}
              ”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Hard delete only works when nothing references this value. If it
              is in use, deactivate it instead — existing listings keep it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const row = deleting;
                setDeleting(null);
                if (!row) return;
                await run(
                  row.id,
                  () => deleteValue({ level: level.slug, id: row.id }),
                  "Deleted.",
                );
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ValueFormDialog({
  level,
  parentOptions,
  editingRow,
  onClose,
  onSaved,
}: {
  level: TaxonomyLevel;
  parentOptions: ParentOption[];
  editingRow: TaxonomyRowData | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const schema = React.useMemo(() => buildSchema(level), [level]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: editingRow
      ? rowDefaults(level, editingRow)
      : emptyDefaults(level),
  });
  const [submitting, setSubmitting] = React.useState(false);

  const onSubmit = form.handleSubmit(async (data) => {
    setSubmitting(true);
    const values = toActionValues(level, data);
    const result = editingRow
      ? await updateValue({ level: level.slug, id: editingRow.id, values })
      : await createValue({ level: level.slug, values });
    setSubmitting(false);
    if (result.ok) {
      toast.success(editingRow ? "Saved." : "Created.");
      onSaved();
    } else {
      toast.error(result.error);
    }
  });

  // Editing a category: it can't be its own parent.
  const selectableParents = editingRow
    ? parentOptions.filter((p) => p.id !== editingRow.id)
    : parentOptions;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingRow
              ? `Edit ${level.singular.toLowerCase()}`
              : `Add ${level.singular.toLowerCase()}`}
          </DialogTitle>
          <DialogDescription>
            {editingRow
              ? "Changes apply everywhere this value is shown."
              : `New ${level.singular.toLowerCase()} values are active immediately.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          {level.parent && (
            <div className="grid gap-1.5">
              <Label htmlFor={`field-${level.parent.column}`}>
                {level.parent.label}
                {!level.parent.required && (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    (optional)
                  </span>
                )}
              </Label>
              <select
                id={`field-${level.parent.column}`}
                {...form.register(level.parent.column)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">
                  {level.parent.required
                    ? `Select a ${level.parent.label.toLowerCase()}…`
                    : "None (root)"}
                </option>
                {selectableParents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {form.formState.errors[level.parent.column] && (
                <p className="text-destructive text-xs">
                  {form.formState.errors[level.parent.column]?.message}
                </p>
              )}
            </div>
          )}

          {level.columns.map((col) => (
            <div key={col.key} className="grid gap-1.5">
              <Label htmlFor={`field-${col.key}`}>
                {col.label}
                {!col.required && (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    (optional)
                  </span>
                )}
              </Label>
              <Input
                id={`field-${col.key}`}
                inputMode={col.kind === "number" ? "numeric" : undefined}
                {...form.register(col.key)}
              />
              {form.formState.errors[col.key] && (
                <p className="text-destructive text-xs">
                  {form.formState.errors[col.key]?.message}
                </p>
              )}
            </div>
          ))}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : editingRow ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
