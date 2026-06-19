import Link from "next/link";
import Image from "next/image";
import { Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/layout/user-menu";
import { HeaderSearch } from "@/components/layout/header-search";
import { NavIconLink } from "@/components/layout/nav-icon-link";
import { SavedHeartIcon } from "@/components/layout/saved-heart-icon";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { MessagesBadge } from "@/components/messaging/messages-badge";

// The shared site header — mounted by BOTH the (app) and (public) layouts so
// the Messages entry (MSG-05) is always visible to authed users, including on
// the anon-open feed/listing pages. Auth-aware: claims → Messages/Saved/menu;
// anonymous → Sign in / Register. Every consumer layout is force-dynamic
// (invariant 6), so the per-request getClaims read here is never cached
// across users.
export async function SiteHeader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = (data?.claims?.sub as string | undefined) ?? null;

  let username = "Account";
  if (userId) {
    // Public, non-PII handle for the header menu.
    const { data: profile } = await supabase
      .from("profiles_public")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    username = profile?.username ?? "Account";
  }

  return (
    <header className="relative flex h-16 items-center justify-between border-b px-4 sm:h-20 sm:px-6">
      {/* Icon-only brand link (web). alt="OG Truck Parts" gives the link its
          accessible name now that the text wordmark is gone — keeps a11y sound
          AND keeps the Plan 03 e2e link-name assertion green. The mark is
          trimmed tight to the shield (no padding box) and renders at full
          header height (w-auto preserves its aspect ratio => no CLS). */}
      <Link href="/" className="ml-2 flex h-full items-center py-2 sm:ml-4">
        <Image
          src="/logo-mark.png"
          alt="OG Truck Parts"
          width={232}
          height={160}
          priority
          className="h-full w-auto"
        />
      </Link>
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Search — click the lupa to unroll the search field. Visible at every
            size (the mobile hamburger deliberately excludes it). */}
        <HeaderSearch />

        {/* Desktop (sm+): the full icon row. */}
        <div className="hidden items-center gap-1 sm:flex sm:gap-2">
          {userId ? (
            <>
              {/* VERF-02: Sell is the PRIMARY conversion — always visible,
                  leftmost of the action cluster. The (app) layout auth-gates
                  /sell, so it links straight to the create-listing flow. */}
              <NavIconLink href="/sell" label="Sell" exact>
                <Tag className="size-6" />
              </NavIconLink>
              {/* MSG-05: the Messages entry point with the live unread count. */}
              <MessagesBadge userId={userId} />
              {/* SOCL-02: the saved-listings entry point (red neon heart). */}
              <SavedHeartIcon />
              <UserMenu username={username} />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Register</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile (<sm): hamburger → sheet with the same entries as icon+text. */}
        <MobileMenu userId={userId} username={username} />
      </div>
    </header>
  );
}
