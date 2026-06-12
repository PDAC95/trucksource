# Phase 05 — Deferred Items

Out-of-scope discoveries logged during execution (not fixed by the owning plan).

## From 05-02 execution (2026-06-05)

- **tsc error in `tests/unit/exif-strip.test.ts`** (belongs to plan 05-01's wave, not 05-02):
  `TS2345 ... { gps: true; exif: true; ifd0: boolean } is not assignable ...` at line 76.
  This file is owned by the parallel plan 05-01 (EXIF strip pipeline). Out of scope for 05-02
  (no file overlap with 05-02's `lib/listings/*` + migration 0008). 05-02's own modules compile clean.
  Owner: 05-01.

- **[RESOLVED] Migration `0008_active_listing_count.sql` Staging apply was blocked on 05-01's `listings` table.**
  At first attempt `public.listings` did not exist (created by parallel plan 05-01, same wave) →
  `42P01`. Retried after 05-01 landed `0006_listings.sql`; 0008 applied cleanly and the RPC was
  verified (`active_listing_count('…000'::uuid)` returns 0). No outstanding action.

## From 05-04 execution (2026-06-05)

- **Incomplete untracked 05-05 artifacts present in the working tree.** `app/(app)/account/page.tsx`
  imports `./contact-preference-form`, which does not exist yet → a project-wide `tsc --noEmit`
  error (`TS2307`). These files (`app/(app)/account/`, `lib/account/`, `lib/actions/account.ts`,
  `supabase/migrations/0009_contact_preference.sql`, `tests/integration/contact-preference.test.ts`)
  are uncommitted outputs of a partial/parallel plan 05-05 run, NOT owned by 05-04. Out of scope —
  05-04 owns only `components/listings/*` + `app/(app)/sell/*`, which compile clean in isolation.
  Owner: 05-05 (will be completed/committed by the 05-05 executor). Not fixed here.

## From 05-05 execution (2026-06-05)

- **Two tsc / `npm run build` type errors in `components/listings/listing-form.tsx`** (committed by
  05-04 in `0510486`, NOT a 05-05 file):
  1. `listing-form.tsx:202:58 — Property 'id' does not exist on type '{ ok: true; }'`. The publish
     handler does `const id = mode === "edit" ? listingId! : result.id`. The `result` union is
     `UpdateListingResult | CreateListingResult`; only `createListing`'s success arm carries `id`, so
     TS cannot prove `.id` exists on the joined union. The ternary needs to read `result.id` only
     inside the create branch (where the union is already narrowed).
  2. `listing-form.tsx:279:23 — Type '{}' is not assignable to ... value` on the askingPrice `<Input>`
     (`field.value ?? ""` where the RHF field value is typed `{}`).
  These are owned by plan 05-04 (`components/listings/*`). 05-05's own files
  (`components/listings/listing-detail.tsx`, `lib/actions/listing-view.ts`,
  `app/(public)/listings/[id]/page.tsx`, `app/(app)/account/*`, `lib/account/*`,
  `lib/actions/account.ts`) all compile clean — they do NOT appear in the tsc output. The phase-level
  "build green" gate is therefore RED for a 05-04 defect, not a 05-05 one. Out of scope — not fixed
  here. Owner: 05-04.
  **[RESOLVED]** Fixed by 05-04 in commit `6e5809b` (narrowed the create/update result union, coerced
  the price input value); `npx tsc --noEmit` is now clean.

## From 05-04 close / live UAT (2026-06-08)

- **[PRE-LAUNCH BLOCKER — photo pipeline] Vercel ~4.5MB request-body cap will reject 10MB photo uploads
  in production.** During live UAT, photo uploads hit Next.js's default 1MB Server Action body cap;
  raising `experimental.serverActions.bodySizeLimit` to `"12mb"` in `next.config.ts` (commit `86d0fae`)
  unblocked **local** uploads. BUT Vercel's platform caps the serverless request body at ~4.5MB, and
  photos are up to 10MB each (per `lib/images/strip.ts`), so the current upload path will **fail in
  production**. The uploader needs a **signed-URL-direct-to-Storage** path (client uploads straight to
  the `listing-photos` bucket via a signed URL; the Server Action no longer carries the file bytes).
  EXIF/no-GPS strip must still happen server-side — re-encode on a Storage trigger / Edge Function, or
  keep stripping in the action by sending the already-uploaded object key instead of the raw file.
  Owner: photo-pipeline follow-up (Phase 5 hardening / pre-launch). Not fixed in 05-04.

- **[Photo pipeline follow-up] Published photos remain at their `<uid>/staging/...webp` path.** Uploads
  land in a per-user `staging/` prefix and are NOT moved to a final/published location after the listing
  publishes. A future orphan-file cleanup that treats `staging/` as transient could delete live listing
  photos. Decide on a publish-time move (or redefine `staging/` as the permanent home) before any cleanup
  job ships. Owner: photo-pipeline follow-up. Not fixed in 05-04.
