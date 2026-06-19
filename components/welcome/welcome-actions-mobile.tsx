"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Truck, ChevronDown } from "lucide-react";

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

// Mobile-only (<sm) compact version of the four welcome entry points, on a single
// line: "Add" on the left; "All" + "My Truck" on the right. All and My Truck apply
// the filter immediately (navigate to the feed / the fits-filtered feed). The big
// stacked buttons render instead on sm+.
function truckLabel(t: GarageTruck): string {
  const base = `${t.year} ${t.makeName} ${t.modelName}`.trim();
  return t.configName ? `${base} · ${t.configName}` : base;
}

const pill =
  "flex items-center gap-1.5 rounded-full border-2 bg-black/40 px-3 py-1.5 text-sm font-semibold uppercase tracking-wide transition-all";

export function WelcomeActionsMobile({ state }: { state: FitsState }) {
  const router = useRouter();
  const addHref = state.variant === "anon" ? "/login" : "/profile/garage";

  function onPick(value: string, trucks: GarageTruck[]) {
    const truck = trucks.find((t) => String(t.id) === value);
    if (!truck) return;
    // Populate Make/Model/Config from the truck so /browse shows them selected.
    const params = new URLSearchParams();
    params.set("make", String(truck.makeId));
    params.set("model", String(truck.modelId));
    if (truck.configId !== null) {
      params.set("config", String(truck.configId));
    }
    router.push(`${FEED_PATH}?${params.toString()}`);
  }

  return (
    <div className="flex w-full items-center justify-between gap-2 sm:hidden">
      {/* Left: Add a truck */}
      <Link
        href={addHref}
        className={cn(
          pill,
          "border-neon-cyan/60 text-neon-cyan hover:shadow-glow-cyan",
        )}
      >
        <Plus className="size-4" />
        Add
      </Link>

      {/* Right: All + My Truck (apply filters immediately) */}
      <div className="flex items-center gap-2">
        <Link
          href={FEED_PATH}
          className={cn(
            pill,
            "border-neon-cyan/60 text-neon-cyan hover:shadow-glow-cyan",
          )}
        >
          All
        </Link>

        {state.variant === "has" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  pill,
                  "group border-neon-red/60 text-neon-red hover:shadow-glow-red",
                )}
              >
                <Truck className="size-4" />
                My Truck
                <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="min-w-56"
            >
              {state.trucks.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onSelect={() => onPick(String(t.id), state.trucks)}
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
              pill,
              "border-neon-red/60 text-neon-red hover:shadow-glow-red",
            )}
          >
            <Truck className="size-4" />
            My Truck
          </Link>
        )}
      </div>
    </div>
  );
}
