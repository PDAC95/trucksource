-- 0006_listings.sql
-- Phase 5 — Listings, Photos & EXIF-Safe Storage (data model).
-- Creates the four listing-domain tables, EACH with RLS enabled in THIS migration
-- (CLAUDE.md invariant #2, default-deny). Mirrors the 0003/0004 conventions:
-- lowercase SQL, `id bigint generated always as identity primary key`, the
-- (select auth.uid()) wrapper on owner policies, and the coalesce(...,0) unique-index
-- trick for the NULL config arm (expression PKs aren't allowed).
--
-- Privacy / RLS posture:
--   - `listings` is itself a PUBLIC table — it holds ZERO PII (the only person link is
--     seller_id, an opaque auth.users uuid that resolves to profiles_public for display,
--     NEVER profiles_private). So it does NOT need the privacy split; the split is a
--     profile concern (invariant #1). Public read on all columns; owner-only writes.
--   - listing_fitment / listing_photos follow the listing: public-read, owner-write
--     gated by an EXISTS against listings.seller_id (the row's owner is the listing's
--     seller, not a direct user_id column).
--   - listing_view_events is the analytics event stream (invariant #8 — instrumented
--     NOW in P5, consumed by Phase 10). It has EXACTLY ONE policy: insert (anon +
--     authenticated). NO select/update/delete policy → the raw stream is readable only
--     by the service role in Phase 10. It logs NO IP/PII — just listing_id + nullable
--     viewer_id + created_at.
--
-- Modeling notes:
--   - asking_price is numeric(12,2) — money must be exact (Pitfall 6 — inexact
--     binary types round currency wrong; numeric is exact).
--   - status is text + CHECK, NOT a pg enum: CONTEXT wants extensibility without a
--     breaking migration (Phase 8 mark-as-sold edits the CHECK; ALTER TYPE ADD VALUE is
--     non-transactional and awkward). v1 ships only 'active' on publish.
--   - shipping_option is text + CHECK (LIST-04: three options).
--   - listing_fitment mirrors garage_trucks: model_id (restrict) + nullable config_id
--     (restrict, NULL = model-level), make derived via models.make_id. Multi-fit =
--     many rows per listing. coalesce(config_id,0) folds the NULL arm in the unique idx.

-- ===========================================================================
-- listings (LIST-01) — public marketplace data, owner-write.
-- ===========================================================================
create table public.listings (
  id bigint generated always as identity primary key,
  seller_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  part_number text,
  asking_price numeric(12, 2) not null check (asking_price > 0),
  condition_id bigint not null references public.conditions(id) on delete restrict,
  shipping_option text not null check (
    shipping_option in (
      'shipping_available',
      'local_pickup',
      'shipping_assistance'
    )
  ),
  damage_notes text,
  is_barnyard boolean not null default false,
  status text not null default 'active' check (status in ('active', 'sold')),
  date_listed timestamptz not null default now(),
  created_at timestamptz not null default now()
);
-- The active_listing_count RPC + owner queries filter by seller_id.
create index listings_seller_id_idx on public.listings (seller_id);

alter table public.listings enable row level security;

-- Public read: anyone (anon + authenticated) sees listing public columns.
create policy "listings public-read" on public.listings for
select
  to anon,
  authenticated using (true);

-- Owner-only writes, scoped with the (select auth.uid()) wrapper (repo convention).
create policy "listings owner-insert" on public.listings for insert to authenticated
with
  check ((select auth.uid()) = seller_id);

create policy "listings owner-update" on public.listings
for update
  to authenticated using ((select auth.uid()) = seller_id)
with
  check ((select auth.uid()) = seller_id);

create policy "listings owner-delete" on public.listings for delete to authenticated using ((select auth.uid()) = seller_id);

-- ===========================================================================
-- listing_fitment (LIST-01) — multi-fit many-to-many to the Phase-3 taxonomy.
-- ===========================================================================
create table public.listing_fitment (
  id bigint generated always as identity primary key,
  listing_id bigint not null references public.listings(id) on delete cascade,
  model_id bigint not null references public.models(id) on delete restrict,
  config_id bigint references public.configurations(id) on delete restrict, -- NULL = model-level
  created_at timestamptz not null default now()
);
create index listing_fitment_listing_id_idx on public.listing_fitment (listing_id);
-- No duplicate (model, config) per listing. coalesce folds the NULL config arm
-- (constraints can't use expressions; must be a unique INDEX — the 0003/0004 trick).
create unique index listing_fitment_uniq on public.listing_fitment (listing_id, model_id, coalesce(config_id, 0));

alter table public.listing_fitment enable row level security;

-- Read follows the listing (public). Writes only by the listing's owner — via EXISTS.
create policy "listing_fitment public-read" on public.listing_fitment for
select
  to anon,
  authenticated using (true);

create policy "listing_fitment owner-write" on public.listing_fitment for all to authenticated using (
  exists (
    select
      1
    from
      public.listings l
    where
      l.id = listing_id
      and l.seller_id = (select auth.uid())
  )
)
with
  check (
    exists (
      select
        1
      from
        public.listings l
      where
        l.id = listing_id
        and l.seller_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- listing_photos (LIST-02) — ordered child rows; storage_path -> listing-photos bucket.
-- ===========================================================================
create table public.listing_photos (
  id bigint generated always as identity primary key,
  listing_id bigint not null references public.listings(id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0, -- sort_order = 0 is the cover (first photo)
  created_at timestamptz not null default now()
);
create index listing_photos_listing_id_idx on public.listing_photos (listing_id);

alter table public.listing_photos enable row level security;

-- Same public-read + owner-write-via-EXISTS as listing_fitment.
create policy "listing_photos public-read" on public.listing_photos for
select
  to anon,
  authenticated using (true);

create policy "listing_photos owner-write" on public.listing_photos for all to authenticated using (
  exists (
    select
      1
    from
      public.listings l
    where
      l.id = listing_id
      and l.seller_id = (select auth.uid())
  )
)
with
  check (
    exists (
      select
        1
      from
        public.listings l
      where
        l.id = listing_id
        and l.seller_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- listing_view_events (invariant #8) — append-only analytics stream.
-- Instrumented NOW (P5); aggregated by service-role in Phase 10. No IP/PII.
-- ===========================================================================
create table public.listing_view_events (
  id bigint generated always as identity primary key,
  listing_id bigint not null references public.listings(id) on delete cascade,
  viewer_id uuid references auth.users(id) on delete set null, -- NULL = anon viewer
  created_at timestamptz not null default now()
);
create index listing_view_events_listing_id_idx on public.listing_view_events (listing_id);

alter table public.listing_view_events enable row level security;

-- EXACTLY ONE policy: anyone may INSERT a view event (a view is a public event).
-- NO select/update/delete policy → the raw stream is readable ONLY by the service
-- role (Phase 10 analytics). Default-deny keeps the event stream private.
create policy "listing_view_events insert" on public.listing_view_events for insert to anon,
authenticated
with
  check (true);
