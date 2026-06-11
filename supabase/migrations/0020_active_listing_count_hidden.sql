-- 0020_active_listing_count_hidden.sql
-- Phase 10 plan 10-04 (ADMO-02) — close the RPC-vs-RLS drift (Pitfall 2).
--
-- The 0019 public-read policy structurally hides moderation/suspension/ban-
-- hidden rows from anon reads AND from the security-INVOKER search RPC, but
-- active_listing_count (0008) is SECURITY DEFINER: it runs as the table owner
-- and BYPASSES that policy, so a hidden-but-still-'active' listing would keep
-- inflating the public profile count. Fix: the definer body now applies the
-- same exclusion explicitly. ('draft' is already excluded by status='active'.)
--
-- NAME + SIGNATURE frozen since Phase 1 (the /u/[username] page calls it);
-- only the body changes — same rule as the 0008 rewrite itself.
create or replace function public.active_listing_count(profile_id uuid)
returns integer
language sql
stable
security definer set search_path = ''
as $$
  select count(*)::int
  from public.listings
  where seller_id = profile_id
    and status = 'active'
    and hidden_at is null;
$$;
