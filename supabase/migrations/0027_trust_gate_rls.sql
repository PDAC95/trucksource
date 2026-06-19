-- Phase 17 defense-in-depth: gate the two transaction writes at the RLS boundary.
-- The server actions (lib/actions/listings.ts, lib/actions/contact.ts) are the
-- primary gate; this closes the public-anon-key bypass (CLAUDE.md invariant #2/#3:
-- the anon key is public, so RLS is the only authorization boundary).
--
-- Only the WITH CHECK expression of each insert policy gains a verification arm;
-- the `for insert to authenticated` scope and the existing owner-scope arm are
-- preserved verbatim. The private-thread insert policy is intentionally NOT touched
-- (Pitfall 1: gating threads instead of contact_log would leave orphan contact_log
-- rows from unverified buyers).

-- listings: publishing requires a verified seller (email + phone + marketplace terms).
-- is_verified_seller is SECURITY DEFINER + granted to authenticated → callable here
-- (it bypasses the caller's RLS to read profiles_private; the policy author trusts it).
drop policy "listings owner-insert" on public.listings;
create policy "listings owner-insert" on public.listings
  for insert to authenticated
  with check (
    (select auth.uid()) = seller_id
    and public.is_verified_seller((select auth.uid()))
  );

-- contact_log: opening a contact requires a phone-verified buyer (phone ONLY —
-- buyers don't accept selling terms, so NOT is_verified_seller). Gate the FIRST
-- write of the contact flow (invariant #5) so an unverified buyer creates nothing;
-- the message_threads insert policy stays unchanged.
drop policy "contact buyer-insert" on public.contact_log;
create policy "contact buyer-insert" on public.contact_log
  for insert to authenticated
  with check (
    (select auth.uid()) = buyer_id
    and exists (
      select 1 from public.profiles_private p
      where p.id = (select auth.uid()) and p.phone_verified_at is not null
    )
  );
