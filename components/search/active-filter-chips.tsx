"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { XIcon } from "lucide-react";

// Removable chips for every active filter (q + each facet + fits-my-truck), plus the
// LOCKED "X results" count beside them. Each chip's "x" removes ONLY that filter by
// dropping its param(s) from the current URL and router.replace-ing — all-state-in-URL,
// so removal is just a URL edit. When a parent facet is removed we also drop its
// dependents (removing Make clears model+config; removing Model clears config) so the
// query never lands in an impossible combination.
//
// The page resolves param IDs → human labels (it has the cascade data) and passes them
// here; this component owns only the URL mutation.

export type ActiveChip = {
  // The URL param key(s) this chip controls. Removing the chip deletes all of them.
  keys: string[];
  label: string;
};

export function ActiveFilterChips({
  chips,
  total,
}: {
  chips: ActiveChip[];
  total: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function remove(keys: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of keys) params.delete(key);
    // Page is an append-cursor; resetting the query starts fresh from page 0.
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">
        {total} {total === 1 ? "result" : "results"}
      </span>

      {chips.map((chip) => (
        <Badge
          key={chip.keys.join("-")}
          variant="secondary"
          className="gap-1 pr-1"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => remove(chip.keys)}
            aria-label={`Remove filter ${chip.label}`}
            className="ml-0.5 inline-flex size-4 items-center justify-center rounded-full hover:bg-foreground/10"
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}
