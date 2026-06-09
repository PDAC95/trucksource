"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  listingSchema,
  type ListingInput,
  type ListingFormValues,
} from "@/lib/listings/schema";
import type { CascadeOption } from "@/lib/garage/cascade";
import type {
  ConditionOption,
  PartCategoryOption,
} from "@/lib/listings/cascade";
import { suggestFitment } from "@/lib/fitment/suggest";
import type {
  SuggestionGroup,
  SuggestedFitment,
  SuggestedTag,
} from "@/lib/fitment/types";
import {
  createListing,
  updateListing,
  type CreateListingResult,
  type UpdateListingResult,
} from "@/lib/actions/listings";
import { findSimilarOwnListings } from "@/lib/listings/duplicates";
import type { SimilarListing } from "@/lib/listings/duplicates";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

import {
  FitmentMultiSelect,
  type FitmentSelection,
} from "./fitment-multi-select";
import { PhotoUploader, type UploadedPhoto } from "./photo-uploader";
import { DuplicateWarning } from "./duplicate-warning";
import { FitmentSuggestions } from "./fitment-suggestions";

// The single sectioned create/edit listing form (CONTEXT: ONE page with sections,
// NOT a wizard, NO draft state). RHF + zodResolver(listingSchema) — the SAME schema
// the Server Action re-validates (single client+server source of truth). Sections:
// Part data → Fitment → Photos → Shipping. Edit mode reuses this same component
// pre-filled. On success: redirect to the public listing page (CONTEXT).
//
// Photos: the PhotoUploader manages an UploadedPhoto[] (each uploads immediately,
// EXIF stripped server-side); we map the ordered READY paths into photoPaths just
// before submit. Fitment: FitmentMultiSelect manages a FitmentSelection[] (names +
// ids); we strip to {modelId, configId} for the schema. The account contact
// preference is DISPLAY-ONLY here (CONTEXT: the listing form never edits it; the
// control lives on the account page in 05-05).

type ActionError =
  | Extract<CreateListingResult, { ok: false }>["error"]
  | Extract<UpdateListingResult, { ok: false }>["error"];

function actionErrorMessage(error: ActionError): string {
  switch (error) {
    case "invalid_combo":
      return "One of your fitment selections isn't in our library. Remove it and try again.";
    case "invalid_photo_path":
      return "There was a problem with your photos. Please re-add them and try again.";
    case "not_found":
      return "That listing no longer exists. Refresh and try again.";
    case "unauthenticated":
      return "Your session expired — please log in again.";
    case "insert_failed":
    case "invalid":
    default:
      return "Something went wrong. Check the form and try again.";
  }
}

const SHIPPING_OPTIONS: {
  value: ListingInput["shippingOption"];
  label: string;
}[] = [
  { value: "shipping_available", label: "Shipping Available" },
  { value: "local_pickup", label: "Local Pickup Only" },
  { value: "shipping_assistance", label: "Shipping Assistance Requested" },
];

const CONTACT_PREFERENCE_LABEL: Record<string, string> = {
  email_only: "Email Only",
  email_and_phone: "Email + Phone",
  messaging_only: "Marketplace Messaging Only",
};

export type ListingFormDefaults = {
  title: string;
  partNumber: string;
  askingPrice: number;
  conditionId: number;
  shippingOption: ListingInput["shippingOption"];
  damageNotes: string;
  isBarnyard: boolean;
  fitment: FitmentSelection[];
  photos: UploadedPhoto[];
  // Phase-6 persisted dimensions (FINT-03). Optional here so the create path (no
  // pre-fill) and the edit path (read-back from page.tsx) both type-check. Plan
  // 06-04 owns this form and wires these into the category selector + suggestion
  // chips; this is the minimal unblocking field so the edit-page pre-fill compiles.
  categoryIds?: number[];
  searchTermIds?: number[];
};

export function ListingForm({
  mode,
  listingId,
  makes,
  conditions,
  partCategories = [],
  contactPreference,
  defaults,
}: {
  mode: "create" | "edit";
  listingId?: number;
  makes: CascadeOption[];
  conditions: ConditionOption[];
  // Optional-with-default so a page that hasn't yet wired getPartCategories still
  // type-checks and simply renders no category options.
  partCategories?: PartCategoryOption[];
  contactPreference?: string;
  defaults?: ListingFormDefaults;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  // Photos + fitment live outside RHF (they're component-managed), then are merged
  // into the validated payload at submit time.
  const [photos, setPhotos] = React.useState<UploadedPhoto[]>(
    defaults?.photos ?? [],
  );
  const [fitment, setFitment] = React.useState<FitmentSelection[]>(
    defaults?.fitment ?? [],
  );
  const [isBarnyard, setIsBarnyard] = React.useState<boolean>(
    defaults?.isBarnyard ?? false,
  );
  const [fitmentError, setFitmentError] = React.useState<string | null>(null);

  // ── Phase-6 Fitment Intelligence (FINT-01/02) ─────────────────────────────
  // The single-select Part Category is the suggestion TRIGGER; `categoryIds` is
  // the persisted M2M (CONTEXT: storage M2M, UI single-select v1). Setting the
  // select updates BOTH. `searchTerms` holds accepted slang/special-filter/category
  // tags; the submit array `searchTermIds` derives from it. `suggestions` is the
  // ONLY thing the debounced effect writes — it NEVER touches `fitment` (FINT-02).
  const [categoryId, setCategoryId] = React.useState<number | null>(
    defaults?.categoryIds?.[0] ?? null,
  );
  const [categoryIds, setCategoryIds] = React.useState<number[]>(
    defaults?.categoryIds ?? [],
  );
  const [searchTerms, setSearchTerms] = React.useState<SuggestedTag[]>([]);
  const [suggestions, setSuggestions] = React.useState<SuggestionGroup[]>([]);
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const [isSuggesting, startSuggest] = React.useTransition();

  // THE ONLY effect in this Fitment flow. It debounces suggestFitment on the
  // chosen category and writes ONLY `suggestions` — never `fitment`, never any
  // confirmed state (FINT-02). Acceptance happens exclusively in the click
  // handlers below.
  React.useEffect(() => {
    const t = setTimeout(() => {
      startSuggest(async () => {
        const res = await suggestFitment({ partCategoryId: categoryId });
        setSuggestions(res.groups);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [categoryId]);

  // Same-seller duplicate warning (LIST-10), CREATE path only. The probe runs on
  // publish-attempt; if the seller already has similar listings we show a
  // non-blocking dialog and stash the validated payload until they confirm. The
  // probe is advisory — it never blocks (a failure returns [] → straight publish).
  const [duplicateMatches, setDuplicateMatches] = React.useState<
    SimilarListing[]
  >([]);
  const [pendingPayload, setPendingPayload] =
    React.useState<ListingInput | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = React.useState(false);

  const form = useForm<ListingFormValues, unknown, ListingInput>({
    resolver: zodResolver(listingSchema),
    defaultValues: {
      title: defaults?.title ?? "",
      partNumber: defaults?.partNumber ?? "",
      askingPrice: defaults?.askingPrice,
      conditionId: defaults?.conditionId,
      shippingOption: defaults?.shippingOption ?? "shipping_available",
      damageNotes: defaults?.damageNotes ?? "",
      isBarnyard: defaults?.isBarnyard ?? false,
      fitment: defaults?.fitment?.map((f) => ({
        modelId: f.modelId,
        configId: f.configId ?? null,
      })),
      photoPaths: defaults?.photos
        ?.filter((p) => p.status === "ready" && p.path)
        .map((p) => p.path as string),
    },
  });

  // ── FINT-02 accept handlers — the ONLY path into confirmed state ──────────
  // Every one of these runs ONLY from an explicit click (chip body / "Add all").
  // No effect calls them. onAcceptFitment uses EXACTLY the FitmentMultiSelect
  // onChange path (setFitment + form.setValue) so accepted == manually-added.
  function onAcceptFitment(s: SuggestedFitment) {
    const exists = fitment.some(
      (f) =>
        f.modelId === s.modelId &&
        (f.configId ?? null) === (s.configId ?? null),
    );
    if (exists) return;
    const next: FitmentSelection[] = [
      ...fitment,
      {
        modelId: s.modelId,
        configId: s.configId ?? null,
        makeName: s.makeName,
        modelName: s.modelName,
        configName: s.configName,
      },
    ];
    setFitment(next);
    form.setValue(
      "fitment",
      next.map((f) => ({ modelId: f.modelId, configId: f.configId ?? null })),
      { shouldValidate: true },
    );
    setFitmentError(null);
  }

  function onAcceptTag(t: SuggestedTag) {
    if (t.kind === "category") {
      setCategoryIds((prev) => (prev.includes(t.id) ? prev : [...prev, t.id]));
      return;
    }
    setSearchTerms((prev) =>
      prev.some((x) => x.id === t.id && x.kind === t.kind)
        ? prev
        : [...prev, t],
    );
  }

  function onAddAll(group: SuggestionGroup) {
    // One click = "add all" — still an explicit user action (FINT-02 satisfied).
    group.fitments.forEach(onAcceptFitment);
    group.tags.forEach(onAcceptTag);
  }

  function onDismiss(key: string) {
    setDismissed((prev) => new Set(prev).add(key));
  }

  function removeSearchTerm(t: SuggestedTag) {
    setSearchTerms((prev) =>
      prev.filter((x) => !(x.id === t.id && x.kind === t.kind)),
    );
  }

  // Filter suggestions against ALREADY-CONFIRMED state before rendering so the
  // engine never re-suggests something the seller already has (Pitfall 5, also
  // covers edit-mode pre-fill). Dismissed keys are filtered inside the component.
  const filteredGroups: SuggestionGroup[] = suggestions
    .map((g) => ({
      ...g,
      fitments: g.fitments.filter(
        (s) =>
          !fitment.some(
            (f) =>
              f.modelId === s.modelId &&
              (f.configId ?? null) === (s.configId ?? null),
          ),
      ),
      tags: g.tags.filter((t) => {
        if (t.kind === "category") return !categoryIds.includes(t.id);
        return !searchTerms.some((x) => x.id === t.id && x.kind === t.kind);
      }),
    }))
    .filter((g) => g.fitments.length > 0 || g.tags.length > 0);

  function onSubmit(values: ListingInput) {
    // Compose the parts the schema validated (part data + shipping) with the
    // component-managed fitment / photos / barnyard.
    const readyPaths = photos
      .filter((p) => p.status === "ready" && p.path)
      .map((p) => p.path as string);

    const payload: ListingInput = {
      ...values,
      isBarnyard,
      fitment: fitment.map((f) => ({
        modelId: f.modelId,
        configId: f.configId ?? null,
      })),
      photoPaths: readyPaths,
      // Phase-6 confirmed dimensions (FINT-03): persisted M2M categories + accepted
      // slang/search-term tags. Both already flow through listingSchema (06-01).
      categoryIds,
      searchTermIds: searchTerms.map((t) => t.id),
    };

    // Client-side mirror of the schema refine (Barnyard OR >=1 fitment) for inline UX.
    if (!isBarnyard && payload.fitment.length === 0) {
      setFitmentError("Add at least one fitment, or mark The Barnyard.");
      return;
    }
    setFitmentError(null);

    // Still uploading? Don't submit with half-baked photos.
    if (photos.some((p) => p.status === "uploading")) {
      toast.error("Please wait for your photos to finish uploading.");
      return;
    }

    setPending(true);
    React.startTransition(async () => {
      // Edit and create return different success shapes (only createListing carries
      // an id), so keep the branches separate to narrow the union cleanly.
      if (mode === "edit" && listingId != null) {
        const result = await updateListing(listingId, payload);
        if (result.ok) {
          toast.success("Listing updated");
          router.push(`/listings/${listingId}`); // CONTEXT: redirect to the listing
        } else {
          toast.error(actionErrorMessage(result.error));
          setPending(false);
        }
        return;
      }

      // CREATE path: BEFORE publishing, probe the seller's OWN listings for a
      // fuzzy-similar title (LIST-10). The probe is advisory — never blocks. If it
      // returns matches, open the non-blocking warning and stash the payload; the
      // seller's "Publish anyway" then calls createListing unchanged. A probe
      // failure returns [] → fall straight through to publish.
      const matches = await findSimilarOwnListings(payload.title);
      if (matches.length > 0) {
        setDuplicateMatches(matches);
        setPendingPayload(payload);
        setShowDuplicateDialog(true);
        setPending(false); // awaiting the seller's decision; not mid-publish
        return;
      }

      await runCreate(payload);
    });
  }

  // The actual publish call — createListing is UNCHANGED and called identically
  // whether we reach it with no duplicates or via "Publish anyway".
  async function runCreate(payload: ListingInput) {
    const result = await createListing(payload);
    if (result.ok) {
      toast.success("Listing published");
      router.push(`/listings/${result.id}`); // CONTEXT: redirect to the listing
    } else {
      toast.error(actionErrorMessage(result.error));
      setPending(false);
    }
  }

  // "Publish anyway" — one extra click, never blocked. Closes the warning and
  // publishes the stashed payload via the unchanged createListing path.
  function onPublishAnyway() {
    const payload = pendingPayload;
    setShowDuplicateDialog(false);
    setPendingPayload(null);
    setDuplicateMatches([]);
    if (!payload) return;
    setPending(true);
    React.startTransition(async () => {
      await runCreate(payload);
    });
  }

  // "Go back" — dismiss the warning, keep the form as-is so the seller can edit.
  function onDuplicateCancel() {
    setShowDuplicateDialog(false);
    setPendingPayload(null);
    setDuplicateMatches([]);
  }

  const prefLabel = contactPreference
    ? (CONTACT_PREFERENCE_LABEL[contactPreference] ?? contactPreference)
    : null;

  // When zod validation blocks submit, RHF calls onSubmit NEVER — surface the first
  // failing field so the user isn't left with a silent dead Publish button.
  function onInvalid(errors: Record<string, { message?: string }>) {
    const first = Object.values(errors)[0];
    toast.error(first?.message ?? "Please check the highlighted fields.");
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
        className="grid gap-10"
      >
        {/* ── SECTION 1: PART DATA ───────────────────────────────── */}
        <section className="grid gap-4">
          <div>
            <h2 className="text-lg font-semibold">Part data</h2>
            <p className="text-muted-foreground text-sm">
              What you&apos;re selling.
            </p>
          </div>

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Front bumper, chrome"
                    maxLength={120}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="partNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Part number (optional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="OEM or aftermarket part #"
                    maxLength={80}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="askingPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Asking price (USD)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      {...field}
                      value={
                        field.value == null ? "" : String(field.value as number)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="conditionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condition</FormLabel>
                  <Select
                    value={field.value ? String(field.value) : ""}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a condition" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {conditions.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="damageNotes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Damage notes (optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Any wear, cracks, or missing pieces buyers should know about."
                    rows={3}
                    maxLength={2000}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {/* ── SECTION 2: FITMENT ─────────────────────────────────── */}
        <section className="grid gap-4">
          <div>
            <h2 className="text-lg font-semibold">Fitment</h2>
            <p className="text-muted-foreground text-sm">
              Which trucks does this part fit? Add one or more, or mark The
              Barnyard.
            </p>
          </div>

          {/* Part Category — the suggestion TRIGGER (single-select v1). Choosing
              one debounce-fetches grouped suggestion chips below. Setting it also
              records the M2M category id that persists. */}
          <div className="grid gap-1.5">
            <Label>Part category</Label>
            <Select
              value={categoryId != null ? String(categoryId) : undefined}
              onValueChange={(v) => {
                const id = Number(v);
                setCategoryId(id);
                setCategoryIds((prev) =>
                  prev.includes(id) ? prev : [...prev, id],
                );
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick a category to see suggestions" />
              </SelectTrigger>
              <SelectContent>
                {partCategories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.parentId != null ? `— ${c.name}` : c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Grouped suggestion chips (FINT-01). Accepting is the ONLY path into
              confirmed state (FINT-02) — see the accept handlers above. */}
          <FitmentSuggestions
            groups={filteredGroups}
            isLoading={isSuggesting}
            hasTrigger={categoryId != null}
            dismissed={dismissed}
            onDismiss={onDismiss}
            onAcceptFitment={onAcceptFitment}
            onAcceptTag={onAcceptTag}
            onAddAll={onAddAll}
          />

          {/* Confirmed search-term / slang tags — removable, so the seller sees
              exactly what was accepted. (Confirmed model/config fitments render in
              the FitmentMultiSelect badge list below.) */}
          {searchTerms.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {searchTerms.map((t) => (
                <Badge
                  key={`${t.kind}-${t.id}`}
                  variant="secondary"
                  className="gap-1.5 py-1"
                >
                  {t.name}
                  <button
                    type="button"
                    onClick={() => removeSearchTerm(t)}
                    aria-label={`Remove tag ${t.name}`}
                    className="hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <FitmentMultiSelect
            makes={makes}
            fitment={fitment}
            onChange={(next) => {
              setFitment(next);
              // Keep the RHF field in sync so zodResolver's barnyard-or-fitment
              // refine sees the real fitment list (component-managed state alone
              // never reaches the resolver, which silently blocks submit).
              form.setValue(
                "fitment",
                next.map((f) => ({
                  modelId: f.modelId,
                  configId: f.configId ?? null,
                })),
                { shouldValidate: true },
              );
              if (next.length > 0) setFitmentError(null);
            }}
            isBarnyard={isBarnyard}
            onBarnyardChange={(next) => {
              setIsBarnyard(next);
              // Mirror into the RHF field so the resolver's refine passes when
              // Barnyard is on (otherwise Publish fails validation silently).
              form.setValue("isBarnyard", next, { shouldValidate: true });
              if (next) setFitmentError(null);
            }}
          />
          {fitmentError && (
            <p className="text-destructive text-sm">{fitmentError}</p>
          )}
        </section>

        {/* ── SECTION 3: PHOTOS ──────────────────────────────────── */}
        <section className="grid gap-4">
          <div>
            <h2 className="text-lg font-semibold">Photos</h2>
            <p className="text-muted-foreground text-sm">
              Add up to 8. The first photo is the cover.
            </p>
          </div>
          <PhotoUploader value={photos} onChange={setPhotos} />
        </section>

        {/* ── SECTION 4: SHIPPING ────────────────────────────────── */}
        <section className="grid gap-4">
          <div>
            <h2 className="text-lg font-semibold">Shipping</h2>
            <p className="text-muted-foreground text-sm">
              How can buyers get this part?
            </p>
          </div>

          <FormField
            control={form.control}
            name="shippingOption"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid gap-2"
                  >
                    {SHIPPING_OPTIONS.map((opt) => (
                      <div key={opt.value} className="flex items-center gap-2">
                        <RadioGroupItem
                          value={opt.value}
                          id={`shipping-${opt.value}`}
                        />
                        <FormLabel
                          htmlFor={`shipping-${opt.value}`}
                          className="font-normal"
                        >
                          {opt.label}
                        </FormLabel>
                      </div>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Account contact preference — DISPLAY ONLY (CONTEXT: edited on the
              account page, never here). */}
          <div className="text-muted-foreground rounded-md border bg-muted/30 p-3 text-sm">
            {prefLabel ? (
              <>
                Buyers will reach you via your account contact preference:{" "}
                <span className="text-foreground font-medium">{prefLabel}</span>
                . Change it in your account settings.
              </>
            ) : (
              <>
                Buyers will reach you via your account contact preference. Set
                it in your account settings.
              </>
            )}
          </div>
        </section>

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending
              ? "Saving…"
              : mode === "edit"
                ? "Save changes"
                : "Publish listing"}
          </Button>
        </div>
      </form>

      {/* LIST-10 non-blocking same-seller duplicate warning (create path only). */}
      <DuplicateWarning
        open={showDuplicateDialog}
        matches={duplicateMatches}
        onPublishAnyway={onPublishAnyway}
        onCancel={onDuplicateCancel}
      />
    </Form>
  );
}
