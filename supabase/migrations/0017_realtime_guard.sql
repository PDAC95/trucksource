-- 0017_realtime_guard.sql
-- TEST-SUPPORT introspection helper for the Phase-9 Privacy/RLS gate (09-04).
--
-- Why this exists: the 0016 migration's realtime delivery depends on
-- `alter publication supabase_realtime add table public.messages` (Pitfall 1 —
-- without it, Postgres Changes subscriptions connect and silently receive
-- nothing). The integration suite must re-assert that membership on every run,
-- but pg_publication_tables is a pg_catalog view PostgREST cannot expose, so a
-- definer function is the only supabase-js-reachable path to it.
--
-- Surface discipline: read-only, returns a single boolean, EXECUTE revoked
-- from public/anon/authenticated and granted ONLY to service_role — the
-- TEST-ONLY fixture client (tests/integration/_supabase.ts). No app code path
-- can or should call this.
create or replace function public.messages_realtime_published()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  );
$$;

revoke execute on function public.messages_realtime_published() from public;
revoke execute on function public.messages_realtime_published() from anon;
revoke execute on function public.messages_realtime_published() from authenticated;
grant execute on function public.messages_realtime_published() to service_role;
