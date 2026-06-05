-- 0008_active_listing_count.sql
--
-- Fulfils the Phase-1 deferred promise (STATE decision: "active_listing_count
-- ships returning 0 in P1; Phase 5 rewrites only its body to count active
-- listings"). The /u/[username] public profile page already calls this via
-- rpc('active_listing_count', { profile_id }), so the NAME + SIGNATURE are frozen
-- — only the body changes.
--
-- Security posture is unchanged and load-bearing: SECURITY DEFINER + empty
-- search_path (repo convention from 0001/0002), anon-callable, returns ONLY an
-- integer (no PII) — the same anon-safe contract as is_verified_seller. The count
-- is scoped to active listings for the given seller; nothing about other sellers
-- or any private column is ever exposed.
create or replace function public.active_listing_count(profile_id uuid)
returns integer
language sql
stable
security definer set search_path = ''
as $$
  select count(*)::int
  from public.listings
  where seller_id = profile_id
    and status = 'active';
$$;

grant execute on function public.active_listing_count(uuid) to anon, authenticated;
