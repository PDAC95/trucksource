import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { listingPhotoPublicUrl } from "@/lib/listings/storage";

// Admin listing read surface (ADMO-02). Service-role reads on purpose: the
// admin must see EVERY listing — drafts and moderation-hidden rows that the
// replaced public-read policy (0019 §4) excludes from anon/user clients.
// Every page that renders these results sits behind requireAdmin().
//
// PRIVACY: seller display is resolved through profiles_public ONLY, with
// ENUMERATED columns — the service role COULD read profiles_private, which is
// exactly why this module never touches it (invariant #1 discipline).
//
// seller_id FKs auth.users (not profiles_public), so PostgREST cannot embed
// the seller — usernames are batch-resolved with a separate enumerated
// profiles_public read, the same workaround as lib/listings/queries.getListing.

export const ADMIN_LISTINGS_PAGE_SIZE = 50;

export type AdminListingFilters = {
  status?: string; // 'draft' | 'active' | 'sold' | 'expired'
  hidden?: boolean; // true = only moderation/suspension/ban-hidden rows
  q?: string; // matches title OR seller username (ilike — admin volume)
  page?: number; // 1-based
};

export type AdminListingRow = {
  id: number;
  title: string;
  status: string;
  hiddenAt: string | null;
  hiddenReason: string | null;
  dateListed: string;
  expiresAt: string | null;
  sellerId: string;
  sellerUsername: string;
  coverUrl: string | null;
};

export type AdminListingsResult = {
  rows: AdminListingRow[];
  total: number;
  page: number;
  pageSize: number;
};

const LISTING_STATUSES = ["draft", "active", "sold", "expired"] as const;

type AdminListingDbRow = {
  id: number;
  title: string;
  status: string;
  hidden_at: string | null;
  hidden_reason: string | null;
  date_listed: string;
  expires_at: string | null;
  seller_id: string;
  listing_photos: { storage_path: string; sort_order: number }[] | null;
};

/**
 * Filterable admin listing index. Status / hidden / text filters come straight
 * from searchParams; text search is plain ilike on title plus a username
 * pre-resolve (admin volume — no FTS needed here, the public search RPC stays
 * the only FTS surface).
 */
export async function getAdminListings(
  filters: AdminListingFilters = {},
): Promise<AdminListingsResult> {
  const admin = createAdminClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * ADMIN_LISTINGS_PAGE_SIZE;

  let query = admin
    .from("listings")
    .select(
      "id, title, status, hidden_at, hidden_reason, date_listed, expires_at, seller_id, " +
        "listing_photos ( storage_path, sort_order )",
      { count: "exact" },
    );

  if (
    filters.status &&
    (LISTING_STATUSES as readonly string[]).includes(filters.status)
  ) {
    query = query.eq("status", filters.status);
  }
  if (filters.hidden) {
    query = query.not("hidden_at", "is", null);
  }

  const q = filters.q?.trim();
  if (q) {
    // Search by title OR seller username: pre-resolve matching seller ids from
    // profiles_public (enumerated columns), then OR the two arms. Escape the
    // PostgREST or() syntax characters out of the user input.
    const safe = q.replace(/[%,()]/g, " ").trim();
    const { data: sellers } = await admin
      .from("profiles_public")
      .select("id")
      .ilike("username", `%${safe}%`)
      .limit(20);
    const sellerIds = (sellers ?? []).map((s) => (s as { id: string }).id);
    if (sellerIds.length > 0) {
      query = query.or(
        `title.ilike.%${safe}%,seller_id.in.(${sellerIds.join(",")})`,
      );
    } else {
      query = query.ilike("title", `%${safe}%`);
    }
  }

  const { data, count, error } = await query
    .order("date_listed", { ascending: false })
    .range(from, from + ADMIN_LISTINGS_PAGE_SIZE - 1);

  if (error || !data) {
    return { rows: [], total: 0, page, pageSize: ADMIN_LISTINGS_PAGE_SIZE };
  }

  const rows = data as unknown as AdminListingDbRow[];

  // Batch-resolve usernames for this page's sellers (enumerated, no PII).
  const sellerIds = [...new Set(rows.map((r) => r.seller_id))];
  const usernameById = new Map<string, string>();
  if (sellerIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles_public")
      .select("id, username")
      .in("id", sellerIds);
    for (const p of (profiles ?? []) as { id: string; username: string }[]) {
      usernameById.set(p.id, p.username);
    }
  }

  return {
    rows: rows.map((r) => {
      const cover = (r.listing_photos ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)[0];
      return {
        id: r.id,
        title: r.title,
        status: r.status,
        hiddenAt: r.hidden_at,
        hiddenReason: r.hidden_reason,
        dateListed: r.date_listed,
        expiresAt: r.expires_at,
        sellerId: r.seller_id,
        sellerUsername: usernameById.get(r.seller_id) ?? "(unknown)",
        coverUrl: cover
          ? listingPhotoPublicUrl(admin, cover.storage_path)
          : null,
      };
    }),
    total: count ?? 0,
    page,
    pageSize: ADMIN_LISTINGS_PAGE_SIZE,
  };
}

export type AdminListingPhoto = {
  id: number;
  path: string;
  url: string;
  sortOrder: number;
};

export type AdminListingDetail = {
  id: number;
  title: string;
  partNumber: string | null;
  askingPrice: number;
  conditionName: string;
  shippingOption: string;
  damageNotes: string | null;
  isBarnyard: boolean;
  status: string;
  hiddenAt: string | null;
  hiddenReason: string | null;
  dateListed: string;
  expiresAt: string | null;
  seller: { id: string; username: string };
  photos: AdminListingPhoto[];
  fitment: {
    makeName: string;
    modelName: string;
    configName: string | null;
  }[];
  reportCount: number;
};

type AdminListingDetailDbRow = {
  id: number;
  title: string;
  part_number: string | null;
  asking_price: number;
  shipping_option: string;
  damage_notes: string | null;
  is_barnyard: boolean;
  status: string;
  hidden_at: string | null;
  hidden_reason: string | null;
  date_listed: string;
  expires_at: string | null;
  seller_id: string;
  conditions: { name: string } | null;
  listing_photos:
    | { id: number; storage_path: string; sort_order: number }[]
    | null;
  listing_fitment:
    | {
        models: { name: string; makes: { name: string } | null } | null;
        configurations: { name: string } | null;
      }[]
    | null;
};

/** Full listing detail for the moderation page, plus the report count. */
export async function getAdminListingDetail(
  id: number,
): Promise<AdminListingDetail | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("listings")
    .select(
      "id, title, part_number, asking_price, shipping_option, damage_notes, is_barnyard, " +
        "status, hidden_at, hidden_reason, date_listed, expires_at, seller_id, " +
        "conditions:condition_id ( name ), " +
        "listing_photos ( id, storage_path, sort_order ), " +
        "listing_fitment ( models:model_id ( name, makes:make_id ( name ) ), configurations:config_id ( name ) )",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as AdminListingDetailDbRow;

  const [{ data: sellerRow }, { count: reportCount }] = await Promise.all([
    admin
      .from("profiles_public")
      .select("id, username")
      .eq("id", row.seller_id)
      .maybeSingle(),
    admin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", id),
  ]);
  const seller = sellerRow as { id: string; username: string } | null;

  return {
    id: row.id,
    title: row.title,
    partNumber: row.part_number,
    askingPrice: row.asking_price,
    conditionName: row.conditions?.name ?? "",
    shippingOption: row.shipping_option,
    damageNotes: row.damage_notes,
    isBarnyard: row.is_barnyard,
    status: row.status,
    hiddenAt: row.hidden_at,
    hiddenReason: row.hidden_reason,
    dateListed: row.date_listed,
    expiresAt: row.expires_at,
    seller: {
      id: row.seller_id,
      username: seller?.username ?? "(unknown)",
    },
    photos: (row.listing_photos ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({
        id: p.id,
        path: p.storage_path,
        url: listingPhotoPublicUrl(admin, p.storage_path),
        sortOrder: p.sort_order,
      })),
    fitment: (row.listing_fitment ?? []).map((f) => ({
      makeName: f.models?.makes?.name ?? "",
      modelName: f.models?.name ?? "",
      configName: f.configurations?.name ?? null,
    })),
    reportCount: reportCount ?? 0,
  };
}
