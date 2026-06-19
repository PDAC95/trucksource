"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOutIcon, UserIcon, List, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { logout } from "@/components/layout/logout-action";

// Header dropdown shown on every (app) page. Client component because Radix
// DropdownMenu uses client-only state/IDs (rendering it on the server caused a
// hydration mismatch). The username comes from world-readable profiles_public
// (never PII); logout is the imported 'use server' action (ACCT-06).
export function UserMenu({ username }: { username: string }) {
  const pathname = usePathname();
  const active = pathname === "/account" || pathname.startsWith("/account/");

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              data-active={active ? "true" : undefined}
              className="nav-glow nav-glow-cyan size-12 rounded-full"
              aria-label={username}
            >
              <Image
                src="/truck-icon.png"
                alt=""
                width={80}
                height={80}
                className="size-10"
              />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{username}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={10} className="w-64 p-2">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-neon-cyan/30">
            <Image
              src="/truck-icon.png"
              alt=""
              width={56}
              height={56}
              className="size-7"
            />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{username}</p>
            <p className="text-xs text-muted-foreground">Signed in</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-3 py-2.5 text-sm">
          <a href={`/u/${username}`}>
            <UserIcon className="size-4" />
            My profile
          </a>
        </DropdownMenuItem>
        {/* VERF-03/04: seller listings + account management entries. */}
        <DropdownMenuItem asChild className="gap-3 py-2.5 text-sm">
          <a href="/sell/listings">
            <List className="size-4" />
            My Listings
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-3 py-2.5 text-sm">
          <a href="/account">
            <Settings className="size-4" />
            Account
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logout}>
          <DropdownMenuItem
            asChild
            variant="destructive"
            className="gap-3 py-2.5 text-sm"
          >
            <button type="submit" className="w-full">
              <LogOutIcon className="size-4" />
              Log out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
