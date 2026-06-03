import { PackageOpen } from "lucide-react";

// Empty state that sits where the active-listings grid will go (Phase 5).
// In Phase 1 there are no listings, so every profile shows this.

export function EmptyListings() {
  return (
    <section
      aria-label="Active listings"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center"
    >
      <PackageOpen className="size-10 text-muted-foreground" aria-hidden />
      <p className="text-base font-medium">This user hasn&apos;t posted yet</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        When this seller lists parts, they&apos;ll show up here.
      </p>
    </section>
  );
}
