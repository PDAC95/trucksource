import { Badge } from "@/components/ui/badge";
import { SELLER_TYPE_LABELS, type SellerType } from "@/lib/seller/badge";

// ACCT-07 reusable seller-type badge. Presentational + prop-driven ONLY (server-safe,
// no client hooks) so Phase 7's feed/search listing card reuses it verbatim. Renders
// nothing when sellerType is null (empty = no badge, CONTEXT lock).

export function SellerTypeBadge({
  sellerType,
}: {
  sellerType: SellerType | null;
}) {
  if (sellerType === null) return null;
  return <Badge variant="outline">{SELLER_TYPE_LABELS[sellerType]}</Badge>;
}
