-- 0023_search_security_definer.sql
-- Phase 10 plan 10-10 (phase verification) — fix the FTS GIN gate regression
-- introduced by 0019 (deferred-items.md entry [10-04]).
--
-- PROBLEM: 0019 replaced the `listings public-read` policy `using (true)` with
-- `(hidden_at is null and status <> 'draft') or seller_id = (select auth.uid())`.
-- With a non-trivial RLS qual, PostgreSQL refuses to push the user's
-- NON-LEAKPROOF `search_vector @@ tsquery` predicate below the security qual,
-- so the GIN index on search_vector is unusable for anon reads: the live
-- security-INVOKER search_listings RPC and the explain_search_plan gate both
-- degraded to a filtered Seq Scan.
--
-- FIX (the 0020_active_listing_count_hidden pattern): make the two functions
-- SECURITY DEFINER with the public-visibility predicate baked into the body —
-- `status = 'active' and hidden_at is null` ('draft' is excluded by
-- status = 'active'; suspension/ban/moderation hides are hidden_at rows).
-- RLS remains the boundary for direct table reads; the definer body enforces
-- the IDENTICAL visibility rule, so no row that anon could not read via RLS is
-- ever returned. Both functions return ONLY public columns / plan text — no
-- PII (Pitfall 1 unaffected). Signatures are FROZEN (07-02 readers + the
-- integration gate call them); only language-level posture + body change.
--
-- NOTE: search_listings previously also matched the CALLER's own non-active
-- rows via the policy's `seller_id = auth.uid()` arm only incidentally — the
-- body always required status = 'active', so behavior for every caller is
-- byte-identical except hidden rows are now excluded for their OWNER too in
-- search results (correct: hidden listings should not surface in public
-- search; owners manage them via /sell/listings which reads directly).

-- ===========================================================================
-- 1. search_listings — now SECURITY DEFINER with hidden_at is null baked in.
-- ===========================================================================
create or replace function public.search_listings(
  p_q text default null,
  p_model_id bigint default null,
  p_config_id bigint default null,
  p_category_id bigint default null,
  p_condition_id bigint default null,
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
    -- keyword arm: FTS tsvector OR per-listing slang tags (exact + typo via similarity)
    and (
      p_q is null
      or l.search_vector @@ websearch_to_tsquery('english', p_q)
      or exists (
        select 1
        from public.listing_search_terms lst
        join public.search_terms st on st.id = lst.term_id
        where lst.listing_id = l.id
          and public.similarity(st.term::text, p_q) >= 0.3
      )
    )
    -- condition facet
    and (p_condition_id is null or l.condition_id = p_condition_id)
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
    -- part-category facet
    and (
      p_category_id is null
      or exists (
        select 1
        from public.listing_categories lc
        where lc.listing_id = l.id
          and lc.category_id = p_category_id
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
-- 2. explain_search_plan — definer too. The EXPLAINed query keeps the ORIGINAL
--    0014 shape (FTS predicate only): the gate proves the GIN index is wired
--    and choosable for the @@ arm. Adding the status/hidden_at predicates here
--    makes the pinned planner prefer a btree path on the tiny Staging table
--    (observed live), turning the gate data-volume-flaky — the visibility
--    predicates live in the search_listings body, not in this index gate.
--    Definer removes the RLS qual that blocked non-leakproof @@ pushdown,
--    which is exactly the regression this gate exists to catch. Plan text only.
-- ===========================================================================
create or replace function public.explain_search_plan(p_q text)
returns setof text
language plpgsql volatile security definer set search_path = '' set enable_seqscan = 'off' as $$
begin
  return query execute
    'explain analyze select * from public.listings ' ||
    'where search_vector @@ websearch_to_tsquery(''english'', $1)'
    using p_q;
end;
$$;
