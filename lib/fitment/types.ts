// Shared FINT-01 suggestion contract — imported by BOTH the server action
// (lib/fitment/suggest.ts) and the client chip component (Plan 06-04). Plain types
// only (no "use server", no runtime imports) so either side can import freely.
//
// EXPLAINABILITY-BY-GROUP: suggestions are grouped by SOURCE, and the group label
// IS the explanation the seller reads ("From your garage" / "Common for Bumpers").
// No confidence score ever reaches the UI — the precision threshold below filters
// server-side and only names survive.

// Maps directly onto FitmentSelection (components/listings/fitment-multi-select.tsx)
// on accept (Plan 06-04) so the chip can build a full confirmed fitment with no
// second round-trip. Field names MUST match FitmentSelection exactly.
export type SuggestedFitment = {
  modelId: number;
  configId: number | null;
  makeName: string;
  modelName: string;
  configName: string | null;
};

// A flat-dimension suggestion (slang / special filter / category). `id` is the
// taxonomy id the listing_search_terms / listing_categories row will reference.
export type SuggestedTag = {
  kind: "search_term" | "special_filter" | "category";
  id: number;
  name: string;
};

export type SuggestionGroup =
  | {
      source: "garage";
      label: string;
      fitments: SuggestedFitment[];
      tags: SuggestedTag[];
    }
  | {
      source: "category";
      label: string;
      fitments: SuggestedFitment[];
      tags: SuggestedTag[];
    };

export type SuggestResult = { groups: SuggestionGroup[] };

// Precision threshold (CONTEXT precision>recall, Pitfall 6) — only rules at/above
// this confidence surface; no score ever reaches the UI.
export const MIN_SUGGESTION_CONFIDENCE = 80;
