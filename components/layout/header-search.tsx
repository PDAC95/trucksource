"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FEED_PATH } from "@/lib/search/params";

// Header search: clicking the lupa smoothly unrolls a search field that grows
// LEFTWARD from the icon's position (never past 1/3 of the page width), with a
// ready-to-type input + a Search button. Escape, outside-click, or submit close
// it. Submitting navigates to the feed/search screen at "/?q=…".
export function HeaderSearch() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `${FEED_PATH}?q=${encodeURIComponent(q)}` : FEED_PATH);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative flex items-center">
      {/* Trigger lupa — in flow so it reserves the slot. Hidden (kept in layout)
          while open; the expanding bar takes over visually. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className={cn(
              "nav-glow nav-glow-cyan size-11 rounded-full hover:text-neon-cyan",
              open && "invisible",
            )}
          >
            <Search className="size-7" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Search</TooltipContent>
      </Tooltip>

      {/* Expanding search bar — anchored to the lupa's right edge, grows left.
          Width animates from the icon size to ~1/3 of the viewport. */}
      <form
        onSubmit={submit}
        role="search"
        aria-hidden={!open}
        className={cn(
          "absolute top-1/2 right-0 z-50 flex -translate-y-1/2 items-center gap-1.5 overflow-hidden rounded-full border bg-background pr-1 pl-3 transition-[width,opacity] duration-300 ease-out",
          open
            ? "w-[60vw] border-border opacity-100 sm:w-[33vw]"
            : "pointer-events-none w-11 border-transparent opacity-0",
        )}
      >
        <Search className="size-5 shrink-0 text-neon-cyan" />
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search a part, model, or term…"
          aria-label="Search"
          autoComplete="off"
          tabIndex={open ? 0 : -1}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="sm" className="shrink-0 rounded-full">
          Search
        </Button>
      </form>
    </div>
  );
}
