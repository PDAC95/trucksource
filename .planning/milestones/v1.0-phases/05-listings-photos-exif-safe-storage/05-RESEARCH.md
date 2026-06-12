# Phase 5: Listings, Photos & EXIF-Safe Storage - Research

**Researched:** 2026-06-05
**Domain:** Server-side image processing (EXIF/GPS strip with `sharp`) + Supabase Storage upload pipeline + listings data model/RLS + multi-photo uploader UX (Next.js 16 / React 19 / Supabase)
**Confidence:** HIGH (sharp metadata behavior, Supabase Storage RLS, listings/RLS modeling verified against official docs + existing repo conventions); MEDIUM on the pre-publish staging strategy recommendation (a design call, both candidates valid) and HEIC handling specifics.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Form flow**
- **Single long page organized in sections** (Part data → Fitment → Photos → Shipping), not a multi-step wizard or accordion. Lowest friction, seller sees full scope at once.
- **No draft state in v1.** The listing is created only on a valid publish; leaving early discards. No `draft` status, no autosave.
- **Edit reuses the same form component, pre-filled** with current values. One component for create + edit — no separate edit view.
- **On successful publish, redirect to the published listing's public page** (the buyer-facing view) with a success confirmation.

**Photo upload**
- **Up to 8 photos**, **10MB each**, accepted formats **JPG / PNG / WebP**. `sharp` re-encodes everything to a consistent format. HEIC (iPhone) is rejected or converted — planner/researcher to confirm handling.
- **Drag-drop reordering; the first photo is automatically the cover/thumbnail.** No separate "set cover" button.
- **Immediate local preview + per-photo spinner/overlay** while the server processes (uploads + strips EXIF). Per-photo feedback, not a single global progress bar.
- **Upload + EXIF-strip happens at selection time**, not at publish. Each photo is sent and processed the moment it's selected; publish only confirms. → **Open implementation question:** where do pre-publish photos live before a listing row exists? (per-user staging path + reconcile on create, or pre-create the listing in a pending state). The EXIF-strip + no-GPS regression test gate applies regardless.

**Fitment tagging**
- **Cascading dependent selects** for Make → Model → Config — **reuse the My Garage (Phase 4) cascade pattern**.
- **Multi-fit: a listing can apply to multiple Make/Model/Config combinations.** Seller adds combinations to a list. Do not collapse to single-fit.
- **Required to publish: Make + Model + Condition.** Optional: Configuration, Part Category, Material, Special Filters. Date Listed is automatic.
- **The Barnyard = an explicit toggle** ("doesn't fit standard fitment") that relaxes/hides the fitment selects and marks the listing as Barnyard.

**Listing fields & states**
- **Required: Part Title + Asking Price.** Optional: Part Number, Damage Notes. Date Listed is automatic.
- **Asking Price: required numeric value in USD.** Validation: > 0, currency format. No multi-currency in v1.
- **Contact preference is account-level**, configured once in account/profile settings, **default = Marketplace Messaging Only** (most private). The listing form only *displays* it as reference; it is not edited from the listing form. (LIST-07 is account-scoped.)
- **Only `active` status in v1** — a listing is `active` on publish. Design the `status` column as an **extensible enum** (`active | sold | ...`) so Phase 8 (mark-as-sold) doesn't require a breaking migration.

### Claude's Discretion
- Exact section visual design, spacing, typography of the form.
- Loading skeleton / empty states beyond what's specified.
- HEIC handling specifics (reject vs server-convert) — confirm during research.
- Pre-publish photo storage strategy (staging path vs pending listing) — confirm during research; both satisfy the EXIF gate.
- Exact shape of the listing-view event log row (instrument now; consumed in P10 analytics).

### Deferred Ideas (OUT OF SCOPE)
- **Fitment suggestions / "smart" pre-fill** — Phase 6 (Fitment Intelligence). Here, only a manual garage shortcut is in scope, if any.
- **Mark-as-sold** — Phase 8 (LIST-06).
- **Pause/hide a listing** (`inactive`/`hidden` status + toggle) — not requested in P5.
- **"Make an offer / OBO" pricing flag** — not in P5 scope.
- **Search / feed discovery of listings** — Phase 7.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| **LIST-01** | Seller can create a listing with public part info: Part Title, Part Number, Make, Model, Fitment, Condition, Material, Asking Price, Damage Notes, Date Listed | `listings` table + `listing_fitment` join (Architecture Patterns §Data Model). Single Zod `listingSchema` client+server (Pattern 2). Title+Price required; Part#/Damage Notes optional; date_listed = `default now()`. |
| **LIST-02** | Seller can upload multiple photos with a listing | Multi-photo uploader (`@dnd-kit/sortable`) → Server Action → `sharp` strip → Storage → `listing_photos` rows ordered by `sort_order` (Don't Hand-Roll, Code Examples). Up to 8 / 10MB enforced server-side. |
| **LIST-03** | Uploaded photos have all metadata (incl. EXIF GPS) stripped server-side before stored or displayed | **P0 gate.** `sharp().rotate().toFormat(...)` with NO `keepMetadata`/`keepExif`/`withMetadata` → re-encoded buffer (Pitfall 1, Code Examples). Automated no-GPS regression test with `exifr` reads the stored object back and asserts no GPS (Validation §). |
| **LIST-04** | Seller can select a shipping option: Shipping Available / Local Pickup Only / Shipping Assistance Requested | `shipping_option` enum column on `listings`; shadcn RadioGroup/Select in the Shipping section. |
| **LIST-05** | Seller can edit their own listings | Same form component pre-filled; `updateListing` Server Action, owner-RLS scoped, mirrors the Phase-4 `updateTruck` pattern (zero-rows → `not_found`). |
| **LIST-07** | Seller can select a contact preference per account: Email Only / Email + Phone (optional display) / Marketplace Messaging Only | **Account-level**, not per-listing. Add `contact_preference` enum to `profiles_private` (or a non-PII subset to `profiles_public` — see Open Questions). Default `messaging_only`. Edited in account settings; listing form only displays it. |
</phase_requirements>

## Summary

This phase has one P0 architectural gate (CLAUDE.md invariant #4) and several routine-but-privacy-sensitive surfaces. The gate is the **server-side EXIF/GPS strip**: every uploaded photo must be re-encoded with `sharp` so the stored bytes carry zero metadata, proven by an automated no-GPS regression test. The good news is that **`sharp` strips ALL metadata by default** — the danger is not forgetting to add stripping, it's *accidentally adding* `withMetadata()` / `keepMetadata()` / `keepExif()`, which re-attach EXIF. The correct pipeline is `sharp(input).rotate().toFormat('jpeg'|'webp', {...}).toBuffer()` with none of those keep-methods. `.rotate()` (no args) bakes the EXIF orientation into pixels *before* the orientation tag is dropped, so images don't appear sideways. The prebuilt npm `sharp` binary **does not decode HEIC/HEIF** — so HEIC must be **rejected** server-side in v1 (converting would require a custom libvips+libheif build; out of scope).

The rest of the phase is the established repo pattern applied to a new domain: a `listings` table plus `listing_fitment` join table(s), RLS default-deny in the creating migration, public-read on listing public columns + owner-only writes (mirrors how `garage_trucks` was the first owner-scoped table). Photos go through a Server Action (so `sharp` and any service-role work stay server-only), into a Supabase Storage bucket whose RLS scopes writes to a per-user folder. The multi-photo uploader is the one genuinely new piece of UI complexity — use `@dnd-kit/sortable` for drag-drop reorder (do not hand-roll HTML5 DnD), with first-photo-as-cover and per-photo upload state. Listing-view event logging ships now as a minimal append-only table (CLAUDE.md invariant #8 — non-reconstructible later).

**Primary recommendation:** Build the EXIF strip as a single tested `lib/images/strip.ts` helper (`sharp().rotate().toFormat().toBuffer()`, no keep-methods, reject HEIC by magic-byte/MIME, enforce ≤10MB and JPG/PNG/WebP server-side) and gate it with an `exifr` no-GPS test in Wave 0. For pre-publish photos, use a **per-user Storage staging path + reconcile-on-create** (not a pending DB row) — it avoids orphan `listings` rows, keeps "no draft state" honest, and fits Storage RLS cleanly. Model `listings` with an extensible `text` + CHECK `status` (default `'active'`) and a `listing_fitment` many-to-many join keyed to Phase 3's `models`/`configurations`. Account-level `contact_preference` lives on the profile, default `'messaging_only'`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **sharp** | `^0.34.x` (latest) | Server-side image re-encode + metadata strip (the EXIF gate) | The de-facto Node image library (libvips-backed); strips all metadata by default; only realistic way to satisfy invariant #4. **NEW dependency** — not yet in package.json. |
| **exifr** | `^7.x` (latest) | Read EXIF/GPS back from a buffer in the no-GPS regression test | Fastest/most versatile JS EXIF reader; parses Buffer/Uint8Array directly; `exifr.gps(buf)` → `undefined` when stripped. **NEW devDependency.** |
| **@dnd-kit/core** + **@dnd-kit/sortable** | latest | Accessible drag-drop reorder for the photo list (first = cover) | 2026 community standard; WCAG 2.1 AA keyboard + screen-reader DnD out of the box; React 19 compatible. **NEW dependencies.** |
| **@supabase/ssr** | `0.10.3` (pinned, installed) | Cookie-bound server client for Server Actions (owner RLS) | Already in repo. Server Action uploads run as the user so Storage RLS scopes the write. |
| **@supabase/supabase-js** | `2.106.2` (pinned, installed) | Storage `upload`/`getPublicUrl`/`createSignedUrl`/`remove`/`move` | Already in repo. Storage API lives on this client. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **react-hook-form** | `7.77.x` (installed) | Listing form state (large multi-section form) | The whole listing form; serialize RHF-validated values into FormData for the Server Action (repo convention from Phase 1/4). |
| **zod** | `4.4.x` (installed) | One `listingSchema` validated client (UX) + server (trust boundary) | Title/price/shipping/fitment validation; re-run inside the Server Action. |
| **@hookform/resolvers** | `5.4.x` (installed) | `zodResolver` bridge | Wire `listingSchema` to RHF. |
| **shadcn/ui** (CLI) | components owned in repo | Form, Input, Textarea, Select, RadioGroup, Button, Dialog, Badge, Sonner, Card | Form sections, shipping radio, fitment selects, toasts. Add any missing primitives via `npx shadcn@latest add`. |
| **next/image** | (Next 16) | Render listing photos (lazy load, sizing) | Listing detail + feed thumbnails. Whitelist the Supabase Storage host in `next.config` `images.remotePatterns`. |
| **@dnd-kit/modifiers** | latest | Optional: constrain drag axis / restrict-to-parent | Polish only; not required. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@dnd-kit/sortable` | Native HTML5 DnD | Hand-rolling DnD violates the do-not-hand-roll principle: no a11y, fiddly drag images, touch support is poor. Only pick native if a single dependency must be avoided. |
| `@dnd-kit/sortable` | Pragmatic drag-and-drop (Atlassian) | Smaller bundle, better for file-drop targets / thousands of items, but you build animations/handles yourself. dnd-kit wins for a small ordered photo list with built-in reorder animation. |
| `exifr` (test) | `exif-reader` (pairs with `sharp.metadata()`) | `exif-reader` is fine too (sharp exposes the raw EXIF buffer via `metadata().exif`). `exifr` is simpler for the assertion (direct `gps(buffer)`), reads GPS without a second lib. Either satisfies the gate. |
| `sharp` re-encode | Client-side strip (`browser-image-compression`) | NEVER as the only line of defense (Pitfall — a malicious client POSTs the raw file). Client compression is optional bandwidth optimization; the server strip is mandatory and authoritative. |
| HEIC server-convert | HEIC reject | Converting needs a custom libvips+libheif build (prebuilt npm binary can't decode HEIC). Reject in v1; revisit if iPhone-HEIC complaints surface. |

**Installation:**
```bash
npm install sharp @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install -D exifr
# shadcn primitives if missing:
npx shadcn@latest add radio-group textarea
```
> Note: `sharp` ships platform-specific prebuilt binaries. Vercel's build/runtime is Linux x64 — `sharp` works there out of the box. Local dev on Windows pulls the win32 binary automatically. No special config needed for the default (non-HEIC) build.

## Architecture Patterns

### Recommended Project Structure
```
app/
├── (app)/
│   ├── sell/
│   │   ├── page.tsx              # create listing (single sectioned form)
│   │   └── [id]/edit/page.tsx    # edit (same ListingForm, pre-filled)
│   └── account/page.tsx          # add contact_preference control (LIST-07)
├── (public)/
│   └── listings/[id]/page.tsx    # buyer-facing listing page (redirect target on publish)
lib/
├── images/
│   └── strip.ts                  # sharp re-encode + metadata strip (the EXIF gate)  ← NEW, server-only
├── listings/
│   ├── schema.ts                 # listingSchema (zod) — client + server source of truth
│   └── queries.ts                # listing reads (public columns only)
├── actions/
│   └── listings.ts               # createListing / updateListing / uploadListingPhoto / removeListingPhoto (Server Actions)
└── supabase/
    └── storage.ts                # bucket name const + signed/public URL helpers (optional)
components/
└── listings/
    ├── listing-form.tsx          # 'use client' — RHF + sections
    ├── photo-uploader.tsx        # 'use client' — @dnd-kit sortable grid, per-photo state
    └── fitment-multi-select.tsx  # reuse Phase-4 cascade, multi-fit list
supabase/migrations/
├── 0006_listings.sql             # listings + listing_fitment + listing_photos + RLS (default-deny)
├── 0007_listing_view_events.sql  # append-only view-event table (or fold into 0006)
└── (storage bucket + storage.objects policies — see Pattern 4)
tests/integration/
└── listings.test.ts              # RLS gate (anon read public / anon write deny / owner-only)
tests/unit/
└── exif-strip.test.ts            # P0 no-GPS regression (exifr on stripped buffer)
```

### Pattern 1: The EXIF/GPS strip (P0 — invariant #4)
**What:** A single server-only helper re-encodes every uploaded image with `sharp`, dropping all metadata. The default `sharp` behavior is already "strip everything"; the job is to NOT re-attach metadata and to bake orientation in first.
**When to use:** Every photo, at selection-time upload, before the bytes touch Storage. Never trust a client strip.
**Example:**
```typescript
// lib/images/strip.ts — Source: https://sharp.pixelplumbing.com/api-output (HIGH)
import "server-only";
import sharp from "sharp";

const MAX_BYTES = 10 * 1024 * 1024;       // 10MB (CONTEXT)
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"]; // CONTEXT — JPG/PNG/WebP

export type StripResult =
  | { ok: true; buffer: Buffer; contentType: "image/webp"; ext: "webp" }
  | { ok: false; error: "too_large" | "unsupported_type" | "decode_failed" };

export async function stripAndReencode(
  input: Buffer,
  declaredType: string,
): Promise<StripResult> {
  if (input.byteLength > MAX_BYTES) return { ok: false, error: "too_large" };
  // HEIC is rejected: the prebuilt sharp binary cannot decode it, and the
  // declared/ sniffed type must be one of the three accepted formats.
  if (!ACCEPTED.includes(declaredType)) return { ok: false, error: "unsupported_type" };

  try {
    // .rotate() with NO args bakes EXIF orientation into pixels, THEN metadata
    // is dropped (so the image is upright even after the orientation tag is gone).
    // NO .withMetadata() / .keepMetadata() / .keepExif() — those re-attach EXIF.
    // Re-encode to a single consistent format (webp = small, broadly supported).
    const buffer = await sharp(input)
      .rotate()
      .webp({ quality: 82 })
      .toBuffer();
    return { ok: true, buffer, contentType: "image/webp", ext: "webp" };
  } catch {
    return { ok: false, error: "decode_failed" };
  }
}
```
> **Verify the MIME server-side, don't trust the client header.** Sniff the magic bytes (or let `sharp` fail on a non-image) — a `.jpg` extension on an HEIC/SVG/other payload should be rejected, not stripped-and-stored. `sharp(input).metadata()` exposes the detected `format`; reject if it isn't `jpeg|png|webp`.

### Pattern 2: Photo upload through a Server Action (server-only sharp)
**What:** The browser sends the raw selected file to a Server Action; the action runs `stripAndReencode`, uploads the clean buffer to Storage as the authenticated user (owner RLS), and records/returns the path. `sharp` never runs client-side.
**When to use:** Every photo upload (selection-time). Per CONTEXT, this fires the moment a photo is selected, with a per-photo spinner.
**Example:**
```typescript
// lib/actions/listings.ts (excerpt) — Source: Supabase Storage upload docs + repo server.ts (HIGH)
"use server";
import { createClient } from "@/lib/supabase/server";
import { stripAndReencode } from "@/lib/images/strip";

export async function uploadListingPhoto(form: FormData) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims(); // NEVER getSession
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false as const, error: "unauthenticated" };

  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "invalid" };

  const input = Buffer.from(await file.arrayBuffer());
  const stripped = await stripAndReencode(input, file.type);
  if (!stripped.ok) return { ok: false as const, error: stripped.error };

  // Per-user staging path (Pattern 3): listing-photos/<uid>/staging/<uuid>.webp
  const path = `${userId}/staging/${crypto.randomUUID()}.${stripped.ext}`;
  const { error } = await supabase.storage
    .from("listing-photos")
    .upload(path, stripped.buffer, {
      contentType: stripped.contentType,
      cacheControl: "3600",
      upsert: false,
    });
  if (error) return { ok: false as const, error: "upload_failed" };

  return { ok: true as const, path };
}
```
> The cookie-bound `createClient()` runs the upload AS the user, so the Storage RLS policy (Pattern 4) is the authorization boundary — no service-role client needed here (consistent with invariant #3 and the Phase-4 garage pattern). Service-role would only be used if a later background reconcile/cleanup job needs it.

### Pattern 3: Pre-publish staging — per-user Storage path + reconcile on create (RECOMMENDED)
**What:** Photos uploaded before a `listing` row exists land in a per-user *staging* prefix (`<uid>/staging/...`). On successful publish, the create action records the staged paths into `listing_photos` (and optionally `move`s them to `<uid>/<listing_id>/...`). Unreconciled staging objects are orphans cleaned up by a periodic job.
**When to use:** This is the recommended answer to the CONTEXT open question. Rationale below.
**Why this over a pending listing row:**
- **Honors "no draft state."** A pending `listings` row IS a draft by another name — it pollutes the table, needs a `status` value the product explicitly doesn't want, and risks orphan rows appearing in counts/feeds if cleanup misses one (and `active_listing_count` / feed queries must then learn to exclude it).
- **Orphans are cheap and invisible.** An orphaned *Storage object* never appears on any public surface (the bucket folder isn't enumerated publicly) and costs only storage bytes. An orphaned *DB row* is a correctness hazard.
- **Storage RLS fits cleanly:** insert/select/delete policies scoped to `(storage.foldername(name))[1] = auth.uid()` cover both staging and final paths with one rule.
- **Cleanup is simple:** a scheduled job (pg_cron / Edge Function, or deferred to Phase 10 ops) deletes `<uid>/staging/*` objects older than N hours that aren't referenced in `listing_photos`. Until that job exists, orphans are harmless.
**Tradeoff:** publish must reconcile (write `listing_photos` rows from the staged paths the client submits) and you should validate that each submitted path is under the caller's own `<uid>/` prefix (don't trust the client's path list). If you `move` to a `<listing_id>/` folder on publish, do it in the create action after the row exists.
> **Decision: use the staging-path approach.** Both satisfy the EXIF gate; staging-path is the better fit for the "no draft" product decision and the privacy/orphan posture.

### Pattern 4: Storage bucket + RLS (default-deny, per-user folder)
**What:** One bucket `listing-photos`. Listing photos are meant to be seen, so reads are public; writes/deletes are owner-scoped by folder. Policies live on `storage.objects` and go in a migration (RLS = schema, repo convention).
**When to use:** Bucket + policies created in the listings migration / a storage migration.
**Example:**
```sql
-- Source: https://supabase.com/docs/guides/storage/security/access-control (HIGH)
-- Bucket (public read). Create via SQL or the Storage API in a setup step.
insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;

-- INSERT: authenticated users may upload only under their own <uid>/ folder.
create policy "listing-photos owner-insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'listing-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- UPDATE + DELETE: owner-only, same folder scoping.
create policy "listing-photos owner-update"
on storage.objects for update to authenticated
using (
  bucket_id = 'listing-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "listing-photos owner-delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'listing-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- SELECT: public read (photos are meant to be displayed). A public bucket already
-- serves objects via the public URL; an explicit anon select policy makes API listing
-- consistent. Keep it read-only for anon.
create policy "listing-photos public-read"
on storage.objects for select to anon, authenticated
using ( bucket_id = 'listing-photos' );
```
> **Public vs signed URLs:** listing photos are public content → a **public bucket + `getPublicUrl()`** is correct and lets `next/image` cache/serve them. Use `createSignedUrl()` only if you ever need time-limited access (not needed here). Whitelist the Supabase Storage hostname in `next.config.ts` `images.remotePatterns` so `next/image` can render them.

### Pattern 5: Listings data model + RLS (default-deny, public-read public fields)
**What:** `listings` (public columns only — NO PII), `listing_fitment` many-to-many join to Phase 3 taxonomy, `listing_photos` ordered child rows. RLS enabled in the creating migration; public read on listings, owner-only writes.
**When to use:** The `0006_listings.sql` migration.
**Example:**
```sql
-- listings: public-readable marketplace data. seller_id is auth.users.id — that is NOT
-- PII (it's an opaque uuid already public via authored comments/usernames mapping), and
-- the privacy split (invariant #1) means a JOIN to profiles_public exposes only username/
-- state/country. PII lives in profiles_private and is never reachable from here.
create type listing_status as enum ('active', 'sold');  -- extensible; or use text+CHECK
-- NOTE: a Postgres enum is awkward to extend (needs ALTER TYPE ... ADD VALUE, non-trans-
-- actional). CONTEXT wants "extensible without a breaking migration" → prefer text + CHECK:
create table public.listings (
  id          bigint generated always as identity primary key,
  seller_id   uuid not null references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  part_number text,
  asking_price numeric(12,2) not null check (asking_price > 0),  -- USD, > 0
  condition_id bigint not null references public.conditions(id) on delete restrict,
  shipping_option text not null
    check (shipping_option in ('shipping_available','local_pickup','shipping_assistance')),
  damage_notes text,
  is_barnyard boolean not null default false,
  status text not null default 'active' check (status in ('active','sold')),  -- extend via CHECK edit, not type
  date_listed timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
alter table public.listings enable row level security;

-- Public read: anyone sees active listings' public columns. (Whether anon sees 'sold'
-- is a Phase-8 question; in P5 everything is 'active'.)
create policy "listings public-read" on public.listings
  for select to anon, authenticated using ( true );
-- Owner writes only.
create policy "listings owner-insert" on public.listings
  for insert to authenticated with check ((select auth.uid()) = seller_id);
create policy "listings owner-update" on public.listings
  for update to authenticated
  using ((select auth.uid()) = seller_id) with check ((select auth.uid()) = seller_id);
create policy "listings owner-delete" on public.listings
  for delete to authenticated using ((select auth.uid()) = seller_id);

-- Many-to-many fitment (multi-fit). One row per (listing, model, optional config) — the
-- shape mirrors garage_trucks: model_id + nullable config_id, make derived via models.make_id.
create table public.listing_fitment (
  listing_id bigint not null references public.listings(id) on delete cascade,
  model_id   bigint not null references public.models(id) on delete restrict,
  config_id  bigint references public.configurations(id) on delete restrict, -- NULL = model-level
  primary key (listing_id, model_id, coalesce(config_id, 0))  -- expression PK not allowed →
  -- use a surrogate id + unique index instead (the 0003/0004 coalesce-unique-index trick).
);
alter table public.listing_fitment enable row level security;
-- Read follows the listing (public). Writes only by the listing's owner — check via EXISTS.
create policy "listing_fitment public-read" on public.listing_fitment
  for select to anon, authenticated using ( true );
create policy "listing_fitment owner-write" on public.listing_fitment
  for all to authenticated
  using ( exists (select 1 from public.listings l
                  where l.id = listing_id and l.seller_id = (select auth.uid())) )
  with check ( exists (select 1 from public.listings l
                  where l.id = listing_id and l.seller_id = (select auth.uid())) );

-- Photos: ordered child rows. storage_path points into the listing-photos bucket.
create table public.listing_photos (
  id bigint generated always as identity primary key,
  listing_id bigint not null references public.listings(id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0,   -- sort_order = 0 is the cover (first photo)
  created_at timestamptz not null default now()
);
alter table public.listing_photos enable row level security;
-- same public-read / owner-write-via-EXISTS pattern as listing_fitment.
```
> **Where do listing public fields live re: the table-split invariant?** `listings` is itself a *public* table — it holds zero PII, so it does not need a private/public split. The split applies to the *profile*. The only link to a person is `seller_id` (an opaque uuid) which resolves to `profiles_public` (username/state/country) for display — never to `profiles_private`. So no PII can reach a listing surface. Re-verify this with the existing PII contract test extended to the listing route.

### Pattern 6: Multi-fit fitment selector (reuse Phase 4 cascade)
**What:** Reuse the My Garage Make→Model→Config dependent-select cascade (configs scoped THROUGH `model_configurations`, never the full master — repo decision from Phase 3/4). The seller picks a combo and **adds it to a list**; the list becomes `listing_fitment` rows. The Barnyard toggle relaxes/hides the selects and sets `is_barnyard = true`.
**When to use:** The Fitment section of the listing form.
**Example (shape):**
```typescript
// listingSchema (zod) — multi-fit + barnyard + required Make/Model/Condition
// Source: repo lib/garage/schema.ts pattern (HIGH)
const fitmentEntry = z.object({
  modelId: z.coerce.number().int().positive(),
  configId: z.coerce.number().int().positive().nullable().optional(),
});
export const listingSchema = z.object({
  title: z.string().trim().min(1).max(120),
  partNumber: z.string().trim().max(80).optional().or(z.literal("")),
  askingPrice: z.coerce.number().positive().multipleOf(0.01),  // USD > 0
  conditionId: z.coerce.number().int().positive(),             // required
  shippingOption: z.enum(["shipping_available","local_pickup","shipping_assistance"]),
  damageNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  isBarnyard: z.boolean().default(false),
  fitment: z.array(fitmentEntry).default([]),
  photoPaths: z.array(z.string()).max(8).default([]), // staged paths from Pattern 3
}).refine(
  (v) => v.isBarnyard || v.fitment.length >= 1,   // Make+Model required unless Barnyard
  { message: "Add at least one fitment, or mark The Barnyard.", path: ["fitment"] },
);
```
> The Server Action re-validates `listingSchema` AND re-checks each fitment combo against `model_configurations` (only when `configId != null`) — exactly the `addTruck` trust-boundary pattern. Multi-fit means the create action inserts the listing, then bulk-inserts `listing_fitment` rows in the same transaction (use an RPC or sequential inserts under owner RLS).

### Pattern 7: Listing-view event logging (invariant #8 — ship now)
**What:** A minimal append-only table records a row each time a listing detail page is viewed. Instrumented in P5 (the data is non-reconstructible later); *consumed* by Phase 10 analytics (ADMA-02 most-viewed).
**When to use:** On the public listing detail page render (server-side), fire-and-forget insert.
**Example:**
```sql
create table public.listing_view_events (
  id bigint generated always as identity primary key,
  listing_id bigint not null references public.listings(id) on delete cascade,
  viewer_id uuid references auth.users(id) on delete set null,  -- null = anon viewer
  created_at timestamptz not null default now()
);
alter table public.listing_view_events enable row level security;
-- Write path: insert only. Anon + authenticated may INSERT (a view is a public event),
-- but NOBODY may SELECT from the client — analytics reads happen via service-role in
-- Phase 10. Default-deny SELECT (no select policy) keeps the raw event stream private.
create policy "view-events insert" on public.listing_view_events
  for insert to anon, authenticated with check ( true );
-- (no select/update/delete policies → only service-role can read/aggregate)
```
> Keep it **minimal but correct**: `listing_id` + nullable `viewer_id` + `created_at`. Do NOT log IP/PII (Pitfall — no PII in logs/analytics). The insert should be best-effort (don't block the page render on it); consider a server-side `void supabase.from('listing_view_events').insert(...)` or a tiny route handler. A per-(viewer,listing) de-dupe window is a Phase-10 concern — store raw events now.

### Anti-Patterns to Avoid
- **Adding `.withMetadata()` / `.keepMetadata()` / `.keepExif()` to the sharp chain** — re-attaches EXIF/GPS, silently breaks invariant #4. The no-GPS test must fail the build if this appears.
- **Client-only EXIF strip** — a malicious client POSTs the raw file; the server strip is the only real boundary.
- **A `pending`/`draft` listing row to hold pre-publish photos** — violates the "no draft state" decision and creates orphan-row correctness hazards. Use the staging Storage path instead.
- **Postgres `enum` type for `status`** — `ALTER TYPE ... ADD VALUE` is non-transactional and awkward; CONTEXT wants extensibility without a breaking migration → use `text` + CHECK (editing a CHECK is a normal migration).
- **`select('*')` joining `listings` → `profiles`** — pulls PII if it ever reaches `profiles_private`; always enumerate columns and join only `profiles_public` (Pitfall 1).
- **Trusting the client's submitted photo-path list on publish** — validate each path is under the caller's own `<uid>/` prefix before writing `listing_photos`.
- **Storing the original uploaded bytes anywhere** (even a "backup")** — the original carries GPS; only the re-encoded buffer may be persisted.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Strip EXIF/GPS from images | A manual JPEG/EXIF marker parser | `sharp` re-encode (default strips all metadata) | EXIF/XMP/IPTC/thumbnail-EXIF edge cases; libvips is battle-tested; re-encoding is the only reliable strip. |
| Read EXIF back for the test | A hand-rolled metadata reader | `exifr` (`.gps(buffer)` / `.parse(buffer)`) | Correctly parses TIFF/EXIF/GPS DMS→decimal across formats; the assertion is one call. |
| Drag-drop photo reorder | Native HTML5 DnD handlers | `@dnd-kit/sortable` | a11y (keyboard + screen reader), touch, reorder animation, React 19 support — all free. |
| Per-user upload authorization | App-level path checks alone | Supabase Storage RLS (`foldername(name)[1] = auth.uid()`) | DB-enforced; the anon key is public, RLS is the boundary (same posture as table RLS). |
| Image resize/format consistency | Manual canvas re-encode | `sharp.webp()/.jpeg()` | One format out, controlled quality, server-side, same pass as the strip. |
| Render/optimize photos | Custom `<img>` + manual srcset | `next/image` + Supabase host whitelist | Lazy load, sizing, format negotiation. |

**Key insight:** The EXIF strip *looks* like a small task ("just remove metadata") but is the project's flagged "looks done but isn't" trap — the only trustworthy implementation is a full re-encode through a mature library, proven by a regression test that reads the bytes back. Everything around it (Storage auth, reorder UX, format consistency) also has a mature library; the phase's risk is concentrated entirely in *correctly wiring* these, not in building anything novel.

## Common Pitfalls

### Pitfall 1: EXIF/GPS survives because the strip was added wrong (or undone)
**What goes wrong:** Photo uploads "work," images display fine, but the stored object still carries GPS — because someone added `.withMetadata()` (to fix orientation), or resized with a library that preserves metadata, or stored the original alongside the stripped copy. Defeats the entire privacy model.
**Why it happens:** EXIF is invisible in normal use; orientation bugs tempt devs to re-attach metadata; "we resize on upload" feels like it strips but doesn't unless re-encoded.
**How to avoid:** `sharp(input).rotate().webp().toBuffer()` — `.rotate()` (no args) bakes orientation so you never need `.withMetadata()`. Store ONLY the re-encoded buffer. Gate with the `exifr` no-GPS regression test (Validation §) and make it a CI gate. Verify the *stored* object (round-trip download), not just the in-memory buffer.
**Warning signs:** any `withMetadata`/`keepMetadata`/`keepExif` in the image path; the original file persisted; no automated GPS-absence test.

### Pitfall 2: HEIC uploads silently fail or throw unhandled
**What goes wrong:** iPhone users upload `.heic`; the prebuilt `sharp` binary can't decode it → `sharp()` throws → upload errors with a confusing message, or (worse) a client that mislabels HEIC as `image/jpeg` slips a non-decodable file in.
**Why it happens:** The default npm `sharp` does NOT include libheif; iPhones default to HEIC.
**How to avoid:** Reject HEIC explicitly server-side: sniff magic bytes (`ftypheic`/`ftypheif`/`ftypmif1`), reject by MIME, and catch `sharp` decode errors → return a friendly "Please upload JPG, PNG, or WebP (HEIC isn't supported — your phone can export JPG)." Surface this in the uploader UI. Confirm the accepted-types check runs on the *sniffed* type, not the client-declared one.
**Warning signs:** generic "upload failed" on iPhone photos; relying on `file.type` from the browser.

### Pitfall 3: RLS missing on a new table (CVE-2025-48757 class)
**What goes wrong:** `listings` / `listing_fitment` / `listing_photos` / `listing_view_events` created without RLS → anon key reads/writes everything.
**Why it happens:** RLS is opt-in per table; a join/log table is easy to forget.
**How to avoid:** `enable row level security` in the SAME migration as every `create table` (repo convention since 0001). Default-deny, then add the minimum policies. Extend `tests/integration/` with a `listings.test.ts` mirroring `garage.test.ts`: anon reads public columns, anon write denied, non-owner write denied.
**Warning signs:** a migration creating a table without `enable row level security`; "Unrestricted" badge in the dashboard.

### Pitfall 4: Storage write authorization done in app code only
**What goes wrong:** The Server Action checks `auth.uid()` but the bucket has no/loose RLS → a crafted direct Storage API call uploads anywhere.
**Why it happens:** Storage RLS is separate from table RLS and easy to skip; a public bucket tempts "it's public anyway."
**How to avoid:** Bucket RLS with `(storage.foldername(name))[1] = auth.uid()` for insert/update/delete; public read only. Test that anon can read but not write, and that user A can't write into user B's folder.
**Warning signs:** bucket with no insert policy but uploads "work" (running as service-role somewhere); path not prefixed by `<uid>/`.

### Pitfall 5: Orphaned staging objects accumulate (and the publish reconcile trusts the client)
**What goes wrong:** Sellers select photos then abandon → staged objects linger; or publish writes `listing_photos` from a client-supplied path list pointing at someone else's folder.
**Why it happens:** Selection-time upload + no-draft means uploads happen before commit; the path list round-trips through the client.
**How to avoid:** Accept orphans as harmless (they're invisible, cost only bytes) and schedule a cleanup of `<uid>/staging/*` older than N hours not referenced in `listing_photos` (defer the job to Phase 10 ops if needed). On publish, **validate every submitted path starts with the caller's own `<uid>/`** before inserting `listing_photos`.
**Warning signs:** growing staging folder; `listing_photos` rows pointing outside the owner's prefix.

### Pitfall 6: Money stored as float / price rounding bugs
**What goes wrong:** `asking_price` as `float8` → 19.99 stored as 19.989999…; comparisons and display drift.
**Why it happens:** Reaching for `numeric`-vs-`float` is easy to get wrong.
**How to avoid:** `numeric(12,2)` with `check (asking_price > 0)`. Zod: `z.coerce.number().positive().multipleOf(0.01)`. Display via `Intl.NumberFormat('en-US', {style:'currency', currency:'USD'})`.
**Warning signs:** prices with trailing float noise; `real`/`float8` in the schema.

### Pitfall 7: Next/Client boundary leaks the seller object
**What goes wrong:** A Server Component fetches a wide seller object and passes it to the `'use client'` listing form/card → PII in the RSC payload.
**Why it happens:** Props serialize to the browser; wide fetches are convenient.
**How to avoid:** Fetch narrow public shapes; the listing page reads `listings` + `profiles_public` columns only. Keep `lib/images/strip.ts` and any service-role under `import 'server-only'`.
**Warning signs:** whole DB rows passed as props; PII fields in view-source.

## Code Examples

### Create a listing (Server Action, owner-scoped, multi-fit + photos)
```typescript
// lib/actions/listings.ts (excerpt) — Source: repo garage.ts pattern + Supabase docs (HIGH)
"use server";
import { createClient } from "@/lib/supabase/server";
import { listingSchema } from "@/lib/listings/schema";

export async function createListing(input: unknown) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false as const, error: "unauthenticated" };

  const parsed = listingSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  const v = parsed.data;

  // Validate submitted photo paths belong to the caller (Pitfall 5).
  if (v.photoPaths.some((p) => !p.startsWith(`${userId}/`)))
    return { ok: false as const, error: "invalid_photo_path" };

  // Re-check each fitment combo vs model_configurations when config is set (addTruck pattern).
  for (const f of v.fitment) {
    if (f.configId != null) {
      const { data: combo } = await supabase
        .from("model_configurations")
        .select("model_id")
        .eq("model_id", f.modelId)
        .eq("configuration_id", f.configId)
        .maybeSingle();
      if (!combo) return { ok: false as const, error: "invalid_combo" };
    }
  }

  // Insert listing (owner RLS with-check enforces seller_id).
  const { data: listing, error } = await supabase
    .from("listings")
    .insert({
      seller_id: userId,
      title: v.title,
      part_number: v.partNumber || null,
      asking_price: v.askingPrice,
      condition_id: v.conditionId,
      shipping_option: v.shippingOption,
      damage_notes: v.damageNotes || null,
      is_barnyard: v.isBarnyard,
      // status defaults to 'active'; date_listed defaults to now()
    })
    .select("id")
    .single();
  if (error || !listing) return { ok: false as const, error: "insert_failed" };

  // Bulk-insert fitment + photos (owner-write policies via EXISTS on listings).
  if (v.fitment.length)
    await supabase.from("listing_fitment").insert(
      v.fitment.map((f) => ({ listing_id: listing.id, model_id: f.modelId, config_id: f.configId ?? null })),
    );
  if (v.photoPaths.length)
    await supabase.from("listing_photos").insert(
      v.photoPaths.map((path, i) => ({ listing_id: listing.id, storage_path: path, sort_order: i })),
    );

  return { ok: true as const, id: listing.id }; // caller redirects to /listings/<id>
}
```
> For atomicity (listing + fitment + photos all-or-nothing), consider wrapping this in a Postgres function (RPC) invoked with the user client so RLS still applies — or accept best-effort sequential inserts in v1 and reconcile on edit. The repo has not used multi-table transactions yet; a SECURITY INVOKER RPC is the clean upgrade if partial-insert risk matters.

### No-GPS regression test (the P0 gate)
```typescript
// tests/unit/exif-strip.test.ts — Source: exifr API (HIGH), sharp default-strip (HIGH)
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import exifr from "exifr";
import { stripAndReencode } from "@/lib/images/strip";

describe("EXIF/GPS strip (LIST-03 P0 gate)", () => {
  it("removes GPS from a photo that contained GPS", async () => {
    // Build an input image WITH GPS EXIF so the test is meaningful.
    const withGps = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#888" },
    })
      .withExif({ IFD0: { Make: "TestCam" }, GPS: { GPSLatitude: "50/1 17/1 0/1", GPSLatitudeRef: "N" } })
      .jpeg()
      .toBuffer();

    // Sanity: the input really has GPS.
    const before = await exifr.gps(withGps);
    expect(before).toBeTruthy();

    const out = await stripAndReencode(withGps, "image/jpeg");
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    // The stripped buffer has NO GPS and NO EXIF block.
    const gps = await exifr.gps(out.buffer);
    expect(gps).toBeFalsy();                  // undefined when stripped
    const all = await exifr.parse(out.buffer, { gps: true, exif: true, ifd0: true });
    expect(all?.latitude).toBeUndefined();
    expect(all?.longitude).toBeUndefined();
  });

  it("rejects HEIC / non-accepted types", async () => {
    const r = await stripAndReencode(Buffer.from([0, 1, 2]), "image/heic");
    expect(r).toEqual({ ok: false, error: "unsupported_type" });
  });
});
```
> **Strengthen the gate further** by also asserting on the *round-tripped Storage object* in an integration test (upload → download → `exifr.gps(downloaded)` is falsy), since the in-memory buffer test proves the helper but not the full pipeline. The unit test above is the fast Wave-0 gate; the integration round-trip is the belt-and-suspenders.

### Storage public URL for rendering
```typescript
// Source: Supabase Storage docs (HIGH)
const { data } = supabase.storage.from("listing-photos").getPublicUrl(storagePath);
// data.publicUrl → <img>/next/image src (whitelist the host in next.config images.remotePatterns)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sharp().withMetadata()` to keep orientation, then hope EXIF is fine | `sharp().rotate()` bakes orientation, default-strips all metadata | sharp ≥ 0.33 (`keepExif`/`keepMetadata` split out as explicit opt-ins) | Stripping is the *default*; the risk inverted to "don't re-attach." |
| `react-beautiful-dnd` for reorder | `@dnd-kit/sortable` | rbd deprecated; React 19 compat uncertain | dnd-kit is the only sane choice for new React 19 code. |
| Realtime `postgres_changes` for everything | (N/A this phase) | — | — |
| Single profiles table, column discipline | Public/private table split (already in repo) | Phase 1 | Listings JOIN only `profiles_public`. |

**Deprecated/outdated:**
- **`react-beautiful-dnd`**: deprecated; do not use.
- **`sharp().withMetadata()` as a "safe" call**: it KEEPS metadata — the opposite of what's wanted here.
- **Postgres `enum` for an evolving status**: prefer `text` + CHECK for extensibility (CONTEXT requirement).

## Open Questions

1. **Where does the account-level `contact_preference` column live (LIST-07)?**
   - What we know: It's account-scoped, default `messaging_only`, edited in account settings, only displayed on the listing form. The value itself (an enum of three options) is **not PII**.
   - What's unclear: Whether it belongs on `profiles_public` (so a buyer-facing listing/profile can show "contact via messaging only") or `profiles_private` (settings-only, server-read).
   - Recommendation: Put it on **`profiles_public`** as a `contact_preference text` (CHECK `email_only|email_phone|messaging_only`, default `messaging_only`). It governs how a buyer may contact the seller, so the public contact surface (Phase 9) needs to read it; it carries no PII. The actual email/phone it *unlocks* still live in `profiles_private` and are only ever surfaced through the privacy-preserving contact flow in Phase 9 — P5 only stores the preference. Confirm with the planner against the Phase-1 `profiles_public` columns.

2. **Supabase plan: Image Transformations (free vs Pro)?** (flagged in STATE pre-Phase-5)
   - What we know: Image Transformations (on-the-fly resize/WebP) require the Pro plan; the project is on Staging.
   - What's unclear: Whether v1 budgets for Pro.
   - Recommendation: **Don't depend on Image Transformations.** Do the format/size normalization in the same `sharp` pass that strips EXIF (already re-encoding anyway — emit WebP at a sane max dimension), and render with `next/image`'s built-in optimizer against the public Storage URL. This is plan-agnostic and keeps the strip + resize in one server pass. Optionally generate a thumbnail in the same action (second `sharp` resize) if the feed needs one in Phase 7.

3. **Atomicity of create (listing + fitment + photos)?**
   - What we know: Three inserts; the repo has only done single-table writes so far.
   - What's unclear: Whether partial-insert (listing created, fitment insert fails) is acceptable in v1.
   - Recommendation: Acceptable in v1 as best-effort (edit can fix), but the clean answer is a **SECURITY INVOKER Postgres RPC** that does all three under the caller's RLS in one transaction. Flag for the planner to decide based on appetite; if chosen, it's a small migration.

4. **HEIC: reject (recommended) vs convert?**
   - What we know: Prebuilt `sharp` can't decode HEIC; converting needs a custom libvips+libheif build (out of scope).
   - Recommendation: **Reject** with a clear message in v1 (iPhones can be set to export JPG; most marketplace flows reject HEIC). Revisit server-convert only if HEIC rejection causes real seller drop-off — that would be a deliberate infra change (custom sharp build or a conversion microservice).

## Sources

### Primary (HIGH confidence)
- https://sharp.pixelplumbing.com/api-output — sharp output/metadata: default strips ALL metadata incl. EXIF orientation; `keepExif`/`keepMetadata`/`withMetadata` re-attach; `rotate()` orientation; prebuilt binary does NOT decode HEIF/HEIC.
- https://github.com/MikeKovarik/exifr — exifr API: `parse(buffer)`/`gps(buffer)` from Buffer; `gps()` → undefined when absent; segment options.
- https://supabase.com/docs/guides/storage/security/access-control — storage.objects RLS, `(storage.foldername(name))[1] = auth.uid()` per-user folder, public vs owner-only.
- https://supabase.com/docs/guides/storage/uploads/standard-uploads — `.from(bucket).upload(path, file, {contentType, upsert})`.
- Repo files (HIGH, the binding conventions): `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/actions/garage.ts`, `supabase/migrations/0004_garage.sql`, `tests/integration/garage.test.ts`, `.planning/research/{ARCHITECTURE,STACK,PITFALLS}.md`, `CLAUDE.md`.

### Secondary (MEDIUM confidence)
- https://www.hirenodejs.com/blog/nodejs-sharp-image-processing-2026 — sharp 0.34 perf/format notes (NB: its "HEIC native" claim conflicts with official docs — see contradiction note).
- https://www.pkgpulse.com/guides/dnd-kit-vs-react-beautiful-dnd-vs-pragmatic-drag-drop-2026 — dnd-kit is the 2026 standard; rbd deprecated.
- https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react — DnD library comparison.
- https://www.npmjs.com/package/exifr — exifr handles Buffer/Uint8Array/Blob; GPS on by default.

### Tertiary (LOW confidence)
- General training knowledge of Supabase Storage `getPublicUrl`/`createSignedUrl`/`remove`/`move` signatures (stable API; the upload + RLS specifics above are doc-verified, the URL helpers are well-established but not re-fetched this session — planner should confirm exact signatures against current supabase-js docs when wiring).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — sharp/exifr/dnd-kit roles verified against official docs + multiple 2026 sources; Supabase clients already pinned in repo.
- EXIF strip pipeline (the P0 gate): HIGH — sharp default-strip + `rotate()` + no-keep-methods confirmed by official output docs and a second source; HEIC-reject confirmed (prebuilt binary can't decode).
- Architecture / data model / RLS: HIGH — mirrors the repo's proven `garage_trucks` owner-scoped pattern and the documented privacy/table-split + default-deny conventions; storage RLS doc-verified.
- Staging-vs-pending recommendation: MEDIUM — a design call; both satisfy the gate, staging-path is the better product/privacy fit but not "the one right answer."
- HEIC handling: MEDIUM — reject is well-supported; one secondary source claims sharp HEIC support (refers to custom libvips builds, not the prebuilt npm binary — contradiction flagged).
- Pitfalls: HIGH — drawn from the repo's own PITFALLS.md (Pitfall 4 EXIF, 2 RLS, 3 service-role) plus this phase's specifics.

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 (30 days — sharp/Supabase Storage/dnd-kit are stable lines; re-verify sharp HEIC + exact supabase-js Storage URL signatures if the planner hits friction).
