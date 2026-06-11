// Fitment Library level config map (ADMO-05/06). ONE record drives BOTH the
// generic /admin/fitment/[level] CRUD page AND the generic taxonomy Server
// Actions — adding a level later is config-only, no new page or action code.
//
// Deliberately NOT "server-only": it contains zero secrets (table names are
// public in the migrations; every taxonomy table is anon-readable) and the
// client CRUD component consumes the column specs to generate its add/edit
// form. Writes still go ONLY through lib/actions/admin/taxonomy.ts, which is
// gated by requireAdmin() and uses the service-role client (the taxonomy
// tables have no public write policies — default-deny, invariant #2).

/** URL slugs for the 8 levels, in canonical L1→L8 order. */
export const TAXONOMY_LEVEL_ORDER = [
  "makes",
  "models",
  "configurations",
  "terms",
  "part_categories",
  "materials",
  "conditions",
  "special_filters",
] as const;

export type TaxonomyLevelSlug = (typeof TAXONOMY_LEVEL_ORDER)[number];

/** An editable column rendered as a form field and whitelisted in actions. */
export type TaxonomyColumn = {
  /** Real DB column name — the ONLY keys the actions will ever write. */
  key: string;
  label: string;
  kind: "text" | "number";
  required: boolean;
};

/** Parent FK spec — renders a parent selector and whitelists the FK column. */
export type TaxonomyParent = {
  /** FK column on this level's table (e.g. make_id, parent_id). */
  column: string;
  /** Table the options come from. */
  optionsTable: "makes" | "part_categories";
  label: string;
  required: boolean;
};

export type TaxonomyLevel = {
  slug: TaxonomyLevelSlug;
  /** Real table name (service-role writes only). */
  table: string;
  /** Plural display label. */
  label: string;
  singular: string;
  /** Short blurb for the /admin/fitment index cards. */
  description: string;
  /** The human-name column ("name", or "term" for search_terms). */
  nameColumn: string;
  /** Editable columns (form fields + action whitelist). */
  columns: TaxonomyColumn[];
  parent?: TaxonomyParent;
  /**
   * Special editor flags:
   *  - "slang": search_terms get the dedicated slang editor with the
   *    search_term_targets (make/model/config exclusive-arc) mapper.
   *  - "configurations": shared master set whose per-model applicability
   *    lives in the model_configurations join (managed via seed/CSV in v1).
   */
  special?: "slang" | "configurations";
};

const NAME_COLUMN: TaxonomyColumn = {
  key: "name",
  label: "Name",
  kind: "text",
  required: true,
};

const SORT_ORDER_COLUMN: TaxonomyColumn = {
  key: "sort_order",
  label: "Sort order",
  kind: "number",
  required: false,
};

export const TAXONOMY_LEVELS: Record<TaxonomyLevelSlug, TaxonomyLevel> = {
  makes: {
    slug: "makes",
    table: "makes",
    label: "Makes",
    singular: "Make",
    description: "L1 — truck manufacturers (Peterbilt, Kenworth, …).",
    nameColumn: "name",
    columns: [NAME_COLUMN],
  },
  models: {
    slug: "models",
    table: "models",
    label: "Models",
    singular: "Model",
    description: "L2 — models scoped under a make (379, W900, …).",
    nameColumn: "name",
    columns: [NAME_COLUMN],
    parent: {
      column: "make_id",
      optionsTable: "makes",
      label: "Make",
      required: true,
    },
  },
  configurations: {
    slug: "configurations",
    table: "configurations",
    label: "Configurations",
    singular: "Configuration",
    description:
      "L3 — shared master set (Day Cab, Sleeper, Aerodyne, …); per-model applicability lives in the model_configurations join.",
    nameColumn: "name",
    columns: [NAME_COLUMN],
    special: "configurations",
  },
  terms: {
    slug: "terms",
    table: "search_terms",
    label: "Search Terms",
    singular: "Search Term",
    description:
      "L4 — trucker slang mapped to a make, model, or configuration ('Large Car', '359 Guys', …).",
    nameColumn: "term",
    columns: [{ key: "term", label: "Term", kind: "text", required: true }],
    special: "slang",
  },
  part_categories: {
    slug: "part_categories",
    table: "part_categories",
    label: "Part Categories",
    singular: "Part Category",
    description:
      "L5 — the part-category tree (root = no parent; includes The Barnyard).",
    nameColumn: "name",
    columns: [NAME_COLUMN],
    parent: {
      column: "parent_id",
      optionsTable: "part_categories",
      label: "Parent category",
      required: false,
    },
  },
  materials: {
    slug: "materials",
    table: "materials",
    label: "Materials",
    singular: "Material",
    description: "L6 — part materials (Aluminum, Fiberglass, …).",
    nameColumn: "name",
    columns: [NAME_COLUMN, SORT_ORDER_COLUMN],
  },
  conditions: {
    slug: "conditions",
    table: "conditions",
    label: "Conditions",
    singular: "Condition",
    description: "L7 — listing conditions (New, Used – Good, …).",
    nameColumn: "name",
    columns: [NAME_COLUMN, SORT_ORDER_COLUMN],
  },
  special_filters: {
    slug: "special_filters",
    table: "special_filters",
    label: "Special Filters",
    singular: "Special Filter",
    description: "L8 — special filters (OEM, Chrome, Vintage, …).",
    nameColumn: "name",
    columns: [NAME_COLUMN, SORT_ORDER_COLUMN],
  },
};

export function getTaxonomyLevel(slug: string): TaxonomyLevel | null {
  return (TAXONOMY_LEVELS as Record<string, TaxonomyLevel>)[slug] ?? null;
}
