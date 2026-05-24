-- Chunk C — 1:1 WebRTC calls. Schema only — SDP offers, answers, and ICE
-- candidates are exchanged over Supabase Realtime broadcast channels (not
-- DB rows), so this migration only models the call *state machine*
-- (ringing → active → ended/missed/declined) plus the RPCs that drive it.

do $$ begin
  create type public.call_kind as enum ('voice', 'video');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.call_status as enum (
    'ringing',
    'active',
    'ended',
    'missed',
    'declined'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.call_end_reason as enum (
    'normal',
    'declined',
    'missed',
    'timeout',
    'failed'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.calls (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  caller_id       uuid not null references public.profiles(id) on delete cascade,
  callee_id       uuid not null references public.profiles(id) on delete cascade,
  kind            public.call_kind not null,
  status          public.call_status not null default 'ringing',
  end_reason      public.call_end_reason,
  started_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  ended_at        timestamptz,
  check (caller_id <> callee_id)
);

create index if not exists calls_callee_status_idx
  on public.calls (callee_id, status);
create index if not exists calls_caller_status_idx
  on public.calls (caller_id, status);

-- =========================================================================
-- RPCs
-- =========================================================================

-- Place a call. Conversation is optional (callers can still ring from
-- profiles even if there's no DM thread yet). Returns the new row id.
create or replace function public.place_call(
  callee uuid,
  call_kind public.call_kind,
  conv_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if callee = me then raise exception 'cannot call yourself'; end if;

  -- Auto-end any of MY outgoing rings that never resolved — prevents
  -- piling up "ringing" rows if a previous call got abandoned.
  update public.calls
     set status = 'missed', end_reason = 'timeout', ended_at = now()
   where caller_id = me and status = 'ringing';

  insert into public.calls (caller_id, callee_id, kind, conversation_id)
       values (me, callee, call_kind, conv_id)
    returning id into new_id;

  return new_id;
end $$;

grant execute on function public.place_call(uuid, public.call_kind, uuid) to authenticated;

-- Callee accepts → status flips to active.
create or replace function public.accept_call(call_id uuid)
returns public.calls
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.calls;
begin
  if me is null then raise exception 'not authenticated'; end if;
  update public.calls
     set status = 'active', accepted_at = now()
   where id = call_id and callee_id = me and status = 'ringing'
  returning * into row;
  if row.id is null then raise exception 'call not found or not yours'; end if;
  return row;
end $$;

grant execute on function public.accept_call(uuid) to authenticated;

-- Callee declines.
create or replace function public.decline_call(call_id uuid)
returns public.calls
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.calls;
begin
  if me is null then raise exception 'not authenticated'; end if;
  update public.calls
     set status = 'declined', end_reason = 'declined', ended_at = now()
   where id = call_id and callee_id = me and status = 'ringing'
  returning * into row;
  if row.id is null then raise exception 'call not found or already over'; end if;
  return row;
end $$;

grant execute on function public.decline_call(uuid) to authenticated;

-- Either party ends an active call (or the caller cancels a ringing one).
create or replace function public.end_call(call_id uuid, reason public.call_end_reason default 'normal')
returns public.calls
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.calls;
begin
  if me is null then raise exception 'not authenticated'; end if;
  update public.calls
     set status = case when status = 'ringing' then 'missed' else 'ended' end,
         end_reason = reason,
         ended_at = now()
   where id = call_id
     and (caller_id = me or callee_id = me)
     and status in ('ringing', 'active')
  returning * into row;
  if row.id is null then raise exception 'call not found or already over'; end if;
  return row;
end $$;

grant execute on function public.end_call(uuid, public.call_end_reason) to authenticated;

-- =========================================================================
-- RLS — caller and callee see the row, nobody else.
-- =========================================================================
alter table public.calls enable row level security;

drop policy if exists "calls_self_read" on public.calls;
create policy "calls_self_read" on public.calls
  for select to authenticated
  using (caller_id = auth.uid() or callee_id = auth.uid());

-- Direct INSERT/UPDATE are not allowed; everything flows through the
-- SECURITY DEFINER RPCs above.
drop policy if exists "calls_no_client_write" on public.calls;
create policy "calls_no_client_write" on public.calls
  for insert to authenticated with check (false);

-- Realtime so the callee gets a near-instant ring without polling.
alter publication supabase_realtime add table public.calls;
