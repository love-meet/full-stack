-- Live support: user ⇄ admin chat via tickets.
--
-- A user opens a ticket (subject + first message); admins reply from the
-- admin console. Each ticket is a small chat thread. Reuses the is_admin()
-- helper from 0020 for the admin side.
--
--   support_tickets   — one row per conversation with support
--   support_messages  — the chat messages inside a ticket
--
-- Reads are RLS-gated (a user sees only their own tickets/messages; admins
-- see all). Writes go through SECURITY DEFINER RPCs so we can stamp
-- is_admin, bump the ticket, and manage status server-side.

-- =========================================================================
-- Tables
-- =========================================================================
do $$ begin
  create type public.support_status as enum ('open', 'resolved', 'closed');
exception when duplicate_object then null;
end $$;

create table if not exists public.support_tickets (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  subject              text not null,
  status               public.support_status not null default 'open',
  last_message_at      timestamptz not null default now(),
  last_message_preview text,
  last_sender_is_admin boolean not null default false,
  user_last_read_at    timestamptz,
  admin_last_read_at   timestamptz,
  created_at           timestamptz not null default now()
);

create index if not exists support_tickets_user_idx
  on public.support_tickets (user_id, last_message_at desc);
create index if not exists support_tickets_status_idx
  on public.support_tickets (status, last_message_at desc);

create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete set null,
  is_admin    boolean not null default false,
  body        text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  created_at  timestamptz not null default now()
);

create index if not exists support_messages_ticket_idx
  on public.support_messages (ticket_id, created_at asc);

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- Tickets: owner or any admin may read. No direct client writes (RPCs only).
drop policy if exists "support_tickets_read" on public.support_tickets;
create policy "support_tickets_read" on public.support_tickets
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "support_tickets_no_client_write" on public.support_tickets;
create policy "support_tickets_no_client_write" on public.support_tickets
  for insert to authenticated with check (false);

-- Messages: readable if you can see the parent ticket. Inserts via RPC only.
drop policy if exists "support_messages_read" on public.support_messages;
create policy "support_messages_read" on public.support_messages
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.support_tickets t
       where t.id = support_messages.ticket_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "support_messages_no_client_write" on public.support_messages;
create policy "support_messages_no_client_write" on public.support_messages
  for insert to authenticated with check (false);

-- =========================================================================
-- Trigger: keep the ticket's denormalized "last message" fields fresh.
-- =========================================================================
create or replace function public.tg_bump_support_ticket()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.support_tickets
     set last_message_at      = new.created_at,
         last_message_preview = substring(new.body for 160),
         last_sender_is_admin = new.is_admin
   where id = new.ticket_id;
  return new;
end $$;

drop trigger if exists support_message_bump on public.support_messages;
create trigger support_message_bump
  after insert on public.support_messages
  for each row execute function public.tg_bump_support_ticket();

-- =========================================================================
-- View: support_tickets_view — adds unread counts + the user's profile.
-- Visibility is enforced by the where-clause (owner or admin); the unread
-- subqueries are not sensitive across the two parties of a ticket.
-- =========================================================================
create or replace view public.support_tickets_view as
select
  t.id, t.user_id, t.subject, t.status,
  t.last_message_at, t.last_message_preview, t.last_sender_is_admin,
  t.user_last_read_at, t.admin_last_read_at, t.created_at,
  pr.handle        as user_handle,
  pr.display_name  as user_display_name,
  pr.avatar_url    as user_avatar_url,
  (select count(*) from public.support_messages m
     where m.ticket_id = t.id and m.is_admin = true
       and m.created_at > coalesce(t.user_last_read_at, 'epoch'::timestamptz))::int  as user_unread,
  (select count(*) from public.support_messages m
     where m.ticket_id = t.id and m.is_admin = false
       and m.created_at > coalesce(t.admin_last_read_at, 'epoch'::timestamptz))::int as admin_unread
from public.support_tickets t
join public.profiles pr on pr.id = t.user_id
where t.user_id = auth.uid() or public.is_admin();

grant select on public.support_tickets_view to authenticated;

-- =========================================================================
-- RPCs
-- =========================================================================

-- Open a new ticket with its first message.
create or replace function public.open_support_ticket(subject text, first_message text)
returns public.support_tickets
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.support_tickets;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if subject is null or length(trim(subject)) = 0 then
    raise exception 'subject is required';
  end if;
  if first_message is null or length(trim(first_message)) = 0 then
    raise exception 'message is required';
  end if;

  insert into public.support_tickets (user_id, subject, user_last_read_at)
       values (me, substring(trim(subject) for 160), now())
    returning * into row;

  insert into public.support_messages (ticket_id, sender_id, is_admin, body)
       values (row.id, me, false, trim(first_message));

  return row;
end $$;

grant execute on function public.open_support_ticket(text, text) to authenticated;

-- Send a message into an existing ticket. Admins may reply to any ticket;
-- users may only post into their own. A user's reply re-opens a
-- resolved/closed ticket so it resurfaces in the admin queue.
create or replace function public.send_support_message(ticket_id uuid, body text)
returns public.support_messages
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  admin boolean := public.is_admin();
  t public.support_tickets;
  row public.support_messages;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if body is null or length(trim(body)) = 0 then raise exception 'empty message'; end if;

  select * into t from public.support_tickets where id = ticket_id;
  if t.id is null then raise exception 'ticket not found'; end if;
  if not admin and t.user_id <> me then raise exception 'not your ticket'; end if;

  insert into public.support_messages (ticket_id, sender_id, is_admin, body)
       values (ticket_id, me, admin, trim(body))
    returning * into row;

  -- Mark the sender's own side as read up to now; reopen on a user reply.
  if admin then
    update public.support_tickets set admin_last_read_at = now() where id = ticket_id;
  else
    update public.support_tickets
       set user_last_read_at = now(),
           status = case when status in ('resolved','closed') then 'open' else status end
     where id = ticket_id;
  end if;

  return row;
end $$;

grant execute on function public.send_support_message(uuid, text) to authenticated;

-- Mark a ticket read for whichever side is calling.
create or replace function public.mark_support_read(ticket_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  admin boolean := public.is_admin();
  t public.support_tickets;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into t from public.support_tickets where id = ticket_id;
  if t.id is null then raise exception 'ticket not found'; end if;
  if not admin and t.user_id <> me then raise exception 'not your ticket'; end if;

  if admin then
    update public.support_tickets set admin_last_read_at = now() where id = ticket_id;
  else
    update public.support_tickets set user_last_read_at = now() where id = ticket_id;
  end if;
end $$;

grant execute on function public.mark_support_read(uuid) to authenticated;

-- Admin-only: change a ticket's status (resolve / close / reopen).
create or replace function public.set_support_status(ticket_id uuid, next_status text)
returns public.support_tickets
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.support_tickets;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if next_status not in ('open','resolved','closed') then
    raise exception 'invalid status';
  end if;

  update public.support_tickets
     set status = next_status::public.support_status
   where id = ticket_id
  returning * into row;
  if row.id is null then raise exception 'ticket not found'; end if;

  insert into public.admin_actions (admin_id, action, target_type, target_id, note)
       values (me, concat('support_', next_status), 'support', ticket_id, null);

  return row;
end $$;

grant execute on function public.set_support_status(uuid, text) to authenticated;

-- =========================================================================
-- Dashboard: surface the open-ticket count alongside the other counters.
-- Drop first — CREATE OR REPLACE can't insert a column mid-list (it would
-- try to rename an existing column).
-- =========================================================================
drop view if exists public.admin_dashboard;
create view public.admin_dashboard as
select
  (select count(*) from public.post_reports where status = 'open')                 as open_reports,
  (select count(*) from public.withdrawal_requests where status in ('pending','approved')) as pending_payouts,
  (select count(*) from public.deposits where status = 'pending')                  as pending_deposits,
  (select count(*) from public.user_bans where lifted_at is null
     and (expires_at is null or expires_at > now()))                               as active_bans,
  (select count(*) from public.support_tickets where status = 'open')              as open_tickets,
  (select count(*) from public.profiles where role in ('admin','super_admin'))     as admin_count,
  (select count(*) from public.profiles where onboarded_at is not null and deleted_at is null) as user_count;

grant select on public.admin_dashboard to authenticated;

-- =========================================================================
-- Realtime — guarded so re-running the script doesn't error on a table
-- that's already a member of the publication.
-- =========================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_tickets'
  ) then
    alter publication supabase_realtime add table public.support_tickets;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;
end $$;
