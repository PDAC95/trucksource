"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { XIcon } from "lucide-react";
import { FEED_PATH } from "@/lib/search/params";

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
    router.replace(qs ? `${FEED_PATH}?${qs}` : FEED_PATH, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {total} {total === 1 ? "result" : "results"}
      </span>

      {chips.map((chip) => (
        <span
          key={chip.keys.join("-")}
          style={{ fontFamily: "var(--ff-godsown)" }}
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-neon-cyan/50 bg-black/40 py-1 pr-1.5 pl-3 text-sm uppercase tracking-wide text-neon-cyan"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => remove(chip.keys)}
            aria-label={`Remove filter ${chip.label}`}
            className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-neon-red"
          >
            <XIcon className="size-3.5" />
          </button>
        </span>
      ))}
    </div>
  );
}
