import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { listMyTrucks } from "@/lib/garage/queries";
import type { CascadeOption } from "@/lib/garage/cascade";
import { Toaster } from "@/components/ui/sonner";

import { AddTruckDialog } from "./add-truck-dialog";
import { TruckCard } from "./truck-card";

// Owner-scoped, per-user data — never cache one user's garage for another
// (invariant 6). The (app) layout already gates auth and is force-dynamic; we set
// it here too defensively (mirrors verify/page.tsx).
export const dynamic = "force-dynamic";

// My Garage (GRGE-01/02). Server Component: re-verify claims (defensive), read the
// owner's trucks via the stable listMyTrucks() contract, and load the Make options
// for the cascade. Renders the card grid or an actionable empty state. All writes
// flow through the Wave-2 actions inside the client dialog/card; router.refresh()
// re-runs this read so new/updated/removed cards appear instantly.
export default async function GaragePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }

  const trucks = await listMyTrucks();

  // Make options for the cascade — Phase-3 reference table, anon-public read.
  const { data: makesData } = await supabase
    .from("makes")
    .select("id, name")
    .order("name");
  const makes = (makesData ?? []) as CascadeOption[];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <div className="grid gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">My Garage</h1>
          <p className="text-muted-foreground text-sm">
            Save your trucks to filter parts that fit.
          </p>
        </div>
        {trucks.length > 0 && <AddTruckDialog makes={makes} />}
      </div>

      {trucks.length === 0 ? (
        <div className="mt-10 grid place-items-center gap-4 rounded-lg border border-dashed py-16 text-center">
          <div className="grid gap-1.5">
            <p className="font-medium">Your garage is empty</p>
            <p className="text-muted-foreground text-sm">
              Save your trucks to filter parts that fit.
            </p>
          </div>
          <AddTruckDialog makes={makes} />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {trucks.map((truck) => (
            <TruckCard key={truck.id} truck={truck} makes={makes} />
          ))}
        </div>
      )}

      <Toaster />
    </div>
  );
}
