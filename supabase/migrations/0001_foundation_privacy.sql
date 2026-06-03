-- 0001_foundation_privacy.sql
-- Phase 1 — Foundation & Privacy Model.
-- The load-bearing privacy work: privacy is a property of the SCHEMA, not of app discipline.
-- PII is physically isolated in profiles_private (owner-only RLS, no anon/public SELECT policy);
-- the public profile (profiles_public) exposes only username + derived location + member_since.
-- A security-definer trigger on auth.users populates BOTH rows atomically at signup.
-- Authored verbatim from 01-RESEARCH.md Pattern 1 (verified against Supabase docs via Context7).

-- Extensions (CLAUDE.md invariant 7 / first-migration requirement):
--   pg_trgm + unaccent for future fuzzy/accent-insensitive search;
--   citext for case-insensitive, index-backed username uniqueness.
create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists citext;

-- PUBLIC profile: world-readable, owner-writable. NO PII columns exist here.
create table public.profiles_public (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null,
  state_province text not null,
  country text not null,
  member_since timestamptz not null default now(),
  username_changed_at timestamptz,            -- enforces 30-day rename window
  constraint username_format check (username ~ '^[A-Za-z0-9]{3,20}$')
);

-- PRIVATE profile (PII): owner-only. No anon/public policy => structurally unreadable.
create table public.profiles_private (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,            -- mirror of auth email for owner convenience
  phone text not null,
  state_province text not null,   -- canonical capture; public copy is derived
  country text not null,
  street_address text,            -- not collected in P1 form, reserved for later
  postal_code text,               -- "
  terms_accepted_at timestamptz not null
);

-- RLS default-deny on BOTH tables, enabled in the SAME migration that creates them
-- (CLAUDE.md invariant 2). The anon key is public; RLS is the only authorization boundary.
alter table public.profiles_public  enable row level security;
alter table public.profiles_private enable row level security;

-- public: world read, owner write
create policy "public profiles readable"
  on public.profiles_public for select
  to anon, authenticated using (true);
create policy "owner updates own public profile"
  on public.profiles_public for update
  to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- private: owner read/update ONLY. NO select policy for anon. NO insert policy
-- needed (insert happens via the security-definer trigger, which bypasses RLS).
create policy "owner reads own PII"
  on public.profiles_private for select
  to authenticated using ((select auth.uid()) = id);
create policy "owner updates own PII"
  on public.profiles_private for update
  to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Signup trigger: runs as definer at signup; inserts BOTH rows from raw_user_meta_data
-- atomically. This is the only clean way to populate an owner-only RLS table at signup,
-- because the user has no verified session yet when the row must be created.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles_public (id, username, state_province, country)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'state_province',
    new.raw_user_meta_data ->> 'country'
  );
  insert into public.profiles_private (id, first_name, last_name, email, phone,
                                       state_province, country, terms_accepted_at)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.email,
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'state_province',
    new.raw_user_meta_data ->> 'country',
    coalesce((new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz, now())
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Username 30-day rename guard (DB-side, defense in depth). Rejects a username change
-- within 30 days of the last change; stamps username_changed_at on each successful change.
create function public.guard_username_rename()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.username <> old.username then
    if old.username_changed_at is not null
       and old.username_changed_at > now() - interval '30 days' then
      raise exception 'username can only change once every 30 days';
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_guard_username_rename
  before update on public.profiles_public
  for each row execute procedure public.guard_username_rename();

-- Active-listings count (PRIV-03): derived, never stored. Returns 0 in Phase 1 because
-- the listings table does not exist yet. Phase 5 REWRITES the body to:
--   select count(*) from public.listings
--   where seller_id = profile_id and status = 'active';
-- The profile page calls this function now so the wiring is correct once listings land.
create function public.active_listing_count(profile_id uuid)
returns int
language sql
security definer set search_path = ''
as $$
  select 0;
$$;

grant execute on function public.active_listing_count(uuid) to anon, authenticated;
