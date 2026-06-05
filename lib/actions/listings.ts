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
