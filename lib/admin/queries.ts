import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Admin user-management read surface (ADMO-01). Service-role reads — the admin
// console is the ONE sanctioned cross-user reader (requireAdmin() gates every
// page via the admin layout; every admin ACTION re-gates itself).
//
// PII DISCIPLINE (Pitfall 7): the LIST query carries ZERO PII — public-profile
// columns + restriction state only. Email search resolves matching ids through
// profiles_private FIRST, then fetches the public rows; the email itself is
// never returned. The ONLY helper that returns PII is
// getAdminUserDetailWithPII — named so that reusing it on any public surface
// is self-evidently wrong.

const PAGE_SIZE = 25;

export type AdminRestriction = {
  state: "suspended" | "banned";
  reason: string;
  suspendedUntil: string | null;
  createdAt: string;
};

export type AdminUserListRow = {
  id: string;
  username: string;
  displayName: string | null;
  stateProvince: string;
  country: string;
  memberSince: string;
  restriction: AdminRestriction | null;
};

type PublicRow = {
  id: string;
  username: string;
  display_name: string | null;
  state_province: string;
  country: string;
  member_since: string;
};

type RestrictionRow = {
  user_id: string;
  state: "suspended" | "banned";
  reason: string;
  suspended_until: string | null;
  created_at: string;
};

const PUBLIC_COLUMNS =
  "id, username, display_name, state_province, country, member_since";

async function hydrateRestrictions(
  userIds: string[],
): Promise<Map<string, AdminRestriction>> {
  const byId = new Map<string, AdminRestriction>();
  if (userIds.length === 0) return byId;
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_restrictions")
    .select("user_id, state, reason, suspended_until, created_at")
    .in("user_id", userIds);
  for (const r of (data ?? []) as RestrictionRow[]) {
    byId.set(r.user_id, {
      state: r.state,
      reason: r.reason,
      suspendedUntil: r.suspended_until,
      createdAt: r.created_at,
    });
  }
  return byId;
}

/**
 * Searchable, paginated user list. NO PII columns — restriction badge data
 * comes from a separate user_restrictions read. `q` matches username
 * (ilike) OR email (ids resolved via profiles_private; email never returned).
 */
export async function getAdminUsers({
  q,
  page = 1,
}: {
  q?: string;
  page?: number;
}): Promise<{ users: AdminUserListRow[]; page: number; hasMore: boolean }> {
  const admin = createAdminClient();
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const from = (safePage - 1) * PAGE_SIZE;
  const query = q?.trim();

  let rows: PublicRow[] = [];
  let hasMore = false;

  if (query) {
    // Escape PostgREST ilike wildcards in user input.
    const escaped = query.replace(/[%_]/g, (m) => `\\${m}`);

    // Arm 1: username match on the public table.
    const { data: byUsername } = await admin
      .from("profiles_public")
      .select(PUBLIC_COLUMNS)
      .ilike("username", `%${escaped}%`)
      .order("member_since", { ascending: false })
      .limit(PAGE_SIZE + 1);

    // Arm 2: email match — ids ONLY from the PII table, public rows after.
    const { data: privMatches } = await admin
      .from("profiles_private")
      .select("id")
      .ilike("email", `%${escaped}%`)
      .limit(PAGE_SIZE);
    const emailIds = ((privMatches ?? []) as { id: string }[]).map((r) => r.id);

    const merged = new Map<string, PublicRow>();
    for (const r of (byUsername ?? []) as PublicRow[]) merged.set(r.id, r);
    if (emailIds.length > 0) {
      const { data: byEmail } = await admin
        .from("profiles_public")
        .select(PUBLIC_COLUMNS)
        .in("id", emailIds);
      for (const r of (byEmail ?? []) as PublicRow[]) merged.set(r.id, r);
    }
    rows = Array.from(merged.values()).sort((a, b) =>
      b.member_since.localeCompare(a.member_since),
    );
    hasMore = rows.length > PAGE_SIZE;
    rows = rows.slice(0, PAGE_SIZE);
  } else {
    const { data } = await admin
      .from("profiles_public")
      .select(PUBLIC_COLUMNS)
      .order("member_since", { ascending: false })
      .range(from, from + PAGE_SIZE); // one extra row → hasMore
    rows = ((data ?? []) as PublicRow[]).slice(0, PAGE_SIZE + 1);
    hasMore = rows.length > PAGE_SIZE;
    rows = rows.slice(0, PAGE_SIZE);
  }

  const restrictionById = await hydrateRestrictions(rows.map((r) => r.id));

  return {
    users: rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      stateProvince: r.state_province,
      country: r.country,
      memberSince: r.member_since,
      restriction: restrictionById.get(r.id) ?? null,
    })),
    page: safePage,
    hasMore,
  };
}

export type AdminUserDetail = {
  id: string;
  username: string;
  displayName: string | null;
  stateProvince: string;
  country: string;
  memberSince: string;
  sellerType: string | null;
  usernameChangedAt: string | null;
  // PII — admin detail view ONLY. Never reuse this shape on a public surface.
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneVerifiedAt: string | null;
  marketplaceTermsAcceptedAt: string | null;
  restriction: AdminRestriction | null;
  listingCount: number;
  reportsAgainstCount: number;
  recentListings: {
    id: number;
    title: string;
    status: string;
    hiddenAt: string | null;
    hiddenReason: string | null;
    createdAt: string;
  }[];
};

/**
 * The ONLY admin helper that joins profiles_private. Returns first/last name,
 * email, phone + verification status + restriction row + activity counts.
 * The name is deliberately loud: if this ever appears outside app/admin, it
 * is a privacy regression by definition (CLAUDE.md invariant #1).
 */
export async function getAdminUserDetailWithPII(
  id: string,
): Promise<AdminUserDetail | null> {
  const admin = createAdminClient();

  const [
    { data: pub },
    { data: priv },
    { data: restriction },
    listingCountRes,
    { data: recent },
  ] = await Promise.all([
    admin
      .from("profiles_public")
      .select(`${PUBLIC_COLUMNS}, seller_type, username_changed_at`)
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("profiles_private")
      .select(
        "first_name, last_name, email, phone, phone_verified_at, marketplace_terms_accepted_at",
      )
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("user_restrictions")
      .select("user_id, state, reason, suspended_until, created_at")
      .eq("user_id", id)
      .maybeSingle(),
    admin
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", id),
    admin
      .from("listings")
      .select("id, title, status, hidden_at, hidden_reason, created_at")
      .eq("seller_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (!pub) return null;
  const p = pub as PublicRow & {
    seller_type: string | null;
    username_changed_at: string | null;
  };
  const pii = priv as {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    phone_verified_at: string | null;
    marketplace_terms_accepted_at: string | null;
  } | null;
  const r = restriction as RestrictionRow | null;

  // Reports filed against this user's content: their listings, comments, and
  // messages — three head-counts through FK inner-embeds.
  const [listingReports, commentReports, messageReports] = await Promise.all([
    admin
      .from("reports")
      .select("id, listings!inner(seller_id)", { count: "exact", head: true })
      .eq("listings.seller_id", id),
    admin
      .from("reports")
      .select("id, listing_comments!inner(author_id)", {
        count: "exact",
        head: true,
      })
      .eq("listing_comments.author_id", id),
    admin
      .from("reports")
      .select("id, messages!inner(sender_id)", { count: "exact", head: true })
      .eq("messages.sender_id", id),
  ]);

  return {
    id: p.id,
    username: p.username,
    displayName: p.display_name,
    stateProvince: p.state_province,
    country: p.country,
    memberSince: p.member_since,
    sellerType: p.seller_type,
    usernameChangedAt: p.username_changed_at,
    firstName: pii?.first_name ?? "",
    lastName: pii?.last_name ?? "",
    email: pii?.email ?? "",
    phone: pii?.phone ?? "",
    phoneVerifiedAt: pii?.phone_verified_at ?? null,
    marketplaceTermsAcceptedAt: pii?.marketplace_terms_accepted_at ?? null,
    restriction: r
      ? {
          state: r.state,
          reason: r.reason,
          suspendedUntil: r.suspended_until,
          createdAt: r.created_at,
        }
      : null,
    listingCount: listingCountRes.count ?? 0,
    reportsAgainstCount:
      (listingReports.count ?? 0) +
      (commentReports.count ?? 0) +
      (messageReports.count ?? 0),
    recentListings: (
      (recent ?? []) as {
        id: number;
        title: string;
        status: string;
        hidden_at: string | null;
        hidden_reason: string | null;
        created_at: string;
      }[]
    ).map((l) => ({
      id: l.id,
      title: l.title,
      status: l.status,
      hiddenAt: l.hidden_at,
      hiddenReason: l.hidden_reason,
      createdAt: l.created_at,
    })),
  };
}
