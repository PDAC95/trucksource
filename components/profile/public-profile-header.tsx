import { MapPin, CalendarDays, Package } from "lucide-react";

interface PublicProfileHeaderProps {
  username: string;
  stateProvince: string;
  country: string;
  /** ISO timestamp from profiles_public.member_since. */
  memberSince: string;
  activeListingCount: number;
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
  username,
  stateProvince,
  country,
  memberSince,
  activeListingCount,
}: PublicProfileHeaderProps) {
  const initial = username.charAt(0).toUpperCase();
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
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {username}
        </h1>

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
