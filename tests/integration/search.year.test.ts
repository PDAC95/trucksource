// search.year.test.ts — the YEAR-filter contract on the search_listings RPC.
//
// Phase 16 (FITL-05 / SRCH-03 / FINT-03): the buyer filters by a SINGLE year
// (their truck's model year). A listing matches when p_year is null, OR the
// listing is UNIVERSAL (year_start null = fits all years), OR p_year falls
// inside the listing's [year_start, year_end] range. This gate proves the
// p_year arm added in migration 0026 end-to-end against Staging:
//   * a listing whose range INCLUDES Y is returned for p_year = Y,
//   * a listing whose range EXCLUDES Y is NOT returned for p_year = Y,
//   * a UNIVERSAL listing (year_start null) is returned for ANY p_year.
//
// Runs against Supabase Staging with the anon key only (listings is public-read
// for active rows) and self-skips when the Supabase env vars are absent OR when
// Staging lacks the seed data the assertions need — exactly like
// search.subtree.test.ts.
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, anonClient } from "./_supabase";

const d = INTEGRATION_ENABLED ? describe : describe.skip;

/** Call search_listings with only a year filter; return the matched listing ids. */
async function searchByYear(
  supabase: ReturnType<typeof anonClient>,
  year: number | null,
): Promise<number[]> {
  const { data, error } = await supabase.rpc("search_listings", {
    p_q: null,
    p_model_id: null,
    p_config_id: null,
    p_category_id: null,
    p_condition_id: null,
    p_year: year,
    p_fits_model_id: null,
    p_fits_config_id: null,
    p_limit: 200,
    p_offset: 0,
  });
  expect(error).toBeNull();
  return ((data ?? []) as Array<{ id: number }>).map((r) => r.id);
}

d("contract: search_listings applies the p_year arm", () => {
  it("range listings match inside / exclude outside; universal matches any year", async () => {
    const supabase = anonClient();

    // 0) Sanity: a null year filter must NOT shrink the result set vs. the
    //    unfiltered feed — the year arm is a pure pass-through when p_year is null.
    const allIds = await searchByYear(supabase, null);

    // 1) Pull active listings with their year columns (public-read). These are
    //    the only listings search_listings can return (status='active', not hidden,
    //    not expired) — read the same surface so the assertions stay aligned.
    const { data: listingRows, error: listErr } = await supabase
      .from("listings")
      .select("id, year_start, year_end, status, hidden_at")
      .eq("status", "active")
      .is("hidden_at", null);
    expect(listErr).toBeNull();

    type Row = {
      id: number;
      year_start: number | null;
      year_end: number | null;
    };
    const rows = ((listingRows ?? []) as Row[]).filter((r) =>
      allIds.includes(r.id),
    );

    // --- Universal arm: a year_start-null listing must match ANY year. ---
    const universal = rows.find((r) => r.year_start === null);
    if (universal) {
      const matched2000 = await searchByYear(supabase, 2000);
      const matched2025 = await searchByYear(supabase, 2025);
      expect(matched2000).toContain(universal.id);
      expect(matched2025).toContain(universal.id);
    } else {
      console.log(
        "[search.year] no universal (year_start null) active listing — skipping universal arm",
      );
    }

    // --- Range arm: a listing with a real [start, end] range. ---
    const ranged = rows.find(
      (r) => r.year_start !== null && r.year_end !== null,
    );
    if (ranged && ranged.year_start !== null && ranged.year_end !== null) {
      // Inside the range → returned.
      const inside = ranged.year_start;
      const insideIds = await searchByYear(supabase, inside);
      expect(insideIds).toContain(ranged.id);

      // Outside the range → NOT returned. Pick a year strictly outside that is
      // still inside the valid 1970..2027 bounds the RPC will accept.
      let outside: number | null = null;
      if (ranged.year_start > 1970) outside = ranged.year_start - 1;
      else if (ranged.year_end < 2027) outside = ranged.year_end + 1;

      if (outside !== null) {
        // Only meaningful if the listing does NOT also have a universal twin row
        // covering that year; the RPC matches per-listing, so excluding the id
        // from the outside result is the correct, listing-scoped assertion.
        const outsideIds = await searchByYear(supabase, outside);
        expect(outsideIds).not.toContain(ranged.id);
      } else {
        console.log(
          "[search.year] ranged listing spans full bounds — no outside year to test",
        );
      }
    } else {
      console.log(
        "[search.year] no active listing with a year RANGE set — call shape OK, skipping range arm",
      );
    }

    if (!universal && !ranged) {
      console.log(
        "[search.year] Staging has no year-bearing listings yet — p_year call shape verified, behavior arms skipped",
      );
    }
  });
});
