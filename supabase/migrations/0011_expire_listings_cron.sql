-- 0011_expire_listings_cron.sql — LIST-09 daily DB-side expiry flip.
--
-- A pg_cron job flips ONLY active-past-expiry listings to 'expired' once a day.
-- `sold` is terminal (never touched) and an already-`expired` row is terminal until
-- the seller reactivates it — the `status='active'` guard encodes exactly the
-- `shouldExpire` predicate in lib/listings/lifecycle.ts (Pitfall 3, gate c).
--
-- The notify step (~7-day near-expiry email + in-app notification) is NOT here —
-- it runs app-side via the secret-guarded Vercel Cron route /api/cron/near-expiry,
-- where the Resend client and the service-role notifications insert live (research
-- Open Q3 split: pure-SQL flip in-DB so it runs even if the app is down; the
-- branded email/notify in app code).
--
-- REQUIRES the pg_cron extension enabled on this project (Supabase Dashboard →
-- Database → Extensions → pg_cron). pg_cron jobs live in the `cron` schema.
--
-- Idempotent: re-applying unschedules any existing same-named job first so the
-- schedule/command can be safely edited and re-applied via
-- `supabase db query --linked -f supabase/migrations/0011_expire_listings_cron.sql`.

-- Drop a prior 'expire-listings' job if present so re-apply doesn't error / dup.
select cron.unschedule('expire-listings')
where exists (select 1 from cron.job where jobname = 'expire-listings');

-- Schedule the daily flip at 00:05 UTC. ONLY active-past-expiry rows flip.
select cron.schedule(
  'expire-listings',
  '5 0 * * *',
  $$ update public.listings
       set status = 'expired'
     where status = 'active' and expires_at <= now(); $$
);
