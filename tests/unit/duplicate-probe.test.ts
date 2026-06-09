import { describe, expect, it, vi, beforeEach } from "vitest";

// Prove gate (e) for LIST-10: the same-seller duplicate probe RETURNS matches but
// NEVER blocks publish. The probe (findSimilarOwnListings) is a SEPARATE advisory
// Server Action — it does not import or call createListing, so it is structurally
// incapable of blocking the publish path. The "Publish anyway" button in the form
// calls createListing independently. Here we assert:
//   - unauthenticated -> [] and NO rpc call (advisory, never throws/blocks)
//   - rpc returns rows -> mapped {id,title}[] (matches available to the UI)
//   - rpc returns an error -> [] (degrades to "no warning", never throws)
//   - findSimilarOwnListings never references createListing (gate e)

const getClaims = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: () => getClaims() },
    rpc: (...a: unknown[]) => rpc(...a),
  }),
}));

import { findSimilarOwnListings } from "@/lib/listings/duplicates";

const UID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: UID } } });
});

describe("findSimilarOwnListings — advisory probe, returns-but-never-blocks (gate e)", () => {
  it("unauthenticated -> [], never calls the rpc (never blocks publish)", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const res = await findSimilarOwnListings("Hood for 379");

    expect(res).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rpc returns rows -> mapped {id,title}[] (matches available to the UI, sim dropped)", async () => {
    rpc.mockResolvedValue({
      data: [
        { id: 7, title: "Hood Peterbilt 379", sim: 0.82 },
        { id: 9, title: "Peterbilt 379 Hood", sim: 0.64 },
      ],
      error: null,
    });

    const res = await findSimilarOwnListings("Hood for 379");

    expect(rpc).toHaveBeenCalledWith("find_similar_own_listings", {
      p_title: "Hood for 379",
      p_threshold: 0.6,
    });
    expect(res).toEqual([
      { id: 7, title: "Hood Peterbilt 379" },
      { id: 9, title: "Peterbilt 379 Hood" },
    ]);
  });

  it("rpc returns an error -> [] (degrades, never throws, never blocks)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const res = await findSimilarOwnListings("Hood for 379");

    expect(res).toEqual([]);
  });

  it("gate (e): the probe module never references createListing — it cannot block publish", async () => {
    // The probe is advisory by construction: it has no dependency on the publish
    // path. Reading the source confirms findSimilarOwnListings neither imports nor
    // calls createListing; "Publish anyway" wires createListing in the form.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const raw = await fs.readFile(
      path.join(process.cwd(), "lib/listings/duplicates.ts"),
      "utf8",
    );
    // Strip comments so the word "createListing" appearing in explanatory prose
    // doesn't trip this — we care about code: no import of, and no call to, it.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/import[\s\S]*createListing/); // no import of createListing
    expect(code).not.toMatch(/createListing\s*\(/); // no call to createListing
  });
});
