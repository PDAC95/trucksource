"use server";

import { autocomplete, type Autocomplete } from "@/lib/search/queries";

// Server-action wrapper so the client SearchBar can call the (server-only) autocomplete
// reader directly. Read-only, public, PII-free — it just forwards to the trgm/FTS RPCs
// in lib/search/queries.ts. The client debounces (~200ms) before invoking this.
export async function autocompleteAction(
  prefix: string,
): Promise<Autocomplete> {
  return autocomplete(prefix);
}
