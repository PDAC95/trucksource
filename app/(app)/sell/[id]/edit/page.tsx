import { redirect, notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getListing } from "@/lib/listings/queries";
import { getConditions, getPartCategories } from "@/lib/listings/cascade";
import type { CascadeOption } from "@/lib/garage/cascade";
import { listingPhotoPublicUrl } from "@/lib/listings/storage";
import type { ListingInput } from "@/lib/listings/schema";
import type { ListingFormDefaults } from "@/components/listings/listing-form";
import type { FitmentSelection } from "@/components/listings/fitment-multi-select";
import type { UploadedPhoto } from "@/components/listings/photo-uploader";
import { Toaster } from "@/components/ui/sonner";

import { ListingForm } from "@/components/listings/listing-form";

// Owner-only edit page (LIST-05) — never cache one seller's edit form for another
// (invariant 6). Reached from the /sell/listings index.
export const dynamic = "force-dynamic";

// The raw editable shape we read directly (the public getListing returns NAMES, but
// the form pre-fill needs the persisted IDs: condition_id, fitment model/config ids,
// shipping_option, etc.). We fetch it owner-scoped and ownership-check via seller_id:
// a row that isn't the caller's (or doesn't exist) collapses to notFound() — no
// edit-others, no existence leak (the updateTruck rule).
type EditableRow = {
  id: number;
  seller_id: string;
  title: string;
  part_number: string | null;
  asking_price: number;
  condition_id: number;
  shipping_option: string;
  damage_notes: string | null;
  is_barnyard: boolean;
  listing_photos: { storage_path: string; sort_order: number }[] | null;
  listing_fitment:
    | {
        model_id: number;
        config_id: number | null;
        models: { name: string; makes: { name: string } | null } | null;
        configurations: { name: string } | null;
      }[]
    | null;
  listing_categories: { category_id: number }[] | null;
  listing_search_terms: { term_id: number }[] | null;
};

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listingId = Number(id);
  if (!Number.isInteger(listingId) || listingId <= 0) notFound();

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    redirect("/login");
  }
  const userId = claims.claims.sub;

  // Existence check via the canonical public reader: a nonexistent id -> notFound.
  // (getListing returns PUBLIC data only — NAMES, not the ids the form pre-fill needs
  // — so we ALSO fetch the editable row below, owner-scoped, for the ids.)
  const exists = await getListing(listingId);
  if (!exists) notFound();

  // Owner-scoped fetch of the editable row + children. We filter by seller_id, so a
  // non-owner returns no row -> notFound (no edit-others, no existence leak).
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, seller_id, title, part_number, asking_price, condition_id, shipping_option, damage_notes, is_barnyard, " +
        "listing_photos ( storage_path, sort_order ), " +
        "listing_fitment ( model_id, config_id, models:model_id ( name, makes:make_id ( name ) ), configurations:config_id ( name ) ), " +
        "listing_categories ( category_id ), " +
        "listing_search_terms ( term_id )",
    )
    .eq("id", listingId)
    .eq("seller_id", userId)
    .maybeSingle();

  if (error || !data) notFound();

  const row = data as unknown as EditableRow;
  // Belt-and-suspenders: confirm ownership even though the query already scoped it.
  if (row.seller_id !== userId) notFound();

  // Map fitment rows -> FitmentSelection (ids + display names).
  const fitment: FitmentSelection[] = (row.listing_fitment ?? []).map((f) => ({
    modelId: f.model_id,
    configId: f.config_id ?? null,
    makeName: f.models?.makes?.name ?? "",
    modelName: f.models?.name ?? "",
    configName: f.configurations?.name ?? null,
  }));

  // Map existing photos -> ready UploadedPhotos (public URL as the preview; the
  // storage_path is what the form submits back).
  const photos: UploadedPhoto[] = (row.listing_photos ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({
      id: p.storage_path,
      path: p.storage_path,
      previewUrl: listingPhotoPublicUrl(supabase, p.storage_path),
      status: "ready" as const,
    }));

  // Phase-6 pre-fill (FINT-03): the persisted category/term ids feed the form's
  // defaults so the suggestion UI (Plan 06-04) can EXCLUDE already-confirmed tags
  // from re-suggestion (Pitfall 5 "don't re-suggest confirmed").
  const categoryIds: number[] = (row.listing_categories ?? []).map(
    (c) => c.category_id,
  );
  const searchTermIds: number[] = (row.listing_search_terms ?? []).map(
    (t) => t.term_id,
  );

  const defaults: ListingFormDefaults = {
    title: row.title,
    partNumber: row.part_number ?? "",
    askingPrice: row.asking_price,
    conditionId: row.condition_id,
    shippingOption: row.shipping_option as ListingInput["shippingOption"],
    damageNotes: row.damage_notes ?? "",
    isBarnyard: row.is_barnyard,
    fitment,
    photos,
    categoryIds,
    searchTermIds,
  };

  // Account contact preference (added in 05-05) — DISPLAY-ONLY, defaulted defensively.
  let contactPreference = "messaging_only";
  try {
    const { data: pref } = await supabase
      .from("profiles_public")
      .select("contact_preference")
      .eq("id", userId)
      .maybeSingle();
    const value = (pref as { contact_preference?: string } | null)
      ?.contact_preference;
    if (value) contactPreference = value;
  } catch {
    // Column not present yet (pre-05-05) — keep the default.
  }

  const { data: makesData } = await supabase
    .from("makes")
    .select("id, name")
    .order("name");
  const makes = (makesData ?? []) as CascadeOption[];

  const conditions = await getConditions();
  // Phase-6 part-category tree — drives the Fitment suggestion trigger in edit mode
  // (06-04). The form pre-fills categoryId from defaults.categoryIds[0].
  const partCategories = await getPartCategories();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Edit listing</h1>
        <p className="text-muted-foreground text-sm">
          Update your part, fitment, photos, or shipping.
        </p>
      </div>

      <ListingForm
        mode="edit"
        listingId={row.id}
        defaults={defaults}
        makes={makes}
        conditions={conditions}
        partCategories={partCategories}
        contactPreference={contactPreference}
      />

      <Toaster />
    </div>
  );
}
