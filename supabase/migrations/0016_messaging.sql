-- 0016_messaging.sql
-- Phase 9 — Contact → Private Chat (MSG-*) schema root.
--
-- ONE migration lands the entire Phase-9 schema so every downstream plan
-- (actions, realtime UI, reporting) builds against a stable surface:
--   1. contact_log       — MSG-02/03/04 base of record. The buyer's contact-form
--                          PII (name/email/phone) lives here BY DESIGN: it is the
--                          trust record the seller is allowed to see and the
--                          admin copy of record. Buyer-write, participant-read,
--                          NO update/delete policies (immutable log — MSG-04).
--   2. message_threads   — one thread per (listing, buyer), race-proof via the
--                          unique constraint. contact_log_id is NOT NULL, which
--                          makes invariant #5 ("contact persists BEFORE chat
--                          opens") STRUCTURAL: a thread cannot exist without its
--                          contact_log row. Read/email watermarks + hide-at
--                          columns ride here (hide ≠ delete, MSG-04).
--   3. messages          — append-only chat log. NO update/delete policies — the
--                          ABSENCE of the policy IS the MSG-04 enforcement
--                          (0015 listing_comments precedent). Rows carry only
--                          auth UUIDs + text: zero PII on the realtime-published
--                          table (MSG-06) — identity resolves via profiles_public
--                          in the readers, never here.
--   4. user_blocks       — owner-managed block list. Blocks gate SENDING (the
--                          messages INSERT policy), never reading history.
--   5. reports           — MSG-07 exclusive-arc target (num_nonnulls — 0012
--                          fitment_rules precedent); one report per user per
--                          item via partial unique indexes.
--   6. profiles_private.message_email_opt_out — notification opt-out; lives on
--                          the owner-only PII table (fetched in the same
--                          service-role read as the email; no public surface).
--   7. supabase_realtime publication — REQUIRED for Postgres Changes delivery;
--                          without it subscriptions connect fine and silently
--                          receive nothing.
--
-- Invariant #2: RLS is enabled in this SAME migration for every new table.
-- Policy style (0015 lesson): inside policy subqueries, ALWAYS qualify the NEW
-- row's columns with the policy table's name (e.g. messages.thread_id) — an
-- unqualified column binds to the innermost subquery table and silently breaks
-- the check.

-- ===========================================================================
-- 1. contact_log (MSG-02/03/04)
-- ===========================================================================
create table public.contact_log (
  id bigint generated always as identity primary key,
  listing_id bigint not null references public.listings(id),
  buyer_id uuid not null references auth.users(id),
  seller_id uuid not null references auth.users(id),
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text,
  message_text text not null,
  admin_emailed_at timestamptz,  -- best-effort email outcome; the ROW is the copy of record
  created_at timestamptz not null default now()
);
-- Daily contact rate-limit head-count: count rows by buyer in the last 24h.
create index contact_log_buyer_idx on public.contact_log (buyer_id, created_at);

alter table public.contact_log enable row level security;

-- Buyer creates their own contact record (the FIRST write of the contact flow —
-- the thread insert comes after, and only inside submitContact).
create policy "contact buyer-insert" on public.contact_log
  for insert to authenticated
  with check ((select auth.uid()) = buyer_id);

-- Buyer sees their own contact submissions.
create policy "contact buyer-select" on public.contact_log
  for select to authenticated
  using ((select auth.uid()) = buyer_id);

-- Seller sees contacts addressed to them (the "initial contact context" block —
-- the ONE place the buyer's form PII is legitimately shown).
create policy "contact seller-select" on public.contact_log
  for select to authenticated
  using ((select auth.uid()) = seller_id);

-- NO update, NO delete policies: the contact record is immutable (MSG-04).
-- Admin reads via the service role (Phase 10).

-- ===========================================================================
-- 2. message_threads — one per (listing, buyer)
-- ===========================================================================
create table public.message_threads (
  id bigint generated always as identity primary key,
  listing_id bigint not null references public.listings(id),
  buyer_id uuid not null references auth.users(id),
  seller_id uuid not null references auth.users(id),
  -- NOT NULL = invariant #5 is structural: no thread without a contact record.
  contact_log_id bigint not null references public.contact_log(id),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  buyer_last_read_at timestamptz,   -- read watermarks (comments_seen_at precedent)
  seller_last_read_at timestamptz,
  buyer_emailed_at timestamptz,     -- email-throttle watermarks (1 email per thread until read)
  seller_emailed_at timestamptz,
  buyer_hidden_at timestamptz,      -- "hide from inbox" without deleting (MSG-04)
  seller_hidden_at timestamptz,
  unique (listing_id, buyer_id)     -- one-thread-per-(listing,buyer), race-proof
);
create index message_threads_buyer_idx on public.message_threads (buyer_id);
create index message_threads_seller_idx on public.message_threads (seller_id);
create index message_threads_last_message_idx on public.message_threads (last_message_at desc);

alter table public.message_threads enable row level security;

-- Participants read their threads.
create policy "threads participant-select" on public.message_threads
  for select to authenticated
  using ((select auth.uid()) in (buyer_id, seller_id));

-- Participants update their own watermarks/hidden flags (column discipline is
-- app-side; the row scope is the security boundary).
create policy "threads participant-update" on public.message_threads
  for update to authenticated
  using ((select auth.uid()) in (buyer_id, seller_id))
  with check ((select auth.uid()) in (buyer_id, seller_id));

-- Thread creation is buyer-only — it happens exclusively inside submitContact,
-- AFTER the contact_log insert (invariant #5).
create policy "threads buyer-insert" on public.message_threads
  for insert to authenticated
  with check ((select auth.uid()) = buyer_id);

-- NO delete policy: threads persist (MSG-04); hiding uses *_hidden_at.

-- ===========================================================================
-- 3. user_blocks — owner-managed; DELETE = unblock (the block table is not the
--    abuse log — messages/contact_log are). Created BEFORE messages because
--    the messages INSERT policy references it.
-- ===========================================================================
create table public.user_blocks (
  blocker_id uuid not null references auth.users(id),
  blocked_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

create policy "blocks owner-select" on public.user_blocks
  for select to authenticated using ((select auth.uid()) = blocker_id);
create policy "blocks owner-insert" on public.user_blocks
  for insert to authenticated with check ((select auth.uid()) = blocker_id);
create policy "blocks owner-delete" on public.user_blocks
  for delete to authenticated using ((select auth.uid()) = blocker_id);

-- ===========================================================================
-- 4. messages — append-only chat log (MSG-04/06)
-- ===========================================================================
create table public.messages (
  id bigint generated always as identity primary key,
  thread_id bigint not null references public.message_threads(id),
  sender_id uuid not null references auth.users(id),
  -- DB-zod lockstep: this bound MUST equal MESSAGE_MAX_LENGTH in
  -- lib/messaging/schema.ts. If one changes, change BOTH.
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages (thread_id, created_at);

alter table public.messages enable row level security;

-- SELECT: thread participant. This policy is evaluated per-change × per-
-- subscriber by Realtime (WALRUS) — keep it ONE indexed EXISTS against the
-- message_threads PK and nothing else. Blocks deliberately do NOT appear here:
-- blocking gates SENDING, never reading history (locked decision).
create policy "messages participant-select" on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.message_threads t
      where t.id = messages.thread_id
        and (select auth.uid()) in (t.buyer_id, t.seller_id)
    )
  );

-- INSERT: self-attributed sender, thread participant, and NOT blocked in either
-- direction. The block check lives HERE (single enforcement point — no app code
-- path can bypass it).
create policy "messages participant-insert" on public.messages
  for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and exists (
      select 1 from public.message_threads t
      where t.id = messages.thread_id
        and (select auth.uid()) in (t.buyer_id, t.seller_id)
        and not exists (
          select 1 from public.user_blocks b
          where (b.blocker_id = t.buyer_id and b.blocked_id = t.seller_id)
             or (b.blocker_id = t.seller_id and b.blocked_id = t.buyer_id)
        )
    )
  );

-- NO update, NO delete policies — append-only IS the MSG-04 enforcement.

-- ===========================================================================
-- 5. reports (MSG-07) — exclusive-arc target (0012 num_nonnulls precedent).
-- ===========================================================================
create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users(id),
  listing_id bigint references public.listings(id),
  -- Comments hard-DELETE (Phase 8); the report cascades with the comment, and
  -- the comment_deletion_log audit table keeps the trace of what was deleted.
  -- (on delete set null would break the exclusive-arc CHECK below.)
  comment_id bigint references public.listing_comments(id) on delete cascade,
  message_id bigint references public.messages(id),
  reason text not null check (reason in
    ('scam_fraud','harassment','spam','prohibited_item','wrong_info','other')),
  detail text,
  created_at timestamptz not null default now(),
  check (num_nonnulls(listing_id, comment_id, message_id) = 1)
);
-- One report per user per item (per target column).
create unique index reports_once_listing on public.reports (reporter_id, listing_id) where listing_id is not null;
create unique index reports_once_comment on public.reports (reporter_id, comment_id) where comment_id is not null;
create unique index reports_once_message on public.reports (reporter_id, message_id) where message_id is not null;

alter table public.reports enable row level security;

-- INSERT: self-attributed; and when reporting a MESSAGE, the reporter must be a
-- participant of that message's thread (message ids are guessable bigints —
-- without this, anyone could probe/report arbitrary private messages).
create policy "reports reporter-insert" on public.reports
  for insert to authenticated
  with check (
    (select auth.uid()) = reporter_id
    and (
      reports.message_id is null
      or exists (
        select 1
        from public.messages m
        join public.message_threads t on t.id = m.thread_id
        where m.id = reports.message_id
          and (select auth.uid()) in (t.buyer_id, t.seller_id)
      )
    )
  );

-- Reporter sees their own reports (powers the "already reported" UX).
create policy "reports reporter-select" on public.reports
  for select to authenticated
  using ((select auth.uid()) = reporter_id);

-- NO update, NO delete. Admin queue reads via the service role (Phase 10).

-- ===========================================================================
-- 6. Notification opt-out — rides on the owner-only PII table (it is read in
--    the same service-role query as the email; no public surface needs it).
-- ===========================================================================
alter table public.profiles_private
  add column message_email_opt_out boolean not null default false;

-- ===========================================================================
-- 7. Realtime publication — REQUIRED (Pitfall 1): without this, Postgres
--    Changes subscriptions connect and silently receive nothing. RLS (the
--    messages SELECT policy above) remains the delivery boundary.
-- ===========================================================================
alter publication supabase_realtime add table public.messages;
