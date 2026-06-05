// lib/listings/storage.ts — listing-photos bucket constant + public-URL helper.
//
// The single place photo storage paths become public URLs, so the next/image host
// whitelist (next.config images.remotePatterns) stays consistent and downstream
// plans (uploader, listing page) import ONE bucket name. The bucket is public
// (0007_listing_storage.sql) — listing photos are meant to be displayed — so
// getPublicUrl is correct; signed URLs are only needed for time-limited access
// (not the case here).
import type { SupabaseClient } from "@supabase/supabase-js";

export const LISTING_PHOTOS_BUCKET = "listing-photos";

/**
 * Resolve a stored photo path to its public URL for rendering.
 *
 * @param supabase Any supabase-js client (server or browser); getPublicUrl is a
 *                 pure local string build, it makes no network call.
 * @param path     The object path inside the bucket (e.g. `<uid>/staging/<uuid>.webp`).
 */
export function listingPhotoPublicUrl(
  supabase: SupabaseClient,
  path: string,
): string {
  return supabase.storage.from(LISTING_PHOTOS_BUCKET).getPublicUrl(path).data
    .publicUrl;
}
