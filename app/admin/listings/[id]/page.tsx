import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminListingDetail } from "@/lib/admin/listings-queries";
import {
  HideRestoreControls,
  PhotoRemoveButton,
} from "@/components/admin/listing-moderation";
import { Badge } from "@/components/ui/badge";

// Admin listing detail (ADMO-02): READ-ONLY seller content — title,
// description-ish fields and price render as text, never inputs (locked:
// the admin moderates, never edits seller content) — plus the moderation
// controls: hide/restore with reason, per-photo removal.
export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const SHIPPING_LABELS: Record<string, string> = {
  shipping_available: "Shipping available",
  local_pickup: "Local pickup only",
  shipping_assistance: "Shipping assistance",
};

export default async function AdminListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(); // security gate — the layout gate is UX only

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const listing = await getAdminListingDetail(id);
  if (!listing) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/listings"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← All listings
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {listing.title}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant={listing.status === "active" ? "default" : "secondary"}
            >
              {listing.status}
            </Badge>
            {listing.hiddenAt && (
              <Badge variant="destructive">
                Hidden ({listing.hiddenReason ?? "unknown"}) since{" "}
                {formatDate(listing.hiddenAt)}
              </Badge>
            )}
            {listing.isBarnyard && <Badge variant="outline">Barnyard</Badge>}
            {listing.reportCount > 0 && (
              <Badge variant="destructive">
                {listing.reportCount} report
                {listing.reportCount === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
        </div>
        <HideRestoreControls
          listingId={listing.id}
          hiddenAt={listing.hiddenAt}
          hiddenReason={listing.hiddenReason}
        />
      </div>

      {/* Seller content — read-only text on purpose. No inputs exist here. */}
      <dl className="grid gap-x-8 gap-y-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Seller
          </dt>
          <dd className="text-sm font-medium">{listing.seller.username}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Asking price
          </dt>
          <dd className="text-sm font-medium">
            $
            {Number(listing.askingPrice).toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Condition
          </dt>
          <dd className="text-sm font-medium">
            {listing.conditionName || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Part number
          </dt>
          <dd className="text-sm font-medium">{listing.partNumber || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Shipping
          </dt>
          <dd className="text-sm font-medium">
            {SHIPPING_LABELS[listing.shippingOption] ?? listing.shippingOption}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Listed / Expires
          </dt>
          <dd className="text-sm font-medium">
            {formatDate(listing.dateListed)} / {formatDate(listing.expiresAt)}
          </dd>
        </div>
        {listing.damageNotes && (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Damage notes
            </dt>
            <dd className="whitespace-pre-wrap text-sm">
              {listing.damageNotes}
            </dd>
          </div>
        )}
      </dl>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Fitment</h2>
        {listing.fitment.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No fitment rows{listing.isBarnyard ? " (Barnyard listing)" : ""}.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {listing.fitment.map((f, i) => (
              <li key={i}>
                <Badge variant="outline">
                  {f.makeName} {f.modelName}
                  {f.configName ? ` — ${f.configName}` : ""}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Photos ({listing.photos.length})
        </h2>
        {listing.photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listing.photos.map((photo, index) => (
              <div key={photo.id} className="space-y-2 rounded-lg border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={`Photo ${index + 1}`}
                  className="aspect-square w-full rounded object-cover"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {index === 0 ? "Cover" : `#${index + 1}`}
                  </span>
                </div>
                <PhotoRemoveButton photoId={photo.id} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
