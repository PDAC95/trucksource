-- 0005_garage_year.sql
-- Phase 4 — My Garage: add a REQUIRED model/manufacture year to garage_trucks.
--
-- Scope addition approved at the 04-03 human-verify checkpoint: a saved truck must
-- also capture its YEAR. Year is mandatory (NOT NULL). This is a NEW migration —
-- 0004_garage.sql is already applied to Staging and must NOT be edited.
--
-- Three things change here:
--   1. add `year smallint` + a sanity CHECK (heavy-truck plausible range 1970..2027,
--      where 2027 = current year 2026 + 1).
--   2. backfill the existing rows so SET NOT NULL can land (Staging dev data: 2 rows
--      at write time; a neutral placeholder of 2000 is harmless dev data the owner
--      can edit), then SET NOT NULL.
--   3. year is now a real DISTINGUISHING attribute, so the per-user uniqueness index
--      must include it: two trucks of the same model/config but different year are
--      legitimately distinct. Drop the old `garage_trucks_uniq`
--      (user_id, model_id, coalesce(config_id,0)) and recreate it WITH year.
--
-- Privacy / RLS invariants are untouched: this only alters columns/indexes on the
-- existing owner-scoped garage_trucks table (RLS + the 4 owner policies from 0004
-- still apply); no new table, no new policy, no anon grant, no SECURITY DEFINER.

-- 1) Add the column (nullable first so existing rows don't block the ALTER).
alter table public.garage_trucks
  add column year smallint;

-- 2) Backfill any pre-existing rows (Staging dev data) to a neutral placeholder so
--    the NOT NULL can be set; new inserts always supply a real year via the form.
update public.garage_trucks
  set year = 2000
  where year is null;

-- Now enforce mandatory.
alter table public.garage_trucks
  alter column year set not null;

-- 3) Sanity CHECK: heavy-truck plausible model-year range (1970 .. current+1).
alter table public.garage_trucks
  add constraint garage_trucks_year_range
  check (year between 1970 and 2027);

-- 4) Per-user uniqueness now keys on year too — same model/config, different year
--    are distinct trucks. Drop the old index by its exact 0004 name and recreate
--    it including year (coalesce still folds the NULL-config arm).
drop index if exists public.garage_trucks_uniq;
create unique index garage_trucks_uniq
  on public.garage_trucks (user_id, model_id, coalesce(config_id, 0), year);
