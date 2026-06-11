import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTaxonomyLevel } from "@/lib/admin/taxonomy-config";
import {
  TaxonomyCrud,
  type ParentOption,
  type TaxonomyRowData,
} from "@/components/admin/taxonomy-crud";
import {
  SlangEditor,
  type SlangTermRow,
  type TargetOption,
} from "@/components/admin/slang-editor";
import { Toaster } from "@/components/ui/sonner";

// Generic per-level CRUD page (ADMO-05) — ONE page serves all 8 levels via the
// TAXONOMY_LEVELS config map. level=terms swaps in the dedicated slang editor
// (ADMO-06). Per-request gate; force-dynamic (invariant #6).
export const dynamic = "force-dynamic";

export default async function TaxonomyLevelPage({
  params,
}: {
  params: Promise<{ level: string }>;
}) {
  await requireAdmin(); // layout gate is UX only

  const { level: slug } = await params;
  const level = getTaxonomyLevel(slug);
  if (!level) notFound();

  const admin = createAdminClient();

  // ---- Slang editor branch (L4) -------------------------------------------
  if (level.special === "slang") {
    const [terms, targets, makes, models, configs] = await Promise.all([
      admin.from("search_terms").select("id, term, is_active").order("term"),
      admin
        .from("search_term_targets")
        .select("id, search_term_id, make_id, model_id, config_id"),
      admin.from("makes").select("id, name").order("name"),
      admin
        .from("models")
        .select("id, name, makes:make_id ( name )")
        .order("name"),
      admin.from("configurations").select("id, name").order("name"),
    ]);

    const makeOptions: TargetOption[] = (makes.data ?? []).map((m) => ({
      id: m.id as number,
      label: m.name as string,
    }));
    const modelOptions: TargetOption[] = (
      (models.data ?? []) as unknown as {
        id: number;
        name: string;
        makes: { name: string } | null;
      }[]
    )
      .map((m) => ({
        id: m.id,
        label: m.makes?.name ? `${m.makes.name} ${m.name}` : m.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const configOptions: TargetOption[] = (configs.data ?? []).map((c) => ({
      id: c.id as number,
      label: c.name as string,
    }));

    const makeLabel = new Map(makeOptions.map((o) => [o.id, o.label]));
    const modelLabel = new Map(modelOptions.map((o) => [o.id, o.label]));
    const configLabel = new Map(configOptions.map((o) => [o.id, o.label]));

    const targetsByTerm = new Map<number, SlangTermRow["targets"]>();
    for (const t of (targets.data ?? []) as {
      id: number;
      search_term_id: number;
      make_id: number | null;
      model_id: number | null;
      config_id: number | null;
    }[]) {
      const list = targetsByTerm.get(t.search_term_id) ?? [];
      if (t.make_id != null)
        list.push({
          kind: "make",
          targetId: t.make_id,
          label: makeLabel.get(t.make_id) ?? `Make #${t.make_id}`,
        });
      else if (t.model_id != null)
        list.push({
          kind: "model",
          targetId: t.model_id,
          label: modelLabel.get(t.model_id) ?? `Model #${t.model_id}`,
        });
      else if (t.config_id != null)
        list.push({
          kind: "config",
          targetId: t.config_id,
          label: configLabel.get(t.config_id) ?? `Config #${t.config_id}`,
        });
      targetsByTerm.set(t.search_term_id, list);
    }

    const termRows: SlangTermRow[] = (
      (terms.data ?? []) as { id: number; term: string; is_active: boolean }[]
    ).map((t) => ({
      id: t.id,
      term: t.term,
      isActive: t.is_active,
      targets: targetsByTerm.get(t.id) ?? [],
    }));

    return (
      <div className="space-y-6">
        <Header
          title="Search Terms"
          blurb="Trucker slang mapped to a make, model, or configuration. New terms resolve in search immediately."
        />
        <SlangEditor
          terms={termRows}
          makeOptions={makeOptions}
          modelOptions={modelOptions}
          configOptions={configOptions}
        />
        <Toaster />
      </div>
    );
  }

  // ---- Generic CRUD branch (all other levels) ------------------------------
  const selectColumns = [
    "id",
    "is_active",
    ...level.columns.map((c) => c.key),
    ...(level.parent ? [level.parent.column] : []),
  ].join(", ");

  let query = admin.from(level.table).select(selectColumns);
  // Library order: sort_order first when the level has it, then name.
  if (level.columns.some((c) => c.key === "sort_order"))
    query = query.order("sort_order");
  query = query.order(level.nameColumn);
  const { data } = await query;

  const rows: TaxonomyRowData[] = (
    (data ?? []) as unknown as Record<string, unknown>[]
  ).map((r) => ({
    id: r.id as number,
    isActive: r.is_active as boolean,
    parentId: level.parent
      ? ((r[level.parent.column] as number) ?? null)
      : null,
    values: Object.fromEntries(
      level.columns.map((c) => [
        c.key,
        (r[c.key] as string | number | null) ?? null,
      ]),
    ),
  }));

  let parentOptions: ParentOption[] = [];
  if (level.parent) {
    const { data: parents } = await admin
      .from(level.parent.optionsTable)
      .select("id, name")
      .order("name");
    parentOptions = ((parents ?? []) as { id: number; name: string }[]).map(
      (p) => ({ id: p.id, name: p.name }),
    );
  }

  return (
    <div className="space-y-6">
      <Header title={level.label} blurb={level.description} />
      <TaxonomyCrud level={level} rows={rows} parentOptions={parentOptions} />
      <Toaster />
    </div>
  );
}

function Header({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="grid gap-1.5">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground text-sm">{blurb}</p>
    </div>
  );
}
