-- 0026_listing_year.sql
-- Phase 16 — Part Taxonomy & Guided Cascade (Plan 05): the YEAR dimension.
--
-- Today year exists only on garage_trucks (0005). Listings carry no year. This
-- migration adds the per-listing YEAR dimension that the two UI plans (16-06
-- search, 16-07 create/edit) build on:
--
--   1. listings.year_start + listings.year_end (smallint, nullable). Both null =
--      UNIVERSAL (the part fits ALL years). A "specific year" is stored as
--      year_start = year_end. A range is year_start <= year_end. Stakeholder-
--      confirmed semantics.
--   2. Two CHECK constraints:
--        * listings_year_bounds: each set value lies in 1970..2027 (mirrors the
--          garage bounds from 0005_garage_year.sql; 2027 = current year + 1).
--        * listings_year_pairing: both null, OR both set with year_start <= year_end.
--   3. search_listings RECREATED via `create or replace` with ONE new parameter
--      p_year (placed after p_condition_id, before p_fits_model_id) and ONE new
--      WHERE arm. The buyer filters by a SINGLE year (their truck's year); a
--      listing matches when p_year is null, OR the listing is universal
--      (year_start null), OR p_year falls inside [year_start, year_end].
--
-- EXISTING LISTINGS have no year set → both columns null → universal → they stay
-- findable for ANY year filter. No backfill, no NOT NULL (unlike garage's required
-- year — listings default to universal, not a placeholder year).
--
-- SIGNATURE CHANGE IS INTENTIONAL: search_listings is no longer byte-identical to
-- 0024/0025. It is the 0025 signature PLUS p_year, and EVERY 0025 WHERE arm
-- (keyword/FTS+slang, condition, model/config, recursive-CTE category subtree,
-- fits-my-truck) is reproduced UNCHANGED. lib/search/queries.ts is updated in the
-- same plan to forward p_year. Privacy/RLS untouched: only columns on the existing
-- public listings table + a `security definer set search_path = ''` function body.

-- ===========================================================================
-- SECTION A — Add the year columns (idempotent) + CHECK constraints.
-- Nullable, no backfill: absent year = universal = fits all years.
-- ===========================================================================
alter table public.listings
  add column if not exists year_start smallint,
  add column if not exists year_end smallint;

-- Bounds: each set value in the heavy-truck plausible range 1970..2027 (mirrors
-- garage_trucks_year_range in 0005). Drop-and-add for idempotency.
alter table public.listings
  drop constraint if exists listings_year_bounds;
alter table public.listings
  add constraint listings_year_bounds
  check (
    (year_start is null or year_start between 1970 and 2027)
    and (year_end is null or year_end between 1970 and 2027)
  );

-- Pairing: both null (universal) OR both set with a valid ordered range.
alter table public.listings
  drop constraint if exists listings_year_pairing;
alter table public.listings
  add constraint listings_year_pairing
  check (
    (year_start is null and year_end is null)
    or (year_start is not null and year_end is not null and year_start <= year_end)
  );

-- ===========================================================================
-- SECTION B — Recreate search_listings with the p_year arm.
-- The parameter list and RETURNS table reproduce 0025 VERBATIM except for ONE
-- added parameter (p_year, after p_condition_id, before p_fits_model_id). The
-- body reproduces ALL 0025 WHERE arms unchanged and adds ONE year arm. Every
-- object stays schema-qualified because search_path = ''.
--
-- DROP the OLD 0025 9-arg signature FIRST. `create or replace function` keys on
-- the full argument type list — adding p_year produces a DISTINCT overload, so
-- without this drop both the 9-arg and 10-arg functions would coexist and named
-- calls would become ambiguous. Drop the exact 0025 signature, then create the
-- single 10-arg definition. (Return type is unchanged, so no CASCADE needed.)
-- ===========================================================================
drop function if exists public.search_listings(
  text, bigint, bigint, bigint, bigint, bigint, bigint, int, int
);

create or replace function public.search_listings(
  p_q text default null,
  p_model_id bigint default null,
  p_config_id bigint default null,
  p_category_id bigint default null,
  p_condition_id bigint default null,
  p_year int default null,
  p_fits_model_id bigint default null,
  p_fits_config_id bigint default null,
  p_limit int default 24,
  p_offset int default 0
)
returns table (
  id bigint,
  title text,
  asking_price numeric,
  condition_id bigint,
  date_listed timestamptz,
  rank real,
  total_count bigint
)
language sql stable security definer set search_path = '' as $$
  select
    l.id,
    l.title,
    l.asking_price,
    l.condition_id,
    l.date_listed,
    case
      when p_q is null then 0
      else ts_rank(l.search_vector, websearch_to_tsquery('english', p_q))
    end as rank,
    count(*) over() as total_count
  from public.listings l
  where l.status = 'active'
    and l.hidden_at is null
    and (l.expires_at is null or l.expires_at > now())
    -- keyword arm: FTS tsvector OR per-listing slang tags OR slang taxonomy
    -- targets (exact + typo via similarity; active terms only)
    and (
      p_q is null
      or l.search_vector @@ websearch_to_tsquery('english', p_q)
      or exists (
        select 1
        from public.listing_search_terms lst
        join public.search_terms st on st.id = lst.term_id
        where lst.listing_id = l.id
          and st.is_active
          and public.similarity(st.term::text, p_q) >= 0.3
      )
      or exists (
        select 1
        from public.search_terms st
        join public.search_term_targets stt on stt.search_term_id = st.id
        where st.is_active
          and public.similarity(st.term::text, p_q) >= 0.3
          and (
            (stt.model_id is not null and exists (
              select 1 from public.listing_fitment lf
              where lf.listing_id = l.id and lf.model_id = stt.model_id))
            or (stt.make_id is not null and exists (
              select 1 from public.listing_fitment lf
              join public.models m on m.id = lf.model_id
              where lf.listing_id = l.id and m.make_id = stt.make_id))
            or (stt.config_id is not null and exists (
              select 1 from public.listing_fitment lf
              where lf.listing_id = l.id and lf.config_id = stt.config_id))
          )
      )
    )
    -- condition facet
    and (p_condition_id is null or l.condition_id = p_condition_id)
    -- year facet (single buyer year): null filter, or universal listing
    -- (year_start null), or the buyer year falls inside the listing's range.
    and (p_year is null or l.year_start is null or (p_year between l.year_start and l.year_end))
    -- model / config facet (config null = match any config of that model)
    and (
      p_model_id is null
      or exists (
        select 1
        from public.listing_fitment lf
        where lf.listing_id = l.id
          and lf.model_id = p_model_id
          and (p_config_id is null or lf.config_id is null or lf.config_id = p_config_id)
      )
    )
    -- part-category facet (subtree match: selected node + all descendants)
    and (
      p_category_id is null
      or exists (
        with recursive subtree as (
          select id from public.part_categories where id = p_category_id
          union all
          select c.id
          from public.part_categories c
          join subtree s on c.parent_id = s.id
        )
        select 1
        from public.listing_categories lc
        join subtree st on st.id = lc.category_id
        where lc.listing_id = l.id
      )
    )
    -- fits-my-truck facet
    and (
      p_fits_model_id is null
      or exists (
        select 1
        from public.listing_fitment lf
        where lf.listing_id = l.id
          and lf.model_id = p_fits_model_id
          and (p_fits_config_id is null or lf.config_id is null or lf.config_id = p_fits_config_id)
      )
    )
  order by rank desc, l.date_listed desc
  limit p_limit offset p_offset;
$$;

-- ===========================================================================
-- NOTES (documented constraints):
--   * search_listings signature is the 0025 signature PLUS p_year (after
--     p_condition_id, before p_fits_model_id). All prior WHERE arms are
--     reproduced unchanged; only the year arm is new. Positional callers must
--     be updated (lib/search/queries.ts forwards p_year in this same plan).
--   * Adding a parameter in the MIDDLE shifts positional order, so a stale
--     create-or-replace of the OLD 9-arg signature would leave TWO overloads.
--     There is only ever one search_listings definition checked in; the latest
--     migration is the single source of truth.
--   * No backfill / no NOT NULL: existing + future listings without a year are
--     universal and match every year filter by design.
-- ===========================================================================
