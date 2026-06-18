"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  SlidersHorizontal,
  Plus,
  ArrowUpDown,
  Search,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FacetControls } from "@/components/search/facet-sidebar";
import { SearchBar } from "@/components/search/search-bar";
import { FEED_PATH } from "@/lib/search/params";
import { cn } from "@/lib/utils";
import type { CascadeOption } from "@/lib/garage/cascade";
import type { CategoryOption } from "@/lib/listings/cascade";
import type { GarageTruck } from "@/lib/garage/queries";

// Mobile-only (<lg) action rail for /browse: Filters (opens the facet sheet),
// Add a truck (→ garage / login), Sort (a menu of orderings), and a search lupa
// that expands the SearchBar inline. Replaces the always-on inline search bar and
// the standalone fits/filters controls on small screens.

type Conditions = { id: number; name: string }[];

const SORTS = [
  { value: "recent", label: "Newest" },
  { value: "price", label: "Price" },
  { value: "relevance", label: "Best match" },
] as const;

const railBtn =
  "border-white/15 bg-white/[0.03] text-foreground hover:border-neon-cyan/50 hover:bg-white/[0.06]";

export function BrowseToolbarMobile({
  makes,
  conditions,
  rootCategories,
  trucks,
  addHref,
}: {
  makes: CascadeOption[];
  conditions: Conditions;
  rootCategories: CategoryOption[];
  trucks: GarageTruck[];
  addHref: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchOpen, setSearchOpen] = React.useState(false);

  const activeSort = searchParams.get("sort");

  function setSort(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", value);
    params.delete("page");
    router.replace(`${FEED_PATH}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-3 lg:hidden">
      <div className="flex flex-wrap items-center gap-2">
        {/* Filters → facet sheet */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className={railBtn}>
              <SlidersHorizontal className="size-4" />
              Filters
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="font-display tracking-wide uppercase">
                Filters
              </SheetTitle>
            </SheetHeader>
            <FacetControls
              makes={makes}
              conditions={conditions}
              rootCategories={rootCategories}
              trucks={trucks}
            />
          </SheetContent>
        </Sheet>

        {/* Add a truck */}
        <Button asChild variant="outline" size="sm" className={railBtn}>
          <Link href={addHref}>
            <Plus className="size-4" />
            Add a truck
          </Link>
        </Button>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className={railBtn}>
              <ArrowUpDown className="size-4" />
              Sort
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {SORTS.map((s) => (
              <DropdownMenuItem
                key={s.value}
                onClick={() => setSort(s.value)}
                className="justify-between"
              >
                {s.label}
                {activeSort === s.value && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Search lupa → expands the search bar */}
        <Button
          variant="outline"
          size="icon"
          aria-label="Search"
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((v) => !v)}
          className={cn(railBtn, "ml-auto")}
        >
          <Search className="size-4" />
        </Button>
      </div>

      {searchOpen && <SearchBar />}
    </div>
  );
}
