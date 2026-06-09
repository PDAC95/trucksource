-- 0013_fitment_rules_seed.sql
-- Phase 6 — Fitment Intelligence: the SEED of inference rules for fitment_rules (0012).
-- Follows the seed.sql idiom EXACTLY:
--   - EVERY FK id is resolved by NATURAL KEY (`select`-by-name from the Phase-3 taxonomy);
--     we NEVER write a literal generated id (ids differ between a fresh local reset and
--     Staging — the #1 seed-portability bug).
--   - EVERY insert is guarded `on conflict do nothing` against the fitment_rules_uniq
--     index (0012) so the seed is re-runnable.
--   - A closing do-block RAISES if zero rules exist after the inserts, so a silent no-op
--     seed (FK lookups that resolved nothing) fails loudly.
--
-- SEED PHILOSOPHY (CONTEXT / RESEARCH Pitfall 6 — precision > recall): a deliberately
-- SPARSE, high-precision set. Two rule SHAPES are demonstrated:
--   1) Category → search term (the CONTEXT PRIMARY TRIGGER): listing a part in a part
--      category implies a slang term — e.g. a Bumper part is "Large Car" content.
--   2) Garage expansion (RESEARCH Pattern 1, the SAME table): choosing a model implies
--      its slang term — Peterbilt 359 → "359 Guys".
-- All terms/categories below ALREADY exist in seed.sql so the FK lookups resolve.

-- ===========================================================================
-- 1) CATEGORY → SEARCH TERM (the primary trigger).
-- Root part categories (parent_id is null) imply a high-signal slang term.
-- ===========================================================================

-- Bumpers → 'Large Car' (a bumper part is show-truck / large-car content).
insert into public.fitment_rules (trigger_category_id, implies_search_term_id, confidence)
select pc.id, st.id, 100
from public.part_categories pc, public.search_terms st
where pc.parent_id is null and pc.name = 'Bumpers' and st.term = 'Large Car'
on conflict do nothing;

-- Hoods & Fenders → 'Long Hood'.
insert into public.fitment_rules (trigger_category_id, implies_search_term_id, confidence)
select pc.id, st.id, 100
from public.part_categories pc, public.search_terms st
where pc.parent_id is null and pc.name = 'Hoods & Fenders' and st.term = 'Long Hood'
on conflict do nothing;

-- Hoods & Fenders → 'Wide Hood' (a second hood rule so the "Common for …" group
-- reliably shows ≥1 chip).
insert into public.fitment_rules (trigger_category_id, implies_search_term_id, confidence)
select pc.id, st.id, 100
from public.part_categories pc, public.search_terms st
where pc.parent_id is null and pc.name = 'Hoods & Fenders' and st.term = 'Wide Hood'
on conflict do nothing;

-- ===========================================================================
-- 2) GARAGE EXPANSION: model → search term (the SAME table, RESEARCH Pattern 1).
-- Peterbilt 359 → '359 Guys'. '359' is unique within Peterbilt; join the make to be safe.
-- ===========================================================================
insert into public.fitment_rules (trigger_model_id, implies_search_term_id, confidence)
select mo.id, st.id, 100
from public.models mo
join public.makes mk on mk.id = mo.make_id and mk.name = 'Peterbilt'
cross join public.search_terms st
where mo.name = '359' and st.term = '359 Guys'
on conflict do nothing;

-- ===========================================================================
-- SEED-INTEGRITY ASSERTION (REQUIRED GATE).
-- If the inserts above produced ZERO rows (every FK lookup failed silently), fail the
-- whole seed fast rather than ship an empty rules table. Mirrors seed.sql's do-block.
-- ===========================================================================
do $$
begin
  if (select count(*) from public.fitment_rules) = 0 then
    raise exception 'fitment_rules seed produced zero rows — FK lookups failed';
  end if;
end
$$;
