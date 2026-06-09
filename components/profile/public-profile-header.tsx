import { MapPin, CalendarDays, Package, BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SellerTypeBadge } from "@/components/seller/seller-type-badge";
import type { SellerType } from "@/lib/seller/badge";

interface PublicProfileHeaderProps {
  /**
   * The resolved public name (ACCT-08) = coalesce(display_name, username). Either the
   * owner's opt-in display name or the anonymous handle — both are NON-PII.
   */
  publicName: string;
  /** Owner-chosen informational seller type (ACCT-07), or null = no badge. */
  sellerType: SellerType | null;
  stateProvince: string;
  country: string;
  /** ISO timestamp from profiles_public.member_since. */
  memberSince: string;
  activeListingCount: number;
  /**
   * Server-computed Verified Seller flag (VERF-04). A derived boolean from the
   * is_verified_seller RPC — NOT PII. The badge renders only when true.
   */
  verified: boolean;
}

// Compact marketplace-seller header (header + grid feel, not a bare info card).
// Renders ONLY the four allowed public facts — never PII. Location is shown only
// as "State/Province, Country" (PRIV-02); street/postal don't exist on this table.

function formatMemberSince(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function PublicProfileHeader({
  publicName,
  sellerType,
  stateProvince,
  country,
  memberSince,
  activeListingCount,
  verified,
}: PublicProfileHeaderProps) {
  const initial = (publicName.charAt(0) || "?").toUpperCase();
  const listingLabel =
    activeListingCount === 1 ? "active listing" : "active listings";

  return (
    <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:gap-6">
      <div
        aria-hidden
        className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground sm:size-20"
      >
        {initial}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {publicName}
          </h1>
          <SellerTypeBadge sellerType={sellerType} />
          {verified && (
            <Badge variant="secondary" className="gap-1">
              <BadgeCheck className="size-3.5" aria-hidden /> Verified
            </Badge>
          )}
        </div>

        <dl className="flex flex-col gap-1.5 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
          <div className="flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden />
            <dt className="sr-only">Location</dt>
            <dd>
              {stateProvince}, {country}
            </dd>
          </div>

          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-4" aria-hidden />
            <dt className="sr-only">Member since</dt>
            <dd>Member since {formatMemberSince(memberSince)}</dd>
          </div>

          <div className="flex items-center gap-1.5">
            <Package className="size-4" aria-hidden />
            <dt className="sr-only">Active listings</dt>
            <dd>
              {activeListingCount} {listingLabel}
            </dd>
          </div>
        </dl>
      </div>
    </header>
  );
}
