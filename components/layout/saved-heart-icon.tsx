"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// The Saved entry (SOCL-02). The heart is a red OUTLINE by default; on the Saved
// route it fills solid red (fill-current) and lights its red neon glow. Hovering
// anywhere lights the glow too — same neon language as the other nav icons, but
// red instead of cyan to signal "favorites".
export function SavedHeartIcon() {
  const pathname = usePathname();
  const active = pathname === "/saved" || pathname.startsWith("/saved/");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          variant="ghost"
          size="icon"
          data-active={active ? "true" : undefined}
          className={cn(
            "nav-glow nav-glow-red size-11 rounded-full text-neon-red",
          )}
        >
          <Link href="/saved" aria-label="Saved">
            <Heart className={cn("size-7", active && "fill-current")} />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Saved</TooltipContent>
    </Tooltip>
  );
}
