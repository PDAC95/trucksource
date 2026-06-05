-- 0007_listing_storage.sql
-- Phase 5 — listing-photos Storage bucket + storage.objects RLS.
--
-- This is invariant #4's companion: even though a Server Action runs `sharp` to strip
-- EXIF before upload, Storage RLS is the AUTHORIZATION boundary (Pitfall 4). App-level
-- auth.uid() checks are not enough — the anon key is public, so a crafted direct Storage
-- API call must be stopped at the database. The folder-scoping rule
--   (storage.foldername(name))[1] = (select auth.uid())::text
-- means an authenticated user can only write/update/delete under their OWN <uid>/ prefix
-- (covers both the pre-publish <uid>/staging/... path and any final <uid>/<listing_id>/...).
--
-- The bucket is PUBLIC: listing photos are meant to be displayed, so reads are public
-- (rendered via getPublicUrl + next/image). Writes/deletes are owner-only by folder.
--
-- Applied non-destructively to Staging via `supabase db query --linked -f`. If the bucket
-- insert lacks rights in some environment, the bucket can be created via the Storage
-- API/dashboard and ONLY the four policies applied via SQL — the policies are the
-- security line; bucket creation is idempotent (on conflict do nothing).

-- Public bucket (idempotent).
insert into
  storage.buckets (id, name, public)
values
  ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;

-- INSERT: authenticated users may upload ONLY under their own <uid>/ folder.
create policy "listing-photos owner-insert" on storage.objects for insert to authenticated
with
  check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name)) [1] = (select auth.uid())::text
  );

-- UPDATE: owner-only, same folder scoping.
create policy "listing-photos owner-update" on storage.objects
for update
  to authenticated using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name)) [1] = (select auth.uid())::text
  )
with
  check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name)) [1] = (select auth.uid())::text
  );

-- DELETE: owner-only, same folder scoping.
create policy "listing-photos owner-delete" on storage.objects for delete to authenticated using (
  bucket_id = 'listing-photos'
  and (storage.foldername(name)) [1] = (select auth.uid())::text
);

-- SELECT: public read (photos are meant to be displayed). Read-only for anon.
create policy "listing-photos public-read" on storage.objects for
select
  to anon,
  authenticated using (bucket_id = 'listing-photos');
