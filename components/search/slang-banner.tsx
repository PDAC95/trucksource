"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";

// Transparency banner (LOCKED: never silently swap the query). Two modes:
//  - "slang": the query was expanded/corrected — show "Showing results for
//    '<canonical>' (you searched: '<raw>')" with a path back to the EXACT raw term.
//  - "fuzzy": the trigram fallback supplied near matches — a softer "Results
//    similar to '<raw>'" note.
// The "exact term" escape hatch router.replace-es with `&exact=1` + the raw q, which
// the reader uses to bypass slang expansion (so the user can force the literal search).
//
// Prop-only: the page resolves raw/canonical via expandSlang and decides the mode.

export function SlangBanner({
  raw,
  canonical,
  mode = "slang",
}: {
  raw: string;
  canonical?: string | null;
  mode?: "slang" | "fuzzy";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function searchExact() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("q", raw);
    params.set("exact", "1");
    params.delete("page");
    router.replace(`/?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
      <Info className="size-4 shrink-0 text-muted-foreground" />
      {mode === "slang" && canonical ? (
        <span>
          Showing results for{" "}
          <span className="font-medium">&ldquo;{canonical}&rdquo;</span>{" "}
          <span className="text-muted-foreground">
            (you searched: &ldquo;{raw}&rdquo;)
          </span>
        </span>
      ) : (
        <span>
          Results similar to{" "}
          <span className="font-medium">&ldquo;{raw}&rdquo;</span>
        </span>
      )}
      <Button
        variant="link"
        size="sm"
        className="h-auto px-0"
        onClick={searchExact}
      >
        Search the exact term
      </Button>
    </div>
  );
}
