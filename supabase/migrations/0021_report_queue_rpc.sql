-- 0021: ADMO-03 report queue grouping RPC.
--
-- WHY A FUNCTION: the locked queue shape groups reports per TARGET — one row
-- per listing/comment/message with a counter and merged reasons. The group key
-- is an expression over the exclusive arc (coalesce of the three id columns),
-- which PostgREST cannot express as a group-by. Same posture as the 0020
-- analytics helpers: plain SQL, SECURITY INVOKER (the service role bypasses
-- RLS; nobody else can even execute it), execute revoked from public surfaces.
--
-- Grouping is per (target, status): a target whose pending reports were
-- resolved and which then accrues NEW reports shows up again in Pending as a
-- fresh group — exactly the desired re-triage behavior.

create or replace function public.admin_report_queue(
  p_status text,
  p_type text default null
)
returns table (
  target_key text,
  target_type text,
  target_id bigint,
  report_count bigint,
  reasons text[],
  first_reported timestamptz,
  last_reported timestamptz,
  last_admin_note text,
  last_resolved_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    case
      when r.listing_id is not null then 'listing:' || r.listing_id
      when r.comment_id is not null then 'comment:' || r.comment_id
      else 'message:' || r.message_id
    end as target_key,
    case
      when r.listing_id is not null then 'listing'
      when r.comment_id is not null then 'comment'
      else 'message'
    end as target_type,
    coalesce(r.listing_id, r.comment_id, r.message_id) as target_id,
    count(*) as report_count,
    array_agg(distinct r.reason) as reasons,
    min(r.created_at) as first_reported,
    max(r.created_at) as last_reported,
    -- The note written by the group resolve/dismiss action (same value on
    -- every row it touched); newest resolution wins if states ever mix.
    (array_agg(r.admin_note order by r.resolved_at desc nulls last))[1]
      as last_admin_note,
    max(r.resolved_at) as last_resolved_at
  from public.reports r
  where r.status = p_status
    and (
      p_type is null
      or (p_type = 'listing' and r.listing_id is not null)
      or (p_type = 'comment' and r.comment_id is not null)
      or (p_type = 'message' and r.message_id is not null)
    )
  group by 1, 2, 3
  order by min(r.created_at) asc;
$$;

-- Service-role only (0019/0020 posture): default PUBLIC execute is revoked so
-- anon/authenticated cannot call it through PostgREST.
revoke execute on function public.admin_report_queue(text, text)
  from public, anon, authenticated;
