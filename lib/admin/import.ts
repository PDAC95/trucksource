// lib/admin/import.ts — CSV bulk import core (ADMO-02, Research Pattern 11).
//
// The cold-start onboarding tool: each CSV row becomes a DRAFT listing owned by
// a REAL registered seller (referenced by username or email) so the contact→chat
// flow works unchanged (stakeholder-locked). Photos arrive as https URLs, are
// fetched server-side and pass through the EXISTING EXIF/GPS gate —
// stripAndReencode() from lib/images/strip.ts — before a single byte touches
// Storage (CLAUDE.md invariant #4; NEVER a parallel sharp pipeline).
//
// Per-row posture (locked decision): every row is independently validated and
// imported inside its own try/catch — one bad row NEVER aborts the file. The
// caller (the /api/admin/import route handler) collects RowResult entries and
// returns a results report so only failures get fixed and re-uploaded.
//
// All DB access here is service-role (the admin imports on BEHALF of sellers,
// so owner RLS cannot admit these writes). The route handler gates with
// requireAdmin() before any of this runs.
import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripAndReencode } from "@/lib/images/strip";
import { LISTING_PHOTOS_BUCKET } from "@/lib/listings/storage";

// ---------------------------------------------------------------------------
// Row schema (zod) — mirrors lib/listings/schema.ts rules where they apply.
// Headers are trimmed + lowercased by the route's Papa transformHeader, so the
// keys below are the canonical column names. Keep the column-reference table in
// components/admin/import-form.tsx in sync with this schema.
// ---------------------------------------------------------------------------

/** "" / undefined → undefined; otherwise the trimmed string. */
const optionalText = (max: number) =>
  z.preprocess((v) => {
    if (v == null) return undefined;
    const s = String(v).trim();
    return s === "" ? undefined : s;
  }, z.string().max(max).optional());

/** https-only photo URL; empty cells collapse to undefined. */
const httpsUrl = z.preprocess(
  (v) => {
    if (v == null) return undefined;
    const s = String(v).trim();
    return s === "" ? undefined : s;
  },
  z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"), {
      message: "photo URLs must be https",
    })
    .optional(),
);

/** Truthy parse for is_barnyard: yes/true/1/y (any case) → true; blank/no → false. */
const truthy = z.preprocess((v) => {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return ["true", "yes", "y", "1"].includes(s);
}, z.boolean());

/** Normalize "Local Pickup" / "local_pickup" → the DB enum spelling. */
const shippingOption = z.preprocess(
  (v) =>
    String(v ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_"),
  z.enum(["shipping_available", "local_pickup", "shipping_assistance"]),
);

export const csvRowSchema = z
  .object({
    // Username (citext) OR email — resolved to a real auth.users id below.
    seller: z
      .string({ error: "seller is required" })
      .trim()
      .min(1, "seller is required"),
    title: z
      .string({ error: "title is required" })
      .trim()
      .min(1, "title is required")
      .max(120),
    part_number: optionalText(80),
    // Same money rule as listingSchema: positive USD, cents precision.
    asking_price: z.coerce
      .number({ error: "asking_price must be a number" })
      .positive("asking_price must be positive")
      .multipleOf(0.01, "asking_price has at most 2 decimals"),
    condition: z
      .string({ error: "condition is required" })
      .trim()
      .min(1, "condition is required"),
    shipping_option: shippingOption,
    damage_notes: optionalText(2000),
    is_barnyard: truthy,
    // "Peterbilt 379;Kenworth W900:Aerodyne" — Make Model entries, ;-separated,
    // optional :Config suffix. Resolved to ids in resolveTaxonomy.
    fitments: optionalText(1000),
    // Part-category NAMES, ;-separated.
    categories: optionalText(1000),
    photo_url_1: httpsUrl,
    photo_url_2: httpsUrl,
    photo_url_3: httpsUrl,
    photo_url_4: httpsUrl,
    photo_url_5: httpsUrl,
    photo_url_6: httpsUrl,
    photo_url_7: httpsUrl,
    photo_url_8: httpsUrl,
  })
  // The product rule the publish gate expects: Make+Model required UNLESS
  // Barnyard. Enforced at IMPORT time because bulk-publish flips drafts to
  // active without re-validating (drafts may be photo-light, never fitment-less).
  .refine((v) => v.is_barnyard || (v.fitments ?? "").length > 0, {
    message: "fitments required unless is_barnyard is true",
    path: ["fitments"],
  });

export type CsvRow = z.infer<typeof csvRowSchema>;

export type RowResult =
  | { row: number; context: string; ok: true; listingId: number }
  | { row: number; context: string; ok: false; error: string };

// ---------------------------------------------------------------------------
// Seller resolution — profiles_public.username (citext eq) else
// profiles_private.email (service-role read; PII never leaves the server).
// ---------------------------------------------------------------------------

export async function resolveSeller(
  admin: SupabaseClient,
  ref: string,
): Promise<{ ok: true; sellerId: string } | { ok: false; error: string }> {
  const needle = ref.trim();

  // citext `eq` is case-insensitive at the DB level — exact-match semantics.
  const { data: byUsername } = await admin
    .from("profiles_public")
    .select("id")
    .eq("username", needle)
    .maybeSingle();
  if (byUsername?.id) return { ok: true, sellerId: byUsername.id as string };

  if (needle.includes("@")) {
    const { data: byEmail } = await admin
      .from("profiles_private")
      .select("id")
      .ilike("email", needle)
      .maybeSingle();
    if (byEmail?.id) return { ok: true, sellerId: byEmail.id as string };
  }

  return { ok: false, error: `seller not found: "${needle}"` };
}

// ---------------------------------------------------------------------------
// Taxonomy resolution — names → ids, ONLY is_active values (ADMO-05 posture:
// new data can't use deactivated taxonomy; same rule as the listing pickers).
// ---------------------------------------------------------------------------

export type ResolvedTaxonomy = {
  conditionId: number;
  categoryIds: number[];
  fitment: { modelId: number; configId: number | null }[];
};

async function resolveByName(
  admin: SupabaseClient,
  table: "conditions" | "configurations",
  name: string,
): Promise<number | null> {
  // ilike with no wildcards = case-insensitive equality.
  const { data } = await admin
    .from(table)
    .select("id")
    .ilike("name", name)
    .eq("is_active", true)
    .limit(2);
  if (!data || data.length !== 1) return null;
  return data[0].id as number;
}

export async function resolveTaxonomy(
  admin: SupabaseClient,
  row: CsvRow,
): Promise<
  { ok: true; value: ResolvedTaxonomy } | { ok: false; error: string }
> {
  // --- condition (required) ---
  const conditionId = await resolveByName(admin, "conditions", row.condition);
  if (conditionId == null)
    return {
      ok: false,
      error: `condition not found or inactive: "${row.condition}"`,
    };

  // --- categories (optional names, ;-separated) ---
  const categoryIds: number[] = [];
  for (const rawName of (row.categories ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const { data } = await admin
      .from("part_categories")
      .select("id")
      .ilike("name", rawName)
      .eq("is_active", true)
      .limit(2);
    if (!data || data.length === 0)
      return {
        ok: false,
        error: `category not found or inactive: "${rawName}"`,
      };
    if (data.length > 1)
      return {
        ok: false,
        error: `category name is ambiguous (exists under multiple parents): "${rawName}"`,
      };
    categoryIds.push(data[0].id as number);
  }

  // --- fitments ("Make Model" entries, optional ":Config" suffix) ---
  const fitment: { modelId: number; configId: number | null }[] = [];
  const entries = (row.fitments ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  if (entries.length > 0) {
    // One makes read per row; longest-prefix match handles multi-word makes
    // ("Western Star 4900" → make "Western Star", model "4900").
    const { data: makes } = await admin
      .from("makes")
      .select("id, name")
      .eq("is_active", true);
    const makeList = ((makes ?? []) as { id: number; name: string }[]).sort(
      (a, b) => b.name.length - a.name.length,
    );

    for (const entry of entries) {
      const [makeModel, ...configParts] = entry.split(":");
      const configName = configParts.join(":").trim() || null;
      const mm = makeModel.trim();
      const mmLower = mm.toLowerCase();

      const make = makeList.find((m) =>
        mmLower.startsWith(`${m.name.toLowerCase()} `),
      );
      if (!make)
        return {
          ok: false,
          error: `fitment make not recognized in "${entry}" (expected "Make Model")`,
        };
      const modelName = mm.slice(make.name.length).trim();
      if (!modelName)
        return { ok: false, error: `fitment model missing in "${entry}"` };

      const { data: models } = await admin
        .from("models")
        .select("id")
        .eq("make_id", make.id)
        .ilike("name", modelName)
        .eq("is_active", true)
        .limit(2);
      if (!models || models.length !== 1)
        return {
          ok: false,
          error: `model not found or inactive: "${make.name} ${modelName}"`,
        };
      const modelId = models[0].id as number;

      let configId: number | null = null;
      if (configName) {
        configId = await resolveByName(admin, "configurations", configName);
        if (configId == null)
          return {
            ok: false,
            error: `configuration not found or inactive: "${configName}"`,
          };
        // Same applicability re-check createListing does: the (model, config)
        // pair must exist in model_configurations.
        const { data: combo } = await admin
          .from("model_configurations")
          .select("model_id")
          .eq("model_id", modelId)
          .eq("configuration_id", configId)
          .maybeSingle();
        if (!combo)
          return {
            ok: false,
            error: `configuration "${configName}" does not apply to "${make.name} ${modelName}"`,
          };
      }

      fitment.push({ modelId, configId });
    }
  }

  return { ok: true, value: { conditionId, categoryIds, fitment } };
}

// ---------------------------------------------------------------------------
// Photo import — fetch the URL server-side, run THE EXIF gate, upload only the
// clean re-encoded bytes under the SELLER's uid prefix (the existing
// `<uid>/staging/<uuid>.webp` convention from uploadListingPhoto).
// ---------------------------------------------------------------------------

const PHOTO_MAX_BYTES = 10 * 1024 * 1024; // 10MB — same cap as the strip gate
const PHOTO_TIMEOUT_MS = 10_000;

/** Best-effort content-type from the URL extension when the server omits one. */
function guessContentType(url: string): string {
  const path = url.split("?")[0].toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  // .jpg/.jpeg and everything else: let the strip gate's format sniff decide.
  return "image/jpeg";
}

/**
 * Fetch one photo URL and pass it through stripAndReencode() — the SAME P0
 * EXIF/GPS gate as regular uploads. The original fetched bytes (which may carry
 * GPS) are NEVER persisted; only the stripped WebP buffer is uploaded.
 *
 * `fetchImpl` is injectable so the no-GPS regression test can drive a
 * GPS-laden fixture through THIS exact path.
 */
export async function importPhoto(
  admin: SupabaseClient,
  url: string,
  sellerId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (!url.startsWith("https://"))
    return { ok: false, error: "photo URL must be https" };

  let res: Response;
  try {
    res = await fetchImpl(url, {
      signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch {
    return { ok: false, error: `photo fetch failed or timed out: ${url}` };
  }
  if (!res.ok)
    return { ok: false, error: `photo fetch returned ${res.status}: ${url}` };

  const declaredLength = Number(res.headers.get("content-length") ?? 0);
  if (declaredLength > PHOTO_MAX_BYTES)
    return { ok: false, error: `photo larger than 10MB: ${url}` };

  const input = Buffer.from(await res.arrayBuffer());
  if (input.byteLength > PHOTO_MAX_BYTES)
    return { ok: false, error: `photo larger than 10MB: ${url}` };

  const contentType =
    res.headers.get("content-type")?.split(";")[0]?.trim() ||
    guessContentType(url);

  // THE GATE (invariant #4): re-encode + strip ALL metadata before Storage.
  const stripped = await stripAndReencode(input, contentType);
  if (!stripped.ok)
    return {
      ok: false,
      error: `photo rejected (${stripped.error}): ${url}`,
    };

  const path = `${sellerId}/staging/${crypto.randomUUID()}.${stripped.ext}`;
  const { error } = await admin.storage
    .from(LISTING_PHOTOS_BUCKET)
    .upload(path, stripped.buffer, {
      contentType: stripped.contentType,
      cacheControl: "3600",
      upsert: false,
    });
  if (error) return { ok: false, error: `photo upload failed: ${url}` };

  return { ok: true, path };
}

// ---------------------------------------------------------------------------
// Per-row import — the full pipeline inside one try/catch. The listing row is
// inserted only AFTER every photo has been fetched + stripped + uploaded
// (Pitfall 6: no half-imported listings when a photo fails mid-row).
// ---------------------------------------------------------------------------

export async function importRow(
  admin: SupabaseClient,
  raw: Record<string, unknown>,
  rowNumber: number,
): Promise<RowResult> {
  const context = `${String(raw.seller ?? "?")} — ${String(raw.title ?? "?")}`;

  try {
    // 1) Schema validation (per-row; failure reported, never thrown upward).
    const parsed = csvRowSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue.path.join(".") || "row";
      return {
        row: rowNumber,
        context,
        ok: false,
        error: `${where}: ${issue.message}`,
      };
    }
    const row = parsed.data;

    // 2) Seller — the REAL account that will own (and answer contact for) this listing.
    const seller = await resolveSeller(admin, row.seller);
    if (!seller.ok)
      return { row: rowNumber, context, ok: false, error: seller.error };

    // 3) Taxonomy names → ids (is_active only).
    const taxonomy = await resolveTaxonomy(admin, row);
    if (!taxonomy.ok)
      return { row: rowNumber, context, ok: false, error: taxonomy.error };

    // 4) Photos FIRST — all-or-nothing per row. On any failure, best-effort
    //    remove the already-uploaded objects so no orphans accumulate.
    const urls = [
      row.photo_url_1,
      row.photo_url_2,
      row.photo_url_3,
      row.photo_url_4,
      row.photo_url_5,
      row.photo_url_6,
      row.photo_url_7,
      row.photo_url_8,
    ].filter((u): u is string => Boolean(u));

    const photoPaths: string[] = [];
    for (const url of urls) {
      const photo = await importPhoto(admin, url, seller.sellerId);
      if (!photo.ok) {
        if (photoPaths.length > 0) {
          await admin.storage
            .from(LISTING_PHOTOS_BUCKET)
            .remove(photoPaths)
            .then(
              () => undefined,
              () => undefined,
            );
        }
        return { row: rowNumber, context, ok: false, error: photo.error };
      }
      photoPaths.push(photo.path);
    }

    // 5) Insert the listing as a DRAFT owned by the resolved seller. Drafts are
    //    invisible publicly (0019 SELECT policy excludes status='draft') until
    //    bulk-publish flips them active with a fresh date_listed + 90-day expiry.
    const { data: listing, error: insertError } = await admin
      .from("listings")
      .insert({
        seller_id: seller.sellerId,
        title: row.title,
        part_number: row.part_number ?? null,
        asking_price: row.asking_price,
        condition_id: taxonomy.value.conditionId,
        shipping_option: row.shipping_option,
        damage_notes: row.damage_notes ?? null,
        is_barnyard: row.is_barnyard,
        status: "draft",
      })
      .select("id")
      .single();
    if (insertError || !listing)
      return {
        row: rowNumber,
        context,
        ok: false,
        error: `listing insert failed: ${insertError?.message ?? "unknown"}`,
      };
    const listingId = listing.id as number;

    // 6) Children — same shapes createListing writes (fitment, ordered photos,
    //    categories). Sequential best-effort, matching the v1 posture.
    if (taxonomy.value.fitment.length > 0) {
      await admin.from("listing_fitment").insert(
        taxonomy.value.fitment.map((f) => ({
          listing_id: listingId,
          model_id: f.modelId,
          config_id: f.configId,
        })),
      );
    }
    if (photoPaths.length > 0) {
      await admin.from("listing_photos").insert(
        photoPaths.map((storage_path, index) => ({
          listing_id: listingId,
          storage_path,
          sort_order: index, // index 0 = cover
        })),
      );
    }
    if (taxonomy.value.categoryIds.length > 0) {
      await admin.from("listing_categories").insert(
        taxonomy.value.categoryIds.map((category_id) => ({
          listing_id: listingId,
          category_id,
        })),
      );
    }

    return { row: rowNumber, context, ok: true, listingId };
  } catch (e) {
    // The per-row firewall: ANY unexpected throw becomes a reported failure.
    return {
      row: rowNumber,
      context,
      ok: false,
      error: e instanceof Error ? e.message : "unexpected error",
    };
  }
}
