import { existsSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@/lib/supabase/server";
import { listMyTrucks } from "@/lib/garage/queries";
import { getConditions, getRootCategories } from "@/lib/listings/cascade";
import type { FitsState } from "@/components/search/fits-my-truck-control";
import type { BrandItem } from "@/components/welcome/brand-grid";
import { WelcomeExplorer } from "@/components/welcome/welcome-explorer";

// The welcome landing at "/". NOT the feed (that lives at /browse now). It offers
// the four ways in: browse by brand (neon signage grid), browse everything, save a
// truck, and search by a saved truck. Reads auth (getClaims, never getSession) to
// resolve the truck options, so it renders per-request.
export const dynamic = "force-dynamic";

const PUBLIC_DIR = join(process.cwd(), "public");
const LOGO_EXTS = ["svg", "png", "webp"] as const;
const BG_CANDIDATES = [
  "night-bg.jpg",
  "night-bg.png",
  "night-bg.webp",
] as const;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Resolve a committed brand logo at /brands/<slug>.(svg|png|webp), or null so the
// card falls back to neon text. Stakeholder drops logos into public/brands/.
function resolveLogo(name: string): string | null {
  const slug = slugify(name);
  for (const ext of LOGO_EXTS) {
    if (existsSync(join(PUBLIC_DIR, "brands", `${slug}.${ext}`))) {
      return `/brands/${slug}.${ext}`;
    }
  }
  return null;
}

function resolveNightBg(): string | null {
  for (const file of BG_CANDIDATES) {
    if (existsSync(join(PUBLIC_DIR, file))) return `/${file}`;
  }
  return null;
}

export default async function WelcomePage() {
  const supabase = await createClient();

  const { data: makesData } = await supabase
    .from("makes")
    .select("id, name")
    .order("name");
  const brands: BrandItem[] = (makesData ?? []).map(
    (m: { id: number; name: string }) => ({
      id: m.id,
      name: m.name,
      logoSrc: resolveLogo(m.name),
    }),
  );

  // Cascade option data for the web visual explorer (small, static-ish lists;
  // models/configs are fetched on demand client-side per selection).
  const [rootCategories, conditions] = await Promise.all([
    getRootCategories(),
    getConditions(),
  ]);

  // Truck options state (getClaims, never getSession — invariant 6).
  const { data: claims } = await supabase.auth.getClaims();
  const isAuthenticated = !!claims?.claims;
  let fitsState: FitsState;
  if (!isAuthenticated) {
    fitsState = { variant: "anon" };
  } else {
    const trucks = await listMyTrucks();
    fitsState =
      trucks.length === 0 ? { variant: "empty" } : { variant: "has", trucks };
  }

  const nightBg = resolveNightBg();

  return (
    <main
      className={
        nightBg
          ? "night-bg flex flex-1 flex-col"
          : "night-bg night-stars flex flex-1 flex-col"
      }
      style={
        nightBg
          ? {
              backgroundImage: `linear-gradient(to bottom, oklch(0.1 0.02 264 / 0.45), oklch(0.06 0.01 264 / 0.8)), url(${nightBg})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }
          : undefined
      }
    >
      <div className="relative z-10 mx-auto my-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        {/* The visual filter explorer (cascade + chips) — responsive: single
            column on mobile, two columns on web. */}
        <WelcomeExplorer
          brands={brands}
          rootCategories={rootCategories}
          conditions={conditions}
          fitsState={fitsState}
        />
      </div>
    </main>
  );
}
