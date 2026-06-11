"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  FileSpreadsheet,
  Flag,
  LayoutDashboard,
  Library,
  MessageSquare,
  Package,
  Tags,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// The LOCKED admin nav, in this exact order (phase context):
// Dashboard, Users, Listings, Reports, Messages, Categories, Fitment Library.
// Categories points into the Fitment Library section (level 5 of the same
// taxonomy) but keeps its own top-level link per the locked list.
const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/listings", label: "Listings", icon: Package },
  { href: "/admin/reports", label: "Reports", icon: Flag },
  { href: "/admin/messages", label: "Messages", icon: MessageSquare },
  { href: "/admin/fitment/part_categories", label: "Categories", icon: Tags },
  { href: "/admin/fitment", label: "Fitment Library", icon: Library },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  // "Fitment Library" must not light up for the Categories sub-route.
  if (href === "/admin/fitment") {
    return (
      pathname === "/admin/fitment" ||
      (pathname.startsWith("/admin/fitment/") &&
        !pathname.startsWith("/admin/fitment/part_categories"))
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();

  // Desktop (md+): vertical fixed sidebar. Mobile: the same nav collapses to
  // a horizontally scrollable top bar — simple fallback, nothing breaks.
  return (
    <nav
      className="flex h-full flex-row gap-1 overflow-x-auto p-3 md:flex-col md:overflow-visible"
      aria-label="Admin"
    >
      <p className="hidden px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:block">
        Admin Console
      </p>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
            isActive(pathname, href)
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <Icon className="size-4 shrink-0" />
          {label}
        </Link>
      ))}

      <div className="flex flex-row gap-1 md:mt-auto md:flex-col md:border-t md:pt-3">
        <Link
          href="/admin/import"
          className={cn(
            "flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
            isActive(pathname, "/admin/import")
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <FileSpreadsheet className="size-4 shrink-0" />
          CSV Import
        </Link>
        <Link
          href="/"
          className="flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <ArrowLeft className="size-4 shrink-0" />
          Back to site
        </Link>
      </div>
    </nav>
  );
}
