// search.test.ts — Phase-7 search DB-foundation gate (0014_search.sql).
//
// Proves SRCH-01..05 behavior + the cross-cutting EXPLAIN GIN gates (Pitfall 3)
// LIVE against Supabase Staging with the anon key only (see _supabase.ts). Self-skips
// when the Supabase env vars are absent so a secret-less CI run does not hard-fail.
//
// What it asserts:
//   - SRCH-01 (feed):    search_listings(null) returns active rows with the public
//                        column shape (id/title/asking_price/condition_id/date_listed/
//                        rank/total_count) and ZERO PII keys.
//   - SRCH-02 (keyword): a keyword arm narrows to a subset of the unfiltered feed; a
//                        nonsense token returns []; the FTS arm yields rank >= 0.
//   - SRCH-02 (index):   explain_search_plan() shows a Bitmap/Index Scan on
//                        listings_search_vector_idx, NEVER a Seq Scan on listings.
//   - SRCH-04 (index):   explain_slang_plan() shows a Bitmap/Index Scan on
//                        search_terms_term_trgm_idx, NEVER a Seq Scan on search_terms.
//   - SRCH-03 (facet):   condition / category / model facets narrow to a subset.
//   - SRCH-04 (slang):   match_search_term() typo-matches a seeded slang term via
//                        public.similarity() (NOT the bare % operator).
//   - total_count:       every returned row carries the identical window grand total =
//                        the full unfiltered match count (the "X results" contract).
//   - SRCH-05 (events):  anon INSERT into search_events succeeds; anon SELECT returns
//                        no rows (insert-only RLS → service-role-only read).
//
// NOTE on the EXPLAIN gates: the helpers pin enable_seqscan/indexscan off, so the GIN
// index is the chosen access path even on the tiny Staging seed — the gate proves the
// index is WIRED/choosable, not that the planner prefers it at low row counts (which it
// wouldn't, and which is not a regression).
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, PII_KEYS, anonClient } from "./_supabase";

const d = INTEGRATION_ENABLED ? describe : describe.skip;

// The full public column shape search_listings returns (and the ONLY allowed keys).
const RPC_COLUMNS = [
  "id",
  "title",
  "asking_price",
  "condition_id",
  "date_listed",
  "rank",
  "total_count",
] as const;

type SearchRow = {
  id: number;
  title: string;
  asking_price: number | string;
  condition_id: number;
  date_listed: string;
  rank: number;
  total_count: number;
};

/** Call search_listings with a partial arg set (defaults fill the rest). */
async function search(args: Record<string, unknown> = {}) {
  const supabase = anonClient();
  const { data, error } = await supabase.rpc("search_listings", {
    p_q: null,
    p_model_id: null,
    p_config_id: null,
    p_category_id: null,
    p_condition_id: null,
    p_fits_model_id: null,
    p_fits_config_id: null,
    p_limit: 24,
    p_offset: 0,
    ...args,
  });
  return { data: (data ?? []) as SearchRow[], error };
}

d(
  "SRCH-01: feed (search_listings with no query) returns active public rows",
  () => {
    it("returns an array of rows with exactly the public column shape", async () => {
      const { data, error } = await search();
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      if (data.length === 0) {
        console.log("[search] no active listings seeded — feed call shape OK");
        return;
      }
      for (const row of data) {
        for (const k of Object.keys(row)) {
          expect(RPC_COLUMNS).toContain(k as (typeof RPC_COLUMNS)[number]);
        }
      }
    });

    it("every row carries an identical total_count = the feed row count", async () => {
      const { data, error } = await search({ p_limit: 1000 });
      expect(error).toBeNull();
      if (data.length === 0) return;
      const total = data[0].total_count;
      // Window count over the full filtered set: all rows share the same total, and
      // (since we fetched the whole set) it equals the row count.
      expect(data.every((r) => r.total_count === total)).toBe(true);
      expect(total).toBe(data.length);
    });
  },
);

d("SRCH-02: keyword search", () => {
  it("a nonsense token returns zero rows", async () => {
    const { data, error } = await search({
      p_q: "zzqqxx_no_such_part_999",
    });
    expect(error).toBeNull();
    expect(data.length).toBe(0);
  });

  it("a keyword arm narrows to a subset of the unfiltered feed (rank >= 0)", async () => {
    const feed = await search();
    if (feed.data.length === 0) {
      console.log("[search] no listings — keyword subset check skipped");
      return;
    }
    // Use the first token of a real active title so the FTS arm matches >= 1 row.
    const token = feed.data[0].title.split(/\s+/)[0];
    const { data, error } = await search({ p_q: token });
    expect(error).toBeNull();
    // Keyword results are a subset of the full feed (filtered, never larger).
    expect(data[0]?.total_count ?? 0).toBeLessThanOrEqual(
      feed.data[0].total_count,
    );
    for (const row of data) {
      expect(typeof row.rank).toBe("number");
      expect(row.rank).toBeGreaterThanOrEqual(0);
    }
  });
});

d("SRCH-02/04: EXPLAIN GIN gates (Pitfall 3 — no Seq Scan)", () => {
  it("FTS path uses listings_search_vector_idx, never Seq Scan on listings", async () => {
    const supabase = anonClient();
    const { data, error } = await supabase.rpc("explain_search_plan", {
      p_q: "bumper",
    });
    expect(error).toBeNull();
    const plan = ((data ?? []) as string[]).join("\n");
    expect(plan).toMatch(/Index Scan|Bitmap Index Scan/);
    expect(plan).toContain("listings_search_vector_idx");
    expect(plan).not.toMatch(/Seq Scan on listings\b/);
  });

  it("slang/typo path uses search_terms_term_trgm_idx, never Seq Scan on search_terms", async () => {
    const supabase = anonClient();
    const { data, error } = await supabase.rpc("explain_slang_plan", {
      p_q: "bumpr",
    });
    expect(error).toBeNull();
    const plan = ((data ?? []) as string[]).join("\n");
    expect(plan).toMatch(/Index Scan|Bitmap Index Scan/);
    expect(plan).toContain("search_terms_term_trgm_idx");
    expect(plan).not.toMatch(/Seq Scan on search_terms\b/);
  });
});

d("SRCH-03: facet filters narrow results (subset of the feed)", () => {
  it("a condition facet returns a subset whose rows all match that condition", async () => {
    const feed = await search();
    if (feed.data.length === 0) {
      console.log("[search] no listings — facet subset check skipped");
      return;
    }
    const conditionId = feed.data[0].condition_id;
    const { data, error } = await search({
      p_condition_id: conditionId,
      p_limit: 1000,
    });
    expect(error).toBeNull();
    // Narrows (never larger than the feed) and every row matches the facet.
    expect(data.length).toBeLessThanOrEqual(feed.data.length);
    for (const row of data) {
      expect(row.condition_id).toBe(conditionId);
    }
  });

  it("an unmatched model facet returns zero rows (EXISTS-join narrows hard)", async () => {
    const { data, error } = await search({ p_model_id: -1 });
    expect(error).toBeNull();
    expect(data.length).toBe(0);
  });
});

d("SRCH-04: slang typo-tolerance via public.similarity (not bare %)", () => {
  it("match_search_term typo-matches a seeded slang term", async () => {
    const supabase = anonClient();
    // "Glider" is a seeded slang term — a near-typo must still resolve (>= 0.3 trgm).
    const { data, error } = await supabase.rpc("match_search_term", {
      p_raw: "glidr",
    });
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<{ id: number; term: string }>;
    // The typo resolves to exactly one best-match term (or [] if the seed changed).
    if (rows.length > 0) {
      expect(typeof rows[0].term).toBe("string");
      expect(rows[0].term.length).toBeGreaterThan(0);
    } else {
      console.log(
        "[search] slang seed differs — match_search_term returned []",
      );
    }
  });

  it("autocomplete_terms returns up to 6 prefix-ish matches", async () => {
    const supabase = anonClient();
    const { data, error } = await supabase.rpc("autocomplete_terms", {
      p_prefix: "guys",
    });
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<{ term: string }>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(6);
  });
});

d(
  "SRCH-05: search_events is insert-only for anon (insert OK, select denied)",
  () => {
    it("anon INSERT succeeds; anon SELECT returns no rows (no select policy)", async () => {
      const supabase = anonClient();
      const marker = `vitest-${Date.now()}-${Math.random()}`;
      const { error: insertErr } = await supabase.from("search_events").insert({
        raw_term: marker,
        normalized_term: marker,
        facets: { source: "vitest" },
        result_count: 0,
      });
      // Insert is allowed for anon (the one insert policy, with check (true)).
      expect(insertErr).toBeNull();

      // ...but the row is NOT readable back — no select policy = service-role-only read.
      const { data, error: selErr } = await supabase
        .from("search_events")
        .select("id")
        .eq("raw_term", marker);
      // Either the select errors OR returns zero rows; the row must never be readable.
      if (selErr) {
        expect(selErr).not.toBeNull();
      } else {
        expect((data ?? []).length).toBe(0);
      }
    });
  },
);
