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
import type { ConditionOption } from "@/lib/listings/cascade";
import {
  createListing,
  updateListing,
  type CreateListingResult,
  type UpdateListingResult,
} from "@/lib/actions/listings";

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

import {
  FitmentMultiSelect,
  type FitmentSelection,
} from "./fitment-multi-select";
import { PhotoUploader, type UploadedPhoto } from "./photo-uploader";

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
};

export function ListingForm({
  mode,
  listingId,
  makes,
  conditions,
  contactPreference,
  defaults,
}: {
  mode: "create" | "edit";
  listingId?: number;
  makes: CascadeOption[];
  conditions: ConditionOption[];
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
      const result =
        mode === "edit" && listingId != null
          ? await updateListing(listingId, payload)
          : await createListing(payload);

      if (result.ok) {
        toast.success(
          mode === "edit" ? "Listing updated" : "Listing published",
        );
        const id = mode === "edit" ? listingId! : result.id;
        router.push(`/listings/${id}`); // CONTEXT: redirect to the public listing
      } else {
        toast.error(actionErrorMessage(result.error));
        setPending(false);
      }
    });
  }

  const prefLabel = contactPreference
    ? (CONTACT_PREFERENCE_LABEL[contactPreference] ?? contactPreference)
    : null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-10">
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
                      value={field.value ?? ""}
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
                    value={field.value ? String(field.value) : undefined}
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
          <FitmentMultiSelect
            makes={makes}
            fitment={fitment}
            onChange={(next) => {
              setFitment(next);
              if (next.length > 0) setFitmentError(null);
            }}
            isBarnyard={isBarnyard}
            onBarnyardChange={(next) => {
              setIsBarnyard(next);
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
    </Form>
  );
}
