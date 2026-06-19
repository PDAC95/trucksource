"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { autocompleteAction } from "@/lib/search/autocomplete-action";
import { FEED_PATH } from "@/lib/search/params";

// Keyword input that drives the `q` URL param (all-state-in-URL, LOCKED). On submit (or
// suggestion select) it router.replace-es "/?q=…" preserving the other facet params. A
// debounced (~200ms) autocomplete dropdown calls the autocomplete server action and
// shows suggested slang/common terms + matching listing titles; picking one sets q.
//
// Lightweight dropdown (not shadcn Command — cmdk isn't vendored): a div listbox with
// keyboard-dismiss on Escape and blur-close. Accessible enough for v1; the URL is the
// source of truth so refresh/back/forward all work.

const DEBOUNCE_MS = 200;

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";

  const [value, setValue] = React.useState(initialQ);
  const [open, setOpen] = React.useState(false);
  const [terms, setTerms] = React.useState<string[]>([]);
  const [titles, setTitles] = React.useState<string[]>([]);
  const [lastUrlQ, setLastUrlQ] = React.useState(initialQ);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // Keep the input in sync if the URL q changes from elsewhere (chip removal etc).
  // Render-time adjustment (not an effect) so the lint set-state-in-effect rule passes.
  if (initialQ !== lastUrlQ) {
    setLastUrlQ(initialQ);
    setValue(initialQ);
  }

  function commit(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = next.trim();
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    // New keyword resets the exact-term escape hatch and the page cursor.
    params.delete("exact");
    params.delete("page");
    setOpen(false);
    const qs = params.toString();
    router.replace(qs ? `${FEED_PATH}?${qs}` : FEED_PATH, { scroll: false });
  }

  function onChange(next: string) {
    setValue(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    const prefix = next.trim();
    if (prefix === "") {
      setTerms([]);
      setTitles([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        const result = await autocompleteAction(prefix);
        setTerms(result.terms);
        setTitles(result.titles);
        setOpen(result.terms.length > 0 || result.titles.length > 0);
      } catch {
        setOpen(false);
      }
    }, DEBOUNCE_MS);
  }

  // Close the dropdown on outside click.
  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const hasSuggestions = terms.length > 0 || titles.length > 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          commit(value);
        }}
        className="flex items-center gap-2"
        role="search"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => hasSuggestions && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Search a part, model, or term…"
            aria-label="Search"
            autoComplete="off"
            className="border-white/10 bg-white/[0.03] pl-8 focus-visible:border-neon-cyan/50"
          />
        </div>
        <Button type="submit" variant="default">
          Search
        </Button>
      </form>

      {open && hasSuggestions && (
        <div
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg bg-popover py-1 text-sm shadow-md ring-1 ring-foreground/10"
        >
          {terms.length > 0 && (
            <div className="px-1 py-0.5">
              <p className="px-2 py-1 text-xs text-muted-foreground">Terms</p>
              {terms.map((term) => (
                <button
                  key={`term-${term}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    setValue(term);
                    commit(term);
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                >
                  {term}
                </button>
              ))}
            </div>
          )}
          {titles.length > 0 && (
            <div className="px-1 py-0.5">
              <p className="px-2 py-1 text-xs text-muted-foreground">
                Listings
              </p>
              {titles.map((title, i) => (
                <button
                  key={`title-${i}-${title}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    setValue(title);
                    commit(title);
                  }}
                  className="block w-full truncate rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                >
                  {title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
