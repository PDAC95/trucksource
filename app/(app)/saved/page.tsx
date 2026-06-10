import { redirect } from "next/navigation";
import Link from "next/link";
import { Heart } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getMySavedListings } from "@/lib/saves/queries";
import { ListingCard } from "@/components/search/listing-card";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

// Owner-scoped saved listings (SOCL-02) — never cache one user's saves for
// another (invariant 6). Mirrors /sell/listings/page.tsx's guard even though the
// (app) layout already redirects anon (defense in depth, same precedent).
export const dynamic = "force-dynamic";

// LOCKED: sold/expired saves REMAIN visible with a "Vendido"/"Expirado" badge —
// they are never silently dropped (getMySavedListings hydrates ANY status and
// derives the effective status). Manual removal = tapping the heart, which
// unsaves via toggleSave and revalidates "/saved".
export default async function SavedPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }

  const saved = await getMySavedListings();

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Guardados</h1>
          {saved.length > 0 && (
            <span className="text-muted-foreground text-sm">
              {saved.length}{" "}
              {saved.length === 1 ? "anuncio guardado" : "anuncios guardados"}
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          Los anuncios que marcaste con el corazón.
        </p>
      </div>

      {saved.length === 0 ? (
        <div className="mt-10 grid place-items-center gap-4 rounded-lg border border-dashed py-16 text-center">
          <Heart className="text-muted-foreground size-8" />
          <div className="grid gap-1.5">
            <p className="font-medium">No tienes anuncios guardados</p>
            <p className="text-muted-foreground text-sm">
              Toca el corazón en cualquier anuncio para guardarlo aquí.
            </p>
          </div>
          <Button asChild>
            <Link href="/">Explorar anuncios</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {saved.map((card) => (
            <li key={card.id}>
              <ListingCard
                card={card}
                saveState={{ initiallySaved: true, isAuthenticated: true }}
                statusBadge={
                  card.status === "sold"
                    ? "Vendido"
                    : card.status === "expired"
                      ? "Expirado"
                      : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}

      <Toaster />
    </div>
  );
}
