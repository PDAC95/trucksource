import { describe, expect, it, vi, beforeEach } from "vitest";

// Unit-test the SRCH-05 search-event stream WITHOUT a live DB, mirroring
// listing-actions.test.ts's mocking style. The contract: recordSearchEvent is
// BEST-EFFORT — it must NEVER throw (a logging failure can't block a search render) —
// and on the happy path it inserts a row with the mapped fields + nullable searcher_id,
// resolved via getClaims (NEVER getSession).

const getClaims = vi.fn();
const insert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: () => getClaims() },
    from: () => ({ insert: (rows: unknown) => insert(rows) }),
  }),
}));

import { recordSearchEvent } from "@/lib/search/events";

const UID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: UID } } });
  insert.mockResolvedValue({ error: null });
});

describe("recordSearchEvent — best-effort, never throws", () => {
  it("happy path: inserts the mapped fields + the authenticated searcher_id", async () => {
    await expect(
      recordSearchEvent({
        rawTerm: "359 guys",
        normalizedTerm: "359 Guys",
        facets: { conditionId: 2, modelId: null },
        resultCount: 7,
      }),
    ).resolves.toBeUndefined();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({
      raw_term: "359 guys",
      normalized_term: "359 Guys",
      facets: { conditionId: 2, modelId: null },
      result_count: 7,
      searcher_id: UID,
    });
  });

  it("anon searcher: searcher_id is null (no claims.sub)", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    await recordSearchEvent({
      rawTerm: "hood",
      normalizedTerm: "hood",
      facets: {},
      resultCount: 0,
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ searcher_id: null }),
    );
  });

  it("does NOT throw when the insert rejects (best-effort)", async () => {
    insert.mockRejectedValue(new Error("db down"));

    await expect(
      recordSearchEvent({
        rawTerm: "x",
        normalizedTerm: "x",
        facets: {},
        resultCount: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it("does NOT throw when getClaims itself rejects (best-effort)", async () => {
    getClaims.mockRejectedValue(new Error("auth down"));

    await expect(
      recordSearchEvent({
        rawTerm: "x",
        normalizedTerm: null,
        facets: {},
        resultCount: 0,
      }),
    ).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
  });
});
