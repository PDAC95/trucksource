"use server";

import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { listingSchema } from "@/lib/listings/schema";
import { stripAndReencode } from "@/lib/images/strip";
import { LISTING_PHOTOS_BUCKET } from "@/lib/listings/storage";

// Listing trust boundary (LIST-01 create / LIST-05 edit / LIST-02 photos).
//
// IDENTITY: every action derives the caller via getClaims() — never the cookie-only
// session reader (which trusts unverified cookie data, CLAUDE.md invariant #6). Writes go through
// the cookie-bound user client, so owner RLS is the authorization boundary:
//   - listings owner-insert/update/delete via (select auth.uid()) = seller_id;
//   - listing_fitment / listing_photos owner-write via EXISTS on the parent listing;
//   - Storage objects writes scoped to (storage.foldername(name))[1] = auth.uid().
// There is NO service-role/admin client here — this is the seller's own data only.
//
// EXIF/GPS GATE (invariant #4): uploadListingPhoto re-encodes every photo through
// stripAndReencode (server-only sharp) BEFORE a single byte touches Storage. The
// ORIGINAL bytes (which may carry GPS) are NEVER persisted — only the clean WebP
// buffer is uploaded. sharp is reachable ONLY through this action (strip.ts is
// `import "server-only"`).
//
// TRUST BOUNDARY (05-RESEARCH Pattern 2, mirrors garage.ts): the cascade/uploader UI
// prevents bad input, but the client is untrusted, so each write re-validates the
// SAME listingSchema (single client+server source of truth), re-checks each fitment
// combo against model_configurations server-side, and verifies every submitted photo
// path lives under the caller's own <uid>/ folder (Pitfall 5).

export type UploadPhotoResult =
  | { ok: true; path: string }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "invalid"
        | "too_large"
        | "unsupported_type"
        | "decode_failed"
        | "upload_failed";
    };

/**
 * Upload one listing photo (LIST-02). Order (05-RESEARCH Pattern 2):
 *   1. getClaims identity (else unauthenticated)
 *   2. pull the File off the FormData (else invalid)
 *   3. read bytes -> stripAndReencode (the EXIF/GPS gate); strip failures
 *      (too_large / unsupported_type / decode_failed; HEIC lands as
 *      unsupported_type) propagate straight through and NOTHING is uploaded
 *   4. upload ONLY the clean re-encoded buffer to the caller's own per-user
 *      staging folder (`<uid>/staging/<uuid>.webp`, Pattern 3)
 * The original (with GPS) is never persisted — only stripped.buffer is uploaded.
 */
export async function uploadListingPhoto(
  form: FormData,
): Promise<UploadPhotoResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "invalid" };

  // The ORIGINAL bytes — used ONLY as input to the strip; never persisted.
  const input = Buffer.from(await file.arrayBuffer());

  // THE GATE: re-encode + strip ALL metadata server-side before any Storage write.
  const stripped = await stripAndReencode(input, file.type);
  if (!stripped.ok) return { ok: false, error: stripped.error };

  // Per-user staging prefix (Pattern 3). The folder owner is auth.uid(), so the
  // storage.objects owner policy admits the write; the listing row may not exist yet.
  const path = `${userId}/staging/${crypto.randomUUID()}.${stripped.ext}`;

  const { error } = await supabase.storage
    .from(LISTING_PHOTOS_BUCKET)
    .upload(path, stripped.buffer, {
      contentType: stripped.contentType,
      cacheControl: "3600",
      upsert: false,
    });
  if (error) return { ok: false, error: "upload_failed" };

  return { ok: true, path };
}

/**
 * Remove one already-uploaded photo (used by the uploader to drop a just-staged
 * photo the seller removed before publishing). The app-level guard that the path
 * starts with `<uid>/` is belt-and-suspenders — Storage RLS also forbids deleting
 * outside the caller's own folder.
 */
export async function removeListingPhoto(
  path: string,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false };

  // Never reach outside the caller's own folder (Storage RLS enforces this too).
  if (!path.startsWith(`${userId}/`)) return { ok: false };

  const { error } = await supabase.storage
    .from(LISTING_PHOTOS_BUCKET)
    .remove([path]);
  return { ok: !error };
}

// Positive-int id guard for the edit handle (the client passes a number, but it is
// untrusted like everything else at this boundary — copied from garage.ts).
function isValidId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id > 0;
}

export type CreateListingResult =
  | { ok: true; id: number }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "invalid"
        | "invalid_combo"
        | "invalid_photo_path"
        | "insert_failed";
    };

/**
 * Create a listing (LIST-01), mirroring addTruck's trust boundary. Order:
 *   1. getClaims identity (else unauthenticated)
 *   2. listingSchema re-validation (else invalid)
 *   3. photo-path ownership: every submitted path must start with `<uid>/` (Pitfall 5,
 *      else invalid_photo_path) — a seller can't attach another user's staged bytes
 *   4. per-fitment combo re-check vs model_configurations (only when configId set;
 *      else invalid_combo) — same rule as addTruck
 *   5. insert the listing under owner RLS (seller_id = userId); else insert_failed
 *   6. bulk-insert listing_fitment + ordered listing_photos (index 0 = cover) under
 *      the EXISTS owner-write policy
 *
 * v1 accepts best-effort SEQUENTIAL inserts (05-RESEARCH Open Q3): if a child insert
 * fails after the listing row lands, the listing exists with partial children. The
 * future atomic upgrade is a SECURITY INVOKER RPC — deliberately NOT built now.
 */
export async function createListing(
  input: unknown,
): Promise<CreateListingResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  const parsed = listingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  // 3) PHOTO-PATH OWNERSHIP (Pitfall 5) — reject any path outside the caller's folder.
  if (v.photoPaths.some((p) => !p.startsWith(`${userId}/`)))
    return { ok: false, error: "invalid_photo_path" };

  // 4) COMBO RE-CHECK — each fitment with a config must be a real model/config pair.
  for (const f of v.fitment) {
    if (f.configId != null) {
      const { data: combo } = await supabase
        .from("model_configurations")
        .select("model_id")
        .eq("model_id", f.modelId)
        .eq("configuration_id", f.configId)
        .maybeSingle();
      if (!combo) return { ok: false, error: "invalid_combo" };
    }
  }

  // 5) INSERT the listing — seller_id explicit (RLS with-check also enforces it).
  // status / date_listed default in the DB (v1 publishes 'active').
  const { data: listing, error } = await supabase
    .from("listings")
    .insert({
      seller_id: userId,
      title: v.title,
      part_number: v.partNumber || null,
      asking_price: v.askingPrice,
      condition_id: v.conditionId,
      shipping_option: v.shippingOption,
      damage_notes: v.damageNotes || null,
      is_barnyard: v.isBarnyard,
    })
    .select("id")
    .single();

  if (error || !listing) return { ok: false, error: "insert_failed" };

  // 6) CHILDREN — fitment combos + ordered photos (index 0 is the cover). These pass
  // the EXISTS owner-write policy because the parent listing's seller_id = userId.
  if (v.fitment.length > 0) {
    await supabase.from("listing_fitment").insert(
      v.fitment.map((f) => ({
        listing_id: listing.id,
        model_id: f.modelId,
        config_id: f.configId ?? null,
      })),
    );
  }
  if (v.photoPaths.length > 0) {
    await supabase.from("listing_photos").insert(
      v.photoPaths.map((storage_path, index) => ({
        listing_id: listing.id,
        storage_path,
        sort_order: index, // index 0 = cover
      })),
    );
  }

  // Caller redirects to /listings/<id> (CONTEXT: publish -> public page).
  return { ok: true, id: listing.id };
}

export type UpdateListingResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "invalid"
        | "invalid_combo"
        | "invalid_photo_path"
        | "not_found";
    };

/**
 * Edit the caller's own listing (LIST-05), mirroring updateTruck. Same guards as
 * createListing (getClaims, schema, photo-path ownership, combo re-check). The
 * listings update is owner-scoped: zero rows affected (non-owner OR nonexistent)
 * collapses to not_found — no existence leak (the updateTruck rule).
 *
 * CHILD SYNC = "replace children": delete this listing's existing listing_fitment +
 * listing_photos (the EXISTS owner-write policy scopes the delete) then re-insert
 * from the submitted arrays. The simplest correct edit — the submitted arrays are
 * the new full truth for fitment + photo order.
 */
export async function updateListing(
  id: number,
  input: unknown,
): Promise<UpdateListingResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "unauthenticated" };

  if (!isValidId(id)) return { ok: false, error: "invalid" };

  const parsed = listingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  // PHOTO-PATH OWNERSHIP (Pitfall 5) — same guard as createListing.
  if (v.photoPaths.some((p) => !p.startsWith(`${userId}/`)))
    return { ok: false, error: "invalid_photo_path" };

  // COMBO RE-CHECK — same rule as createListing.
  for (const f of v.fitment) {
    if (f.configId != null) {
      const { data: combo } = await supabase
        .from("model_configurations")
        .select("model_id")
        .eq("model_id", f.modelId)
        .eq("configuration_id", f.configId)
        .maybeSingle();
      if (!combo) return { ok: false, error: "invalid_combo" };
    }
  }

  // Owner-scoped update; RLS restricts the row to the owner, the explicit seller_id
  // eq is belt-and-suspenders. Zero rows => not_found (non-owner or nonexistent).
  const { data: updated, error } = await supabase
    .from("listings")
    .update({
      title: v.title,
      part_number: v.partNumber || null,
      asking_price: v.askingPrice,
      condition_id: v.conditionId,
      shipping_option: v.shippingOption,
      damage_notes: v.damageNotes || null,
      is_barnyard: v.isBarnyard,
    })
    .eq("id", id)
    .eq("seller_id", userId)
    .select("id");

  if (error) return { ok: false, error: "invalid" };
  if (!updated || updated.length === 0)
    return { ok: false, error: "not_found" };

  // REPLACE CHILDREN — wipe then re-insert fitment + photos (owner-write EXISTS scopes
  // the delete to this listing). Submitted arrays are the new full truth.
  await supabase.from("listing_fitment").delete().eq("listing_id", id);
  await supabase.from("listing_photos").delete().eq("listing_id", id);

  if (v.fitment.length > 0) {
    await supabase.from("listing_fitment").insert(
      v.fitment.map((f) => ({
        listing_id: id,
        model_id: f.modelId,
        config_id: f.configId ?? null,
      })),
    );
  }
  if (v.photoPaths.length > 0) {
    await supabase.from("listing_photos").insert(
      v.photoPaths.map((storage_path, index) => ({
        listing_id: id,
        storage_path,
        sort_order: index, // index 0 = cover
      })),
    );
  }

  return { ok: true };
}
