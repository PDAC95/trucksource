// Seller-type badge — the single source of truth for the 7 fixed seller types.
//
// ACCT-07: a seller may declare ONE informational seller type. It is a NON-PII
// label (a category, not any name/email/phone) and changes NO permissions. The
// value lives on profiles_public.seller_type (text + CHECK, migration 0010),
// mirroring the CONTACT_PREFERENCES contract in lib/account/schema.ts.
//
// SHARED CONTRACT: Phase 7's feed/search listing card imports this SAME
// SELLER_TYPES + SELLER_TYPE_LABELS contract (and the reusable badge component
// that renders from it). Do NOT duplicate the list anywhere — extend it here.

export const SELLER_TYPES = [
  "dealer",
  "truck_dismantler",
  "manufacturer",
  "owner_operator",
  "fleet_mechanic",
  "repair_shop",
  "fleet_owner",
] as const;

export type SellerType = (typeof SELLER_TYPES)[number];

export const SELLER_TYPE_LABELS: Record<SellerType, string> = {
  dealer: "Dealer",
  truck_dismantler: "Truck Dismantler",
  manufacturer: "Manufacturer",
  owner_operator: "Owner Operator",
  fleet_mechanic: "Fleet Mechanic",
  repair_shop: "Repair Shop",
  fleet_owner: "Fleet Owner",
};

// ACCT-08 public-name resolution. The anonymous handle (`username`, immutable)
// is NEVER mutated by the reveal/revert flow; `display_name` is a nullable
// override. The seller's public name = coalesce(display_name, username), so
// reverting (display_name -> null) structurally restores the ORIGINAL handle —
// no new handle is ever generated. Used by the account UI and every public read.
export function resolvePublicName(
  displayName: string | null,
  username: string,
): string {
  return displayName ?? username;
}
