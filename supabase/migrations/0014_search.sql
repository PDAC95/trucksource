-- 0014_search.sql
-- Phase 7 — Search / Feed / Public Profile (DB foundation, Wave 1).
-- This is the search root: it adds the FTS tsvector + GIN index to `listings`,
-- the slang trigram GIN index, the insert-only `search_events` table, and the
-- `search_listings` RPC (plus EXPLAIN + slang helper RPCs the 07-02 readers call).
-- Follows the 0012 conventions verbatim: lowercase SQL, RLS enabled in THIS
-- migration (CLAUDE.md invariant #2, default-deny), and `set search_path = ''` on
-- every function (so every object — incl. pg_trgm's public.similarity() — is
-- schema-qualified, the precedent set by 0010 find_similar_own_listings).
--
-- LOCKED STAKEHOLDER DECISIONS encoded here:
--   - FTS source set = part TITLE + PART NUMBER + DAMAGE NOTES (row-local immutable
--     fields). The Phase-6 Common Search Terms / slang tags live in a CHILD table
--     (listing_search_terms -> search_terms.term) so a STORED generated column cannot
--     aggregate them — slang is folded into the search_listings RPC via an EXISTS arm.
--     NO `description` column is added; the listing form is NOT touched.
--   - to_tsvector('english', ...) is used PLAIN — it IS immutable. unaccent() is NOT
--     wrapped in (Pitfall 2: unaccent is STABLE, not IMMUTABLE → a generated column
--     using it fails to create). pg_trgm covers the fuzzy/accent fallback.
--   - Material & Special-Filter facets are DEFERRED this phase: no listing_materials /
--     listing_special_filters join tables, no p_material_id / p_special_filter_id RPC
--     args. SRCH-03 is satisfied by Make/Model/Configuration/Part-Category/Condition +
--     slang/typo tolerance (the trigram arm).
--
-- ===========================================================================
-- 1. search_vector — STORED generated tsvector over the LOCKED FTS source set.
-- ===========================================================================
alter table public.listings
  add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(part_number, '') || ' ' ||
      coalesce(damage_notes, ''))
  ) stored;

-- ===========================================================================
-- 2. GIN indexes.
--    - listings_search_vector_idx backs the FTS @@ websearch_to_tsquery arm.
--    - listings_title_trgm_idx ALREADY EXISTS (0010) — reuse it for fuzzy title; do
--      NOT recreate.
--    - search_terms_term_trgm_idx backs the slang typo path: public.similarity(term, q)
--      (citext cast to text). This GIN index also backs the bare `%` operator, but the
--      RPC/readers use public.similarity() for search_path='' safety.
-- ===========================================================================
create index if not exists listings_search_vector_idx
  on public.listings using gin (search_vector);

create index if not exists search_terms_term_trgm_idx
  on public.search_terms using gin ((term::text) gin_trgm_ops);

-- ===========================================================================
-- 3. search_events (SRCH-05) — append-only search telemetry.
--    Clones listing_view_events' insert-only RLS posture EXACTLY: ONE policy
--    (insert, anon + authenticated), NO select/update/delete → the raw stream is
--    readable ONLY by the service role (Phase 10 analytics). Captures the raw +
--    normalized term, the applied facets (jsonb), the result count, and the nullable
--    searcher (NULL = anon). No IP/PII.
-- ===========================================================================
create table public.search_events (
  id bigint generated always as identity primary key,
  raw_term text,
  normalized_term text,
  facets jsonb not null default '{}'::jsonb,
  result_count int not null,
  searcher_id uuid references auth.users(id) on delete set null, -- NULL = anon
  created_at timestamptz not null default now()
);

alter table public.search_events enable row level security;

-- EXACTLY ONE policy: anyone may INSERT a search event. NO select/update/delete
-- policy → default-deny keeps the stream private (service-role-only read in P10).
create policy "search_events insert" on public.search_events for insert to anon,
authenticated
with
  check (true);

-- ===========================================================================
-- 4. search_listings RPC (SRCH-01..04) — the single read surface every downstream
--    plan reads through. `language sql stable security invoker set search_path = ''`.
--    Returns ONLY public columns (NEVER seller PII — Pitfall 1); the 07-02 reader
--    resolves photos / fitment / seller separately. Active, non-expired rows only.
--
--    total_count: a `count(*) over()` WINDOW column computed over the full filtered
--    set BEFORE limit/offset → every returned row carries the identical grand total,
--    so the reader gets "X resultados" in ONE query (rows[0].total_count; 0 if empty).
--    This is the ONE chosen strategy — no second round-trip, no p_limit:1000 re-call.
--
--    Keyword arm matches the FTS tsvector OR the per-listing slang tags (a listing
--    tagged with slang matches even when the title doesn't contain it), AND the typo
--    arm uses public.similarity(st.term::text, p_q) >= 0.3 — the schema-qualified
--    FUNCTION form, NEVER the bare `%` operator (which may not resolve under
--    search_path=''; mirrors 0010 find_similar_own_listings).
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
language sql stable security invoker set search_path = '' as $$
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
-- 5. explain_search_plan (cross-cutting EXPLAIN gate, Pitfall 3) — NON-optional.
--    A guaranteed, reliably-runnable path through PostgREST for the EXPLAIN ANALYZE
--    GIN-usage assertion. Returns ONLY plan text (no listing rows, no PII).
-- ===========================================================================
-- volatile (NOT stable): PostgreSQL forbids EXPLAIN inside a non-volatile function
-- ("EXPLAIN is not allowed in a non-volatile function"). The function only reads, but
-- the planner classification must be volatile to host the EXPLAIN. It sets
-- enable_seqscan = off for the duration so the GIN-usage gate is deterministic even on
-- a small Staging table (the planner would otherwise prefer a Seq Scan at low row
-- counts and the index-usage assertion would be data-volume-dependent, not a real
-- regression). The reset is local to the function via SET LOCAL semantics of `set`.
create or replace function public.explain_search_plan(p_q text)
returns setof text
language plpgsql volatile security invoker set search_path = '' set enable_seqscan = 'off' as $$
begin
  return query execute
    'explain analyze select * from public.listings ' ||
    'where search_vector @@ websearch_to_tsquery(''english'', $1)'
    using p_q;
end;
$$;

-- explain_slang_plan — the slang/typo trigram GIN gate (SRCH-04, Pitfall 3).
-- The RPC's RUNTIME slang arm uses public.similarity(term, q) >= 0.3 (correct +
-- search_path='' safe), but that predicate form is NOT GIN-indexable — only the `%`
-- trigram operator is. So this gate EXPLAINs the indexable `%` form to PROVE the
-- search_terms_term_trgm_idx GIN index is correctly wired and choosable. Like the FTS
-- helper it is volatile (EXPLAIN forbidden in non-volatile fns) and pins the planner
-- (enable_seqscan/indexscan/indexonlyscan = off) so on the tiny seed table the GIN
-- index is the only remaining access path — otherwise the B-tree unique index on term
-- or a Seq Scan would win at low row counts and the gate would be data-volume-flaky,
-- not a real regression signal. We use the bare `%` operator HERE ONLY (inside a
-- pinned EXPLAIN) — never in the live RPC/readers, which use public.similarity().
create or replace function public.explain_slang_plan(p_q text)
returns setof text
language plpgsql volatile security invoker
set search_path = ''
set enable_seqscan = 'off'
set enable_indexscan = 'off'
set enable_indexonlyscan = 'off'
as $$
begin
  return query execute
    'explain select 1 from public.search_terms where (term::text) operator(public.%) $1'
    using p_q;
end;
$$;

-- ===========================================================================
-- 6. Slang helper RPCs for the lib/search readers (consumed by 07-02).
--    Both are anon-callable (public reads, no PII), use public.similarity() (NOT the
--    bare `%` operator) so they resolve under search_path='', and exercise the
--    search_terms_term_trgm_idx trigram GIN index. So 07-02's expandSlang /
--    autocomplete never reach for `%`.
-- ===========================================================================
create or replace function public.match_search_term(p_raw text)
returns table (id bigint, term text)
language sql stable security invoker set search_path = '' as $FN$
  select st.id, st.term::text
  from public.search_terms st
  where public.similarity(st.term::text, p_raw) >= 0.3
  order by public.similarity(st.term::text, p_raw) desc
  limit 1;
$FN$;

create or replace function public.autocomplete_terms(p_prefix text)
returns table (term text)
language sql stable security invoker set search_path = '' as $FN$
  select st.term::text
  from public.search_terms st
  where public.similarity(st.term::text, p_prefix) >= 0.3
  order by public.similarity(st.term::text, p_prefix) desc
  limit 6;
$FN$;
