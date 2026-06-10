"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

// Small sort control for the profile listings grid. LOCKED: the profile is a
// list + sort only — NO facet panel (sellers rarely carry enough inventory in v1).
//
// All state lives in the URL (?sort=recent|price), so the sorted view is shareable
// and the page stays a cacheable Server Component (no force-dynamic). Changing the
// control writes the searchParam via router.replace (no history spam) and the page
// re-reads on the server with the new order.

type Sort = "recent" | "price";

const OPTIONS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Más recientes" },
  { value: "price", label: "Precio: menor a mayor" },
];

export function ProfileSort({ current }: { current: Sort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function onChange(next: Sort) {
    const params = new URLSearchParams(searchParams.toString());
    // 'recent' is the default → omit it for clean, canonical URLs.
    if (next === "recent") params.delete("sort");
    else params.set("sort", next);
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="profile-sort" className="text-muted-foreground">
        Ordenar
      </label>
      <select
        id="profile-sort"
        value={current}
        disabled={isPending}
        onChange={(e) => onChange(e.target.value as Sort)}
        className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
