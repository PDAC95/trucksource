import { describe, expect, it, vi, beforeEach } from "vitest";

// ADMO-05 regression spine: every NEW-value picker query helper must filter
// is_active = true so deactivated taxonomy values disappear from new-listing /
// garage pickers — while search/read surfaces (search_listings RPC, listing
// display, synonym expansion) deliberately do NOT filter. Here we prove the
// picker helpers apply the filter; the read-surface behavior is untouched code.

type EqCall = { table: string; column: string; value: unknown };
const eqCalls: EqCall[] = [];

// Thenable chainable builder: records .eq() calls per table, resolves to rows.
function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.select = vi.fn(ret);
  chain.order = vi.fn(ret);
  chain.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push({ table, column, value });
    return chain;
  });
  // Awaiting the builder resolves like the real PostgREST builder.
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => makeChain(table),
  }),
}));

import { getModels, getConfigs } from "@/lib/garage/cascade";
import { getConditions, getPartCategories } from "@/lib/listings/cascade";

function activeFilterFor(table: string): EqCall | undefined {
  return eqCalls.find(
    (c) => c.table === table && c.column === "is_active" && c.value === true,
  );
}

beforeEach(() => {
  eqCalls.length = 0;
  vi.clearAllMocks();
});

describe("picker query helpers exclude deactivated taxonomy values (ADMO-05)", () => {
  it("getModels filters models by is_active = true", async () => {
    await getModels(1);
    expect(activeFilterFor("models")).toBeDefined();
  });

  it("getConfigs filters configurations by is_active = true", async () => {
    await getConfigs(1);
    expect(activeFilterFor("configurations")).toBeDefined();
  });

  it("getConditions filters conditions by is_active = true", async () => {
    await getConditions();
    expect(activeFilterFor("conditions")).toBeDefined();
  });

  it("getPartCategories filters part_categories by is_active = true", async () => {
    await getPartCategories();
    expect(activeFilterFor("part_categories")).toBeDefined();
  });
});
