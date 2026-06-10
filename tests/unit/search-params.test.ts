import { describe, expect, it } from "vitest";

// Unit-test the URL ↔ SearchQuery contract: parse + serialize are exact inverses, so
// the LOCKED "all state in the URL" decision is shareable/back-forward-safe. We assert
// the round-trip holds for the four real query shapes (empty feed, keyword-only,
// full-facet, fits-my-truck), the numeric NaN guards, and the default-sort selection.

import {
  parseSearchParams,
  serializeSearchQuery,
  hasCriteria,
  type SearchQuery,
} from "@/lib/search/params";

/** parse(serialize(x)) — the round-trip we expect to be the identity on a SearchQuery. */
function roundTrip(query: SearchQuery): SearchQuery {
  const params = serializeSearchQuery(query);
  // URLSearchParams → the plain Record<string,string> shape parseSearchParams reads.
  return parseSearchParams(Object.fromEntries(params.entries()));
}

describe("parseSearchParams + serializeSearchQuery round-trip", () => {
  it("empty feed (no criteria) round-trips to the empty feed query", () => {
    const empty = parseSearchParams({});
    expect(empty).toEqual({
      q: null,
      makeId: null,
      modelId: null,
      configId: null,
      categoryId: null,
      conditionId: null,
      fitsModelId: null,
      fitsConfigId: null,
      sort: "recent", // no q → recent
      page: 0,
    });
    // Empty query serializes to an empty querystring (clean URL).
    expect(serializeSearchQuery(empty).toString()).toBe("");
    expect(roundTrip(empty)).toEqual(empty);
    expect(hasCriteria(empty)).toBe(false);
  });

  it("keyword-only query round-trips (default sort = relevance)", () => {
    const q = parseSearchParams({ q: "long hood" });
    expect(q.q).toBe("long hood");
    expect(q.sort).toBe("relevance"); // q present → relevance
    expect(hasCriteria(q)).toBe(true);
    expect(roundTrip(q)).toEqual(q);
  });

  it("full-facet query round-trips", () => {
    const q = parseSearchParams({
      q: "bumper",
      make: "3",
      model: "12",
      config: "5",
      category: "8",
      condition: "2",
      sort: "price",
      page: "2",
    });
    expect(q).toEqual({
      q: "bumper",
      makeId: 3,
      modelId: 12,
      configId: 5,
      categoryId: 8,
      conditionId: 2,
      fitsModelId: null,
      fitsConfigId: null,
      sort: "price",
      page: 2,
    });
    expect(roundTrip(q)).toEqual(q);
  });

  it("fits-my-truck query round-trips", () => {
    const q = parseSearchParams({ fits: "12", fitsConfig: "5" });
    expect(q.fitsModelId).toBe(12);
    expect(q.fitsConfigId).toBe(5);
    expect(hasCriteria(q)).toBe(true);
    expect(roundTrip(q)).toEqual(q);
  });
});

describe("numeric NaN / junk guards", () => {
  it("non-numeric facet params coerce to null (no RPC poisoning)", () => {
    const q = parseSearchParams({
      model: "abc",
      config: "",
      category: "1.5",
      condition: "-4",
    });
    expect(q.modelId).toBeNull();
    expect(q.configId).toBeNull();
    expect(q.categoryId).toBeNull(); // non-integer → null
    expect(q.conditionId).toBeNull(); // ≤ 0 → null
  });

  it("a junk sort falls back to the query-derived default", () => {
    expect(parseSearchParams({ sort: "bogus" }).sort).toBe("recent");
    expect(parseSearchParams({ q: "x", sort: "bogus" }).sort).toBe("relevance");
  });

  it("a negative / non-integer page clamps to 0", () => {
    expect(parseSearchParams({ page: "-3" }).page).toBe(0);
    expect(parseSearchParams({ page: "1.5" }).page).toBe(0);
    expect(parseSearchParams({ page: "abc" }).page).toBe(0);
  });
});

describe("default sort selection", () => {
  it("empty feed defaults to 'recent'", () => {
    expect(parseSearchParams({}).sort).toBe("recent");
  });
  it("keyworded query defaults to 'relevance'", () => {
    expect(parseSearchParams({ q: "hood" }).sort).toBe("relevance");
  });
  it("an explicit valid sort always wins over the default", () => {
    expect(parseSearchParams({ q: "hood", sort: "recent" }).sort).toBe(
      "recent",
    );
  });
});
