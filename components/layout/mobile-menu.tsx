"use client";

import Link from "next/link";
import Image from "next/image";
import {
  Menu,
  MessageSquare,
  Heart,
  LogOutIcon,
  LogIn,
  UserPlus,
  Tag,
  List,
  Settings,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { logout } from "@/components/layout/logout-action";

// Mobile-only hamburger menu (hidden on sm+). Opens a sheet listing each nav
// entry as an icon + text label, with the sheet's built-in X to close. The
// search lupa stays OUTSIDE this menu (it lives in the header on every size).
export function MobileMenu({
  userId,
  username,
}: {
  userId: string | null;
  username: string;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Menu"
          className="size-11 rounded-full sm:hidden"
        >
          <Menu className="size-7" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader className="px-1">
          <SheetTitle>{userId ? username : "OG Truck Parts"}</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1">
          {userId ? (
            <>
              {/* VERF-02: Sell first (primary conversion). */}
              <MenuLink
                href="/sell"
                icon={<Tag className="size-5" />}
                label="Sell"
              />
              <MenuLink
                href="/messages"
                icon={<MessageSquare className="size-5" />}
                label="Messages"
              />
              <MenuLink
                href="/saved"
                icon={<Heart className="size-5 text-neon-red" />}
                label="Saved"
              />
              <MenuLink
                href={`/u/${username}`}
                icon={
                  <Image
                    src="/truck-icon.png"
                    alt=""
                    width={40}
                    height={40}
                    className="size-6"
                  />
                }
                label="My profile"
              />
              {/* VERF-03/04: seller + account management entries. */}
              <MenuLink
                href="/sell/listings"
                icon={<List className="size-5" />}
                label="My Listings"
              />
              <MenuLink
                href="/account"
                icon={<Settings className="size-5" />}
                label="Account"
              />
              <form action={logout}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-base text-destructive transition-colors hover:bg-muted"
                >
                  <LogOutIcon className="size-5" />
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <MenuLink
                href="/login"
                icon={<LogIn className="size-5" />}
                label="Sign in"
              />
              <MenuLink
                href="/register"
                icon={<UserPlus className="size-5" />}
                label="Register"
              />
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

// A single menu row. Wrapped in SheetClose so tapping it dismisses the sheet.
function MenuLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <SheetClose asChild>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-lg px-3 py-3 text-base transition-colors hover:bg-muted"
      >
        {icon}
        <span>{label}</span>
      </Link>
    </SheetClose>
  );
}
