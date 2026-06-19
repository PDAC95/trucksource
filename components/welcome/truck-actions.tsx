"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Truck, BookmarkPlus, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { FEED_PATH } from "@/lib/search/params";
import type { FitsState } from "@/components/search/fits-my-truck-control";
import type { GarageTruck } from "@/lib/garage/queries";

// Two of the welcome landing's four entry points, both auth/garage-aware (it
// reuses the same FitsState the feed resolves server-side):
//   - "Save my truck" → garage (anon → login).
//   - "Search by my truck" → if the viewer has saved trucks, a picker that
//     routes to the feed pre-filtered by fitment (/browse?fits=…); otherwise a
//     CTA to add one (or sign in).
function truckLabel(t: GarageTruck): string {
  const base = `${t.year} ${t.makeName} ${t.modelName}`.trim();
  return t.configName ? `${base} · ${t.configName}` : base;
}

const cardBase =
  "group flex items-center gap-3 rounded-xl border-2 bg-black/40 px-4 py-3 text-left transition-all duration-200";

const cardTitle = "block text-xl uppercase tracking-wide transition-all";

// Per-card hover glow on the title text (neon text-shadow + color intensify).
const titleGlowCyan =
  "group-hover:text-neon-cyan group-hover:[text-shadow:var(--text-shadow-neon-cyan)]";
const titleGlowRed =
  "group-hover:text-neon-red group-hover:[text-shadow:var(--text-shadow-neon-red)]";

export function TruckActions({ state }: { state: FitsState }) {
  const router = useRouter();

  const saveHref = state.variant === "anon" ? "/login" : "/profile/garage";

  function onPickTruck(value: string, trucks: GarageTruck[]) {
    const truck = trucks.find((t) => String(t.id) === value);
    if (!truck) return;
    // Populate the Make/Model/Config facets from the truck so /browse shows them
    // selected (and the "Your truck" pill reads as active).
    const params = new URLSearchParams();
    params.set("make", String(truck.makeId));
    params.set("model", String(truck.modelId));
    if (truck.configId !== null) {
      params.set("config", String(truck.configId));
    }
    router.push(`${FEED_PATH}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Save my truck */}
      <Link
        href={saveHref}
        className={cn(
          cardBase,
          "border-neon-cyan/50 hover:border-neon-cyan hover:shadow-glow-cyan",
        )}
      >
        <BookmarkPlus className="size-6 shrink-0 text-neon-cyan" />
        <span>
          <span
            className={cn(cardTitle, titleGlowCyan)}
            style={{ fontFamily: "var(--ff-godsown)" }}
          >
            Save my truck
          </span>
          <span className="block text-xs text-muted-foreground">
            {state.variant === "anon"
              ? "Sign in to save your rig"
              : "Add a truck to your garage"}
          </span>
        </span>
      </Link>

      {/* Search by my truck */}
      {state.variant === "has" ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                cardBase,
                "w-full border-neon-red/50 hover:border-neon-red hover:shadow-glow-red",
              )}
            >
              <Truck className="size-6 shrink-0 text-neon-red" />
              <span className="flex-1">
                <span
                  className={cn(cardTitle, titleGlowRed)}
                  style={{ fontFamily: "var(--ff-godsown)" }}
                >
                  Search by my truck
                </span>
                <span className="block text-xs text-muted-foreground">
                  Pick one of your saved trucks
                </span>
              </span>
              <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={8}
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            {state.trucks.map((t) => (
              <DropdownMenuItem
                key={t.id}
                onSelect={() => onPickTruck(String(t.id), state.trucks)}
                className="gap-2.5 py-2.5"
              >
                <Truck className="size-4 shrink-0 text-neon-red" />
                <span className="truncate">
                  {t.nickname
                    ? `${t.nickname} — ${truckLabel(t)}`
                    : truckLabel(t)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Link
          href={state.variant === "anon" ? "/login" : "/profile/garage"}
          className={cn(
            cardBase,
            "border-neon-red/50 hover:border-neon-red hover:shadow-glow-red",
          )}
        >
          <Truck className="size-6 shrink-0 text-neon-red" />
          <span>
            <span
              className={cn(cardTitle, titleGlowRed)}
              style={{ fontFamily: "var(--ff-godsown)" }}
            >
              Search by my truck
            </span>
            <span className="block text-xs text-muted-foreground">
              {state.variant === "anon"
                ? "Sign in and add a truck to filter by fitment"
                : "Add a truck to filter by fitment"}
            </span>
          </span>
        </Link>
      )}
    </div>
  );
}
