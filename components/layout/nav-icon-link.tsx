"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// A header nav icon that lights up with a cyan neon glow on hover and stays lit
// when its route is active (the Saved heart has its own red-fill variant). The
// label is hidden and only surfaces in the hover tooltip. The glow is a neon
// box-shadow token (shadow-glow-cyan) behind the rounded button.
export function NavIconLink({
  href,
  label,
  exact = false,
  className,
  children,
}: {
  href: string;
  label: string;
  exact?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          variant="ghost"
          size="icon"
          data-active={active ? "true" : undefined}
          className={cn(
            "nav-glow nav-glow-cyan size-11 rounded-full",
            "hover:text-neon-cyan data-[active=true]:text-neon-cyan",
            className,
          )}
        >
          <Link href={href} aria-label={label}>
            {children}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
