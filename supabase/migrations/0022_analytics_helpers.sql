-- 0022_analytics_helpers.sql — ADMA-02/03/04 read-side helpers for the /admin
-- analytics dashboard (plan 10-06).
--
-- RENAMED from 0020_analytics_helpers.sql at phase verification (10-10): the
-- prefix collided with 0020_active_listing_count_hidden.sql (parallel wave 2).
-- File rename ONLY — already applied to Staging via `db query --linked -f`,
-- chronologically BEFORE 0021_report_queue_rpc.sql.
--
-- WHY SQL functions at all: PostgREST cannot express these shapes —
--   - group-by on a jsonb facet key (facets->>'makeId') joined to a name table
--   - a UNION ALL of two facet arms (modelId + fitsModelId) into one demand count
--   - a date_trunc('month', ...) 12-bucket series across two tables
-- Everything PostgREST CAN express (status counts, ranged message counts) stays
-- as plain supabase-js queries in lib/admin/analytics.ts.
--
-- POSTURE (same as 0019 admin_user_activity_stats): execute REVOKED from
-- public/anon/authenticated → only service_role can call these. They are
-- deliberately NOT security definer (plan 10-06 decision): they read only
-- public-schema tables and the sole caller is the service-role client, which
-- bypasses RLS anyway — invoker keeps the smallest possible privilege surface.
--
-- Conventions: lowercase SQL, `set search_path = ''` on every function (0010
-- precedent), `p_since is null` = the "All time" preset.

-- ===========================================================================
-- 1. admin_top_viewed_listings (ADMA-02) — top 10 listings by view events in
--    range. Joins the title/status; includes hidden listings (admin view) and
--    surfaces the hidden flag so the UI can badge them.
-- ===========================================================================
create or replace function public.admin_top_viewed_listings(p_since timestamptz)
returns table (
  listing_id bigint,
  title text,
  status text,
  is_hidden boolean,
  view_count bigint
)
language sql
stable
set search_path = ''
as $$
  select
    l.id,
    l.title,
    l.status,
    (l.hidden_at is not null),
    count(*)::bigint
  from public.listing_view_events e
  join public.listings l on l.id = e.listing_id
  where p_since is null or e.created_at >= p_since
  group by l.id, l.title, l.status, l.hidden_at
  order by count(*) desc, l.id
  limit 10;
$$;

revoke execute on function public.admin_top_viewed_listings(timestamptz) from public;
revoke execute on function public.admin_top_viewed_listings(timestamptz) from anon;
revoke execute on function public.admin_top_viewed_listings(timestamptz) from authenticated;

-- ===========================================================================
-- 2. admin_top_search_makes (ADMA-03) — top 10 makes by search_events facet.
--    Facet keys are camelCase jsonb (verified in app/(public)/page.tsx):
--    facets->>'makeId'. `->>'k'` returns NULL for both absent keys and json
--    null, so the is-not-null arm covers facet rows logged as {"makeId": null}.
-- ===========================================================================
create or replace function public.admin_top_search_makes(p_since timestamptz)
returns table (make_id bigint, make_name text, search_count bigint)
language sql
stable
set search_path = ''
as $$
  select m.id, m.name, count(*)::bigint
  from public.search_events e
  join public.makes m on m.id = (e.facets->>'makeId')::bigint
  where e.facets->>'makeId' is not null
    and (p_since is null or e.created_at >= p_since)
  group by m.id, m.name
  order by count(*) desc, m.name
  limit 10;
$$;

revoke execute on function public.admin_top_search_makes(timestamptz) from public;
revoke execute on function public.admin_top_search_makes(timestamptz) from anon;
revoke execute on function public.admin_top_search_makes(timestamptz) from authenticated;

-- ===========================================================================
-- 3. admin_top_search_models (ADMA-03) — top 10 models by DEMAND: the explicit
--    modelId facet UNION ALL the fitsModelId facet ("Fits my truck" searches
--    are model demand too — plan 10-06 locked this union). Name is rendered
--    "Make Model" so same-named models under different makes don't collide.
-- ===========================================================================
create or replace function public.admin_top_search_models(p_since timestamptz)
returns table (model_id bigint, model_name text, search_count bigint)
language sql
stable
set search_path = ''
as $$
  with demand as (
    select (e.facets->>'modelId')::bigint as model_id
    from public.search_events e
    where e.facets->>'modelId' is not null
      and (p_since is null or e.created_at >= p_since)
    union all
    select (e.facets->>'fitsModelId')::bigint
    from public.search_events e
    where e.facets->>'fitsModelId' is not null
      and (p_since is null or e.created_at >= p_since)
  )
  select mo.id, ma.name || ' ' || mo.name, count(*)::bigint
  from demand d
  join public.models mo on mo.id = d.model_id
  join public.makes ma on ma.id = mo.make_id
  group by mo.id, ma.name, mo.name
  order by count(*) desc, ma.name, mo.name
  limit 10;
$$;

revoke execute on function public.admin_top_search_models(timestamptz) from public;
revoke execute on function public.admin_top_search_models(timestamptz) from anon;
revoke execute on function public.admin_top_search_models(timestamptz) from authenticated;

-- ===========================================================================
-- 4. admin_top_search_terms (ADMA-03 extra — Research open question 2) — top
--    10 normalized (slang-expanded) terms. Raw terms stay un-surfaced; the
--    normalized term is the canonical demand signal.
-- ===========================================================================
create or replace function public.admin_top_search_terms(p_since timestamptz)
returns table (term text, search_count bigint)
language sql
stable
set search_path = ''
as $$
  select e.normalized_term, count(*)::bigint
  from public.search_events e
  where e.normalized_term is not null
    and btrim(e.normalized_term) <> ''
    and (p_since is null or e.created_at >= p_since)
  group by e.normalized_term
  order by count(*) desc, e.normalized_term
  limit 10;
$$;

revoke execute on function public.admin_top_search_terms(timestamptz) from public;
revoke execute on function public.admin_top_search_terms(timestamptz) from anon;
revoke execute on function public.admin_top_search_terms(timestamptz) from authenticated;

-- ===========================================================================
-- 5. admin_monthly_growth (ADMA-04) — 12 fixed month buckets (oldest → newest,
--    current partial month last) of new users (profiles_public.member_since)
--    and new listings (listings.created_at). generate_series guarantees
--    zero-filled months so the chart never has gaps. Growth % is computed in
--    TS from the last two buckets.
-- ===========================================================================
create or replace function public.admin_monthly_growth()
returns table (month_start date, new_users bigint, new_listings bigint)
language sql
stable
set search_path = ''
as $$
  with months as (
    select generate_series(
      date_trunc('month', now()) - interval '11 months',
      date_trunc('month', now()),
      interval '1 month'
    ) as bucket
  )
  select
    m.bucket::date,
    (
      select count(*) from public.profiles_public p
      where p.member_since >= m.bucket and p.member_since < m.bucket + interval '1 month'
    ),
    (
      select count(*) from public.listings l
      where l.created_at >= m.bucket and l.created_at < m.bucket + interval '1 month'
    )
  from months m
  order by m.bucket;
$$;

revoke execute on function public.admin_monthly_growth() from public;
revoke execute on function public.admin_monthly_growth() from anon;
revoke execute on function public.admin_monthly_growth() from authenticated;
