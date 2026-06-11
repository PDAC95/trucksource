-- 0018_fix_block_enforcement.sql
-- BUG FIX (caught live by tests/integration/messaging.test.ts, gate 4):
--
-- The 0016 "messages participant-insert" policy embedded the block check as a
-- plain subquery on public.user_blocks. Policy subqueries run AS THE CALLING
-- USER, and user_blocks' only SELECT policy is blocker-owned
-- ((select auth.uid()) = blocker_id) — so when the SELLER blocks the BUYER,
-- the buyer's policy evaluation cannot see the block row at all: `not exists`
-- is vacuously true and the blocked buyer can keep sending. Blocks were
-- unenforceable in exactly the direction that matters.
--
-- Fix: move the pair-block lookup into a SECURITY DEFINER helper that bypasses
-- user_blocks RLS (precedent: definer trigger/RPCs in 0015). The helper takes
-- a thread id — not raw user uuids — so an authenticated caller can at most
-- probe "does some block exist inside thread N" without learning who is in the
-- thread or who blocked whom. Visibility of user_blocks rows is unchanged:
-- still blocker-owned only (the blocked party is never shown who blocked them).
create or replace function public.thread_pair_blocked(thread bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.message_threads t
    join public.user_blocks b
      on (b.blocker_id = t.buyer_id and b.blocked_id = t.seller_id)
      or (b.blocker_id = t.seller_id and b.blocked_id = t.buyer_id)
    where t.id = thread
  );
$$;

revoke execute on function public.thread_pair_blocked(bigint) from public;
revoke execute on function public.thread_pair_blocked(bigint) from anon;
-- authenticated needs EXECUTE: RLS policies run functions as the caller.
grant execute on function public.thread_pair_blocked(bigint) to authenticated;
grant execute on function public.thread_pair_blocked(bigint) to service_role;

-- Recreate the INSERT policy with the definer-backed block check. Semantics
-- otherwise identical to 0016: self-attributed sender + thread participant,
-- block gates SENDING only (the SELECT policy — reading history — is untouched).
drop policy "messages participant-insert" on public.messages;

create policy "messages participant-insert" on public.messages
  for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and exists (
      select 1 from public.message_threads t
      where t.id = messages.thread_id
        and (select auth.uid()) in (t.buyer_id, t.seller_id)
    )
    and not public.thread_pair_blocked(messages.thread_id)
  );
