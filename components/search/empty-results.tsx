"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SearchX } from "lucide-react";
import { FEED_PATH } from "@/lib/search/params";

// LOCKED: empty results are NEVER a dead-end. A friendly message + a "Clear filters"
// action that router.replace-es to FEED_PATH (clearing every param → back to the open feed).
export function EmptyResults() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed py-16 text-center">
      <SearchX className="size-10 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-base font-medium">No results found</p>
        <p className="text-sm text-muted-foreground">
          Try another word or remove some filters.
        </p>
      </div>
      <Button variant="outline" onClick={() => router.replace(FEED_PATH)}>
        Clear filters
      </Button>
    </div>
  );
}
