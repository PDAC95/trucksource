"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Search, Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FEED_PATH } from "@/lib/search/params";
import { cn } from "@/lib/utils";

// Web (lg+) results toolbar: a search lupa (left) + Sort (right). Clicking the
// lupa expands it IN PLACE into a horizontal, taller search bar (capped at half
// the row) with a smooth width animation; submit → /browse?q=…. Escape, the X, or
// an outside click collapse it back to the lupa.

const SORTS = [
  { value: "recent", label: "Newest" },
  { value: "price", label: "Price" },
  { value: "relevance", label: "Best match" },
] as const;

const railBtn =
  "border-white/15 bg-white/[0.03] text-foreground hover:border-neon-cyan/50 hover:bg-white/[0.06]";

export function BrowseSortSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(searchParams.get("q") ?? "");
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const formRef = React.useRef<HTMLFormElement | null>(null);

  const activeSort = searchParams.get("sort");

  function setSort(v: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", v);
    params.delete("page");
    router.replace(`${FEED_PATH}?${params.toString()}`, { scroll: false });
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = value.trim();
    router.push(q ? `${FEED_PATH}?q=${encodeURIComponent(q)}` : FEED_PATH);
    setOpen(false);
  }

  React.useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div className="hidden items-center justify-end gap-2 lg:flex">
      <form
        ref={formRef}
        onSubmit={submit}
        role="search"
        className={cn(
          "flex shrink-0 items-center overflow-hidden rounded-full border transition-all duration-300 ease-out",
          open
            ? "h-11 w-[clamp(20rem,50%,50%)] border-neon-cyan/50 bg-white/[0.04] pr-1 shadow-glow-cyan"
            : "h-10 w-10 border-white/15 bg-white/[0.03]",
        )}
      >
        <button
          type="button"
          aria-label="Search"
          aria-expanded={open}
          onClick={() => (open ? submit() : setOpen(true))}
          className="grid size-10 shrink-0 place-items-center text-muted-foreground transition-colors hover:text-neon-cyan"
        >
          <Search className="size-4" />
        </button>
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search a part, model, or term…"
          aria-label="Search"
          autoComplete="off"
          tabIndex={open ? 0 : -1}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground",
            !open && "w-0",
          )}
        />
        {open && (
          <button
            type="button"
            aria-label="Close search"
            onClick={() => setOpen(false)}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </form>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={railBtn}>
            <ArrowUpDown className="size-4" />
            Sort
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
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
    </div>
  );
}
