import Link from "next/link";
import Image from "next/image";
import { Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/layout/user-menu";
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
    <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
      <Link
        href="/"
        className="flex items-center gap-2 font-semibold tracking-tight"
      >
        {/* Decorative logo mark beside the wordmark. alt="" keeps the link's
            accessible name exactly "OG Truck Parts" (from the text) so the
            Plan 03 e2e link-name assertions stay green. Explicit width/height
            => no CLS. .neon-sign is this phase's single signature flicker
            moment; it freezes static under prefers-reduced-motion. */}
        <span className="neon-sign inline-flex">
          <Image
            src="/logo-mark.png"
            alt=""
            width={28}
            height={28}
            priority
            className="size-6 sm:size-7"
          />
        </span>
        OG Truck Parts
      </Link>
      <div className="flex items-center gap-1">
        {userId ? (
          <>
            {/* MSG-05: the Messages entry point with the live unread count. */}
            <MessagesBadge userId={userId} />
            {/* SOCL-02: the saved-listings entry point. */}
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <Link href="/saved">
                <Heart className="size-4" />
                <span className="hidden sm:inline">Saved</span>
              </Link>
            </Button>
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
    </header>
  );
}
