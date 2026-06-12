-- 0024_search_slang_target_expansion.sql
-- Phase 10 UAT gap (10-10, walkthrough F.16): admin-added slang never reaches
-- search results for existing listings.
--
-- PROBLEM: the keyword arm of search_listings matched slang ONLY via
-- listing_search_terms (the FINT-03 per-listing tags a seller accepts at
-- create/edit time). The taxonomy mapping the admin edits in the Fitment
-- Library slang editor (search_terms -> search_term_targets, exclusive arc
-- make | model | config) was consumed by expandSlang() for the transparency
-- banner only — it never entered the query. Net effect: a new term mapped to
-- a model could not surface any listing created before the term existed
-- (ADMO-06's whole point: "add trucker slang, search finds the parts").
--
-- FIX: third keyword arm — resolve p_q against ACTIVE search_terms by
-- similarity (same 0.3 threshold as the tag arm; public.similarity, never
-- bare %), follow search_term_targets, and match listings whose
-- listing_fitment hits the target (make via models.make_id, model directly,
-- config directly). Also gate BOTH slang arms on st.is_active so a
-- deactivated term stops expanding immediately (10-05 lifecycle semantics —
-- existing listings/tags are untouched; the term just stops matching).
--
-- Signature FROZEN (07-02 readers + integration gate). Definer posture,
-- visibility predicate, facets, ordering: byte-identical to 0023.

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
