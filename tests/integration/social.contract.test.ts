// social.contract.test.ts — READ-SURFACE PII gate for the Phase-8 social pages.
//
// Mirrors public-profile.contract.test.ts: asserts the EXACT selects the comment
// reader and the saved-listings page will run return zero PII keys, live vs
// Staging. This is the cross-cutting gate "comments display commenter by
// username only (never PII)" — the comment author resolves through a batched
// profiles_public read (id, username, display_name) and resolvePublicName;
// profiles_private is never reachable on this path.
//
// The column lists are exported as constants so plan 08-02's readers
// (lib/comments/queries.ts etc.) import/mirror them — the test and the page
// share one source of truth for the read shape.
//
// Runs against Supabase Staging with the anon key only (see _supabase.ts) and
// self-skips when the Supabase env vars are absent so a secret-less CI run does
// not hard-fail.
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { INTEGRATION_ENABLED, PII_KEYS, anonClient } from "./_supabase";

/** The exact listing_comments columns the comment reader selects. */
export const COMMENT_SELECT_COLUMNS = [
  "id",
  "listing_id",
  "author_id",
  "parent_id",
  "body",
  "created_at",
] as const;

/** The exact profiles_public columns batch-read for comment attribution. */
export const COMMENT_AUTHOR_COLUMNS = [
  "id",
  "username",
  "display_name",
] as const;

/** The exact listings columns the saved page hydrates per saved row. */
export const SAVED_LISTING_COLUMNS = [
  "id",
  "title",
  "asking_price",
  "condition_id",
  "status",
  "expires_at",
  "date_listed",
] as const;

const d = INTEGRATION_ENABLED ? describe : describe.skip;

/** Assert every returned row exposes ONLY the allowed keys and zero PII keys. */
function expectShape(
  rows: Record<string, unknown>[] | null,
  allowed: readonly string[],
) {
  for (const row of rows ?? []) {
    const keys = Object.keys(row);
    for (const k of keys) {
      expect(allowed).toContain(k);
    }
    for (const pii of PII_KEYS) {
      expect(keys).not.toContain(pii);
    }
  }
}

d(
  "social read-surface contract: zero PII in comment + saved-page shapes",
  () => {
    it("the comment reader's exact select carries no PII keys", async () => {
      const supabase = anonClient();
      const { data, error } = await supabase
        .from("listing_comments")
        .select(COMMENT_SELECT_COLUMNS.join(","))
        .limit(5);
      // The select shape itself must be anon-valid (public-read policy).
      expect(error).toBeNull();
      expectShape(
        data as Record<string, unknown>[] | null,
        COMMENT_SELECT_COLUMNS,
      );
    });

    it("the batched author attribution read returns username-only attribution", async () => {
      const supabase = anonClient();
      const { data, error } = await supabase
        .from("profiles_public")
        .select(COMMENT_AUTHOR_COLUMNS.join(","))
        .limit(5);
      expect(error).toBeNull();
      expectShape(
        data as Record<string, unknown>[] | null,
        COMMENT_AUTHOR_COLUMNS,
      );
    });

    it("profiles_private stays unreachable from this surface (anon read denied)", async () => {
      const supabase = anonClient();
      const { data, error } = await supabase
        .from("profiles_private")
        .select("*");
      // RLS default-deny: query succeeds, every row filtered out.
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("the saved-page listing hydration shape carries no PII keys", async () => {
      const supabase = anonClient();
      const { data, error } = await supabase
        .from("listings")
        .select(SAVED_LISTING_COLUMNS.join(","))
        .limit(5);
      expect(error).toBeNull();
      expectShape(
        data as Record<string, unknown>[] | null,
        SAVED_LISTING_COLUMNS,
      );
    });
  },
);
