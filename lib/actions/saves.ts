"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Save toggle (SOCL-02). Same trust-boundary posture as lib/actions/garage.ts /
// listings.ts: getClaims identity (never the cookie-only session reader,
// invariant #6), cookie-bound
// user client so the saved_listings owner-only RLS (migration 0015) is the
// authorization boundary — a caller can only ever flip THEIR OWN save row. No
// service-role/admin client here.
//
// IDEMPOTENT FLIP: delete-first. If a row was deleted the listing was saved ->
// now unsaved; otherwise insert (the composite PK + owner with-check make a
// double-insert impossible) -> now saved. An insert FK violation means the
// listing id doesn't exist -> invalid (no existence probe beyond what the
// public-read listings table already exposes).

export type ToggleSaveResult =
  | { ok: true; saved: boolean }
  | { ok: false; error: "unauthenticated" | "invalid" };

// Positive-int id guard — the client passes a number, but it is untrusted like
// everything else at this boundary (copied from garage.ts/listings.ts).
function isValidId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id > 0;
}

/**
 * Toggle the caller's save on a listing. Returns the NEW saved state so the
 * optimistic UI can reconcile. Owner RLS scopes both the delete and the insert;
 * the explicit .eq("user_id") on the delete is belt-and-suspenders.
 */
export async function toggleSave(listingId: number): Promise<ToggleSaveResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  if (!isValidId(listingId)) return { ok: false, error: "invalid" };

  // Delete-first: if a row comes back, this click UNSAVED an existing save.
  const { data: deleted, error: deleteError } = await supabase
    .from("saved_listings")
    .delete()
    .eq("user_id", userId)
    .eq("listing_id", listingId)
    .select("listing_id");

  if (deleteError) return { ok: false, error: "invalid" };
  if (deleted && deleted.length > 0) {
    revalidatePath("/saved");
    return { ok: true, saved: false };
  }

  // Nothing to delete -> this click SAVES. An FK violation (nonexistent
  // listing) surfaces here as an insert error -> invalid.
  const { error: insertError } = await supabase
    .from("saved_listings")
    .insert({ user_id: userId, listing_id: listingId });

  if (insertError) return { ok: false, error: "invalid" };

  revalidatePath("/saved");
  return { ok: true, saved: true };
}
