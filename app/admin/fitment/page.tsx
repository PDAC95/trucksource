import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TAXONOMY_LEVEL_ORDER,
  TAXONOMY_LEVELS,
} from "@/lib/admin/taxonomy-config";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Fitment Library index (ADMO-05/06) — the 8-level picker. Per-request gate;
// never cache one admin's view for another (invariant #6).
export const dynamic = "force-dynamic";

export default async function FitmentLibraryPage() {
  await requireAdmin(); // layout gate is UX only — every admin surface re-gates

  const admin = createAdminClient();
  const counts = await Promise.all(
    TAXONOMY_LEVEL_ORDER.map(async (slug) => {
      const { count } = await admin
        .from(TAXONOMY_LEVELS[slug].table)
        .select("id", { count: "exact", head: true });
      return count ?? 0;
    }),
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Fitment Library
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage the 8-level fitment taxonomy. Deactivating a value hides it
          from new-listing pickers only — existing listings keep it.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TAXONOMY_LEVEL_ORDER.map((slug, i) => {
          const level = TAXONOMY_LEVELS[slug];
          return (
            <Link
              key={slug}
              href={`/admin/fitment/${slug}`}
              className="group focus-visible:outline-none"
            >
              <Card className="h-full transition-colors group-hover:border-foreground/30 group-focus-visible:ring-2 group-focus-visible:ring-ring">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{level.label}</span>
                    <span className="text-muted-foreground flex items-center gap-1 text-sm font-normal">
                      {counts[i]}
                      <ChevronRight className="size-4" />
                    </span>
                  </CardTitle>
                  <CardDescription>{level.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
