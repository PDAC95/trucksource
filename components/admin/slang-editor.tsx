"use client";

// Slang editor (ADMO-06) — the highest-frequency admin surface. Add-term +
// map-target is a ≤3-click flow: type the term, pick a target, Create. Each
// term's targets (make / model / configuration — the 0003 exclusive arc) are
// editable inline; renames, deactivation and FK-guarded delete ride the same
// generic taxonomy actions (level = "terms").

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";

import {
  createSlangTerm,
  deleteValue,
  setActive,
  setSlangTargets,
  updateSlangTerm,
  type SlangTargetInput,
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

export type TargetOption = { id: number; label: string };

type TargetKind = SlangTargetInput["kind"];

export type SlangTermRow = {
  id: number;
  term: string;
  isActive: boolean;
  targets: { kind: TargetKind; targetId: number; label: string }[];
};

const KIND_LABEL: Record<TargetKind, string> = {
  make: "Make",
  model: "Model",
  config: "Configuration",
};

const SELECT_CLASS =
  "border-input bg-background h-9 rounded-md border px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function TargetPicker({
  options,
  onAdd,
  disabled,
}: {
  options: Record<TargetKind, TargetOption[]>;
  onAdd: (target: SlangTargetInput & { label: string }) => void;
  disabled?: boolean;
}) {
  const [kind, setKind] = React.useState<TargetKind>("model");
  const [id, setId] = React.useState("");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Target type"
        value={kind}
        onChange={(e) => {
          setKind(e.target.value as TargetKind);
          setId("");
        }}
        className={SELECT_CLASS}
        disabled={disabled}
      >
        <option value="make">Make</option>
        <option value="model">Model</option>
        <option value="config">Configuration</option>
      </select>
      <select
        aria-label="Target value"
        value={id}
        onChange={(e) => setId(e.target.value)}
        className={cn(SELECT_CLASS, "min-w-44 flex-1 sm:flex-none")}
        disabled={disabled}
      >
        <option value="">Select a {KIND_LABEL[kind].toLowerCase()}…</option>
        {options[kind].map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || id === ""}
        onClick={() => {
          const numericId = Number(id);
          const label =
            options[kind].find((o) => o.id === numericId)?.label ?? "";
          onAdd({ kind, id: numericId, label });
          setId("");
        }}
      >
        <Plus className="size-3.5" />
        Map target
      </Button>
    </div>
  );
}

function TargetChips({
  targets,
  onRemove,
}: {
  targets: { kind: TargetKind; targetId: number; label: string }[];
  onRemove?: (index: number) => void;
}) {
  if (targets.length === 0)
    return (
      <span className="text-muted-foreground text-xs">No targets mapped</span>
    );
  return (
    <div className="flex flex-wrap gap-1.5">
      {targets.map((t, i) => (
        <Badge
          key={`${t.kind}-${t.targetId}`}
          variant="secondary"
          className="gap-1"
        >
          <span className="text-muted-foreground">{KIND_LABEL[t.kind]}:</span>
          {t.label}
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${t.label}`}
              onClick={() => onRemove(i)}
              className="hover:text-destructive ml-0.5"
            >
              <X className="size-3" />
            </button>
          )}
        </Badge>
      ))}
    </div>
  );
}

export function SlangEditor({
  terms,
  makeOptions,
  modelOptions,
  configOptions,
}: {
  terms: SlangTermRow[];
  makeOptions: TargetOption[];
  modelOptions: TargetOption[];
  configOptions: TargetOption[];
}) {
  const router = useRouter();
  const options: Record<TargetKind, TargetOption[]> = React.useMemo(
    () => ({ make: makeOptions, model: modelOptions, config: configOptions }),
    [makeOptions, modelOptions, configOptions],
  );

  const [search, setSearch] = React.useState("");
  const [pendingId, setPendingId] = React.useState<number | null>(null);
  const [renaming, setRenaming] = React.useState<SlangTermRow | null>(null);
  const [deleting, setDeleting] = React.useState<SlangTermRow | null>(null);

  // --- Add-term flow (term + initial targets in one shot) -------------------
  const [newTerm, setNewTerm] = React.useState("");
  const [newTargets, setNewTargets] = React.useState<
    (SlangTargetInput & { label: string })[]
  >([]);
  const [creating, setCreating] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return terms;
    return terms.filter(
      (t) =>
        t.term.toLowerCase().includes(q) ||
        t.targets.some((x) => x.label.toLowerCase().includes(q)),
    );
  }, [terms, search]);

  async function refreshAfter(
    result: { ok: boolean } & { error?: string },
    okMsg: string,
  ) {
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

  async function handleCreate() {
    if (newTerm.trim() === "") return;
    setCreating(true);
    const result = await createSlangTerm({
      term: newTerm.trim(),
      targets: newTargets.map(({ kind, id }) => ({ kind, id })),
    });
    setCreating(false);
    const ok = await refreshAfter(result, `“${newTerm.trim()}” created.`);
    if (ok) {
      setNewTerm("");
      setNewTargets([]);
    }
  }

  async function replaceTargets(term: SlangTermRow, next: SlangTargetInput[]) {
    setPendingId(term.id);
    const result = await setSlangTargets({ termId: term.id, targets: next });
    setPendingId(null);
    await refreshAfter(result, "Targets updated.");
  }

  return (
    <div className="space-y-6">
      {/* Add term — the ≤3-click flow: type term, map target, Create. */}
      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-medium">Add a search term</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            placeholder="e.g. Large Car"
            className="sm:max-w-xs"
            maxLength={120}
          />
          <Button
            onClick={handleCreate}
            disabled={creating || newTerm.trim() === ""}
          >
            {creating ? "Creating…" : "Create term"}
          </Button>
        </div>
        <TargetPicker
          options={options}
          disabled={creating}
          onAdd={(t) =>
            setNewTargets((prev) =>
              prev.some((x) => x.kind === t.kind && x.id === t.id)
                ? prev
                : [...prev, t],
            )
          }
        />
        {newTargets.length > 0 && (
          <TargetChips
            targets={newTargets.map((t) => ({
              kind: t.kind,
              targetId: t.id,
              label: t.label,
            }))}
            onRemove={(i) =>
              setNewTargets((prev) => prev.filter((_, idx) => idx !== i))
            }
          />
        )}
      </div>

      {/* Term list */}
      <div className="relative sm:max-w-xs">
        <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search terms…"
          className="pl-8"
        />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {search ? "No matches." : "No search terms yet."}
          </p>
        )}
        {filtered.map((term) => (
          <div
            key={term.id}
            className={cn(
              "space-y-3 rounded-lg border p-4",
              !term.isActive && "opacity-60",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{term.term}</span>
                {!term.isActive && <Badge variant="secondary">Inactive</Badge>}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRenaming(term)}
                >
                  <Pencil className="size-3.5" />
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pendingId === term.id}
                  onClick={async () => {
                    setPendingId(term.id);
                    const result = await setActive({
                      level: "terms",
                      id: term.id,
                      active: !term.isActive,
                    });
                    setPendingId(null);
                    await refreshAfter(
                      result,
                      term.isActive
                        ? "Deactivated — hidden from new-listing suggestions. Existing listings keep it."
                        : "Reactivated.",
                    );
                  }}
                >
                  {term.isActive ? "Deactivate" : "Reactivate"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleting(term)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>

            <TargetChips
              targets={term.targets}
              onRemove={(i) =>
                replaceTargets(
                  term,
                  term.targets
                    .filter((_, idx) => idx !== i)
                    .map((t) => ({ kind: t.kind, id: t.targetId })),
                )
              }
            />

            <TargetPicker
              options={options}
              disabled={pendingId === term.id}
              onAdd={(t) => {
                if (
                  term.targets.some(
                    (x) => x.kind === t.kind && x.targetId === t.id,
                  )
                )
                  return;
                replaceTargets(term, [
                  ...term.targets.map((x) => ({
                    kind: x.kind,
                    id: x.targetId,
                  })),
                  { kind: t.kind, id: t.id },
                ]);
              }}
            />
          </div>
        ))}
      </div>

      {/* Rename dialog */}
      {renaming && (
        <RenameDialog
          term={renaming}
          onClose={() => setRenaming(null)}
          onSaved={() => {
            setRenaming(null);
            router.refresh();
          }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.term}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Hard delete only works when no listing uses this term. If it is in
              use, deactivate it instead — existing listings keep it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const term = deleting;
                setDeleting(null);
                if (!term) return;
                const result = await deleteValue({
                  level: "terms",
                  id: term.id,
                });
                await refreshAfter(result, "Deleted.");
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

function RenameDialog({
  term,
  onClose,
  onSaved,
}: {
  term: SlangTermRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = React.useState(term.term);
  const [saving, setSaving] = React.useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename term</DialogTitle>
          <DialogDescription>
            The rename applies everywhere — search resolves the new spelling
            immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="rename-term">Term</Label>
          <Input
            id="rename-term"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={120}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || value.trim() === ""}
            onClick={async () => {
              setSaving(true);
              const result = await updateSlangTerm({
                id: term.id,
                term: value.trim(),
              });
              setSaving(false);
              if (result.ok) {
                toast.success("Renamed.");
                onSaved();
              } else {
                toast.error(result.error);
              }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
