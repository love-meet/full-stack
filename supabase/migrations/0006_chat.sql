-- M5 — chat: 1-on-1 messaging with realtime + unread counts.
-- Run after 0005_country_name.sql.

-- =========================================================================
-- conversations
-- =========================================================================
-- Generic enough to host group chats later, but the start_dm RPC + UI assume
-- exactly two members for now. `last_*` columns are denormalized by the
-- after-insert trigger so the conversation list view stays O(conversations).

create table if not exists public.conversations (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  last_message_at       timestamptz,
  last_message_preview  text,
  last_sender_id        uuid references public.profiles(id) on delete set null
);

create index if not exists conversations_last_message_idx
  on public.conversations (last_message_at desc nulls last);

-- =========================================================================
-- conversation_members
-- =========================================================================
create table if not exists public.conversation_members (
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  user_id          uuid not null references public.profiles(id)      on delete cascade,
  joined_at        timestamptz not null default now(),
  last_read_at     timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx
  on public.conversation_members (user_id);

-- =========================================================================
-- messages
-- =========================================================================
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null references public.profiles(id)      on delete cascade,
  body             text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  created_at       timestamptz not null default now()
);

create index if not exists messages_conv_created_idx
  on public.messages (conversation_id, created_at desc);

-- =========================================================================
-- Trigger — bump conversation last_* on every new message.
-- =========================================================================
create or replace function public.tg_update_conv_on_message()
returns trigger language plpgsql as $$
begin
  update public.conversations
     set last_message_at      = new.created_at,
         last_message_preview = substring(new.body for 200),
         last_sender_id       = new.sender_id
   where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists messages_update_conv on public.messages;
create trigger messages_update_conv
  after insert on public.messages
  for each row execute function public.tg_update_conv_on_message();

-- =========================================================================
-- start_dm(other_user_id) — find existing 1-on-1 or create one.
-- =========================================================================
-- SECURITY DEFINER so it can insert into conversations + conversation_members
-- in one transaction despite RLS denying direct inserts from the client.
-- The function still verifies auth.uid() and the two-member-distinct invariant.

create or replace function public.start_dm(other_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  my_id   uuid := auth.uid();
  conv_id uuid;
begin
  if my_id is null then
    raise exception 'not authenticated';
  end if;
  if other_user_id = my_id then
    raise exception 'cannot dm yourself';
  end if;
  if not exists (select 1 from public.profiles where id = other_user_id) then
    raise exception 'recipient not found';
  end if;

  -- Existing 1-on-1?
  select c.id
    into conv_id
    from public.conversations c
   where exists (select 1 from public.conversation_members
                  where conversation_id = c.id and user_id = my_id)
     and exists (select 1 from public.conversation_members
                  where conversation_id = c.id and user_id = other_user_id)
     and (select count(*) from public.conversation_members
           where conversation_id = c.id) = 2
   limit 1;

  if conv_id is not null then return conv_id; end if;

  insert into public.conversations default values returning id into conv_id;
  insert into public.conversation_members (conversation_id, user_id)
    values (conv_id, my_id), (conv_id, other_user_id);
  return conv_id;
end $$;

grant execute on function public.start_dm(uuid) to authenticated;

-- =========================================================================
-- mark_read(conversation_id) — bump my last_read_at to now.
-- =========================================================================
create or replace function public.mark_read(conversation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare my_id uuid := auth.uid();
begin
  if my_id is null then raise exception 'not authenticated'; end if;
  update public.conversation_members
     set last_read_at = now()
   where conversation_id = mark_read.conversation_id
     and user_id = my_id;
end $$;

grant execute on function public.mark_read(uuid) to authenticated;

-- =========================================================================
-- my_conversations — single-query feed for the chat list.
-- =========================================================================
-- Returns one row per conversation the current user is in, with the other
-- member's identity, the last-message preview, and the unread count for me.

create or replace view public.my_conversations as
select
  c.id,
  c.last_message_at,
  c.last_message_preview,
  c.last_sender_id,
  me.last_read_at as my_last_read_at,
  other.user_id          as other_id,
  other.handle           as other_handle,
  other.display_name     as other_display_name,
  other.avatar_url       as other_avatar_url,
  coalesce(unread.count, 0)::int as unread_count
from public.conversations c
join public.conversation_members me
  on me.conversation_id = c.id and me.user_id = auth.uid()
left join lateral (
  select pr.id as user_id, pr.handle, pr.display_name, pr.avatar_url
    from public.conversation_members cm
    join public.profiles pr on pr.id = cm.user_id
   where cm.conversation_id = c.id and cm.user_id <> auth.uid()
   limit 1
) other on true
left join lateral (
  select count(*) as count
    from public.messages m
   where m.conversation_id = c.id
     and m.sender_id <> auth.uid()
     and m.created_at > coalesce(me.last_read_at, '1970-01-01'::timestamptz)
) unread on true;

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.conversations         enable row level security;
alter table public.conversation_members  enable row level security;
alter table public.messages              enable row level security;

-- Conversations: see one if you're a member.
drop policy if exists "conv_select_member" on public.conversations;
create policy "conv_select_member" on public.conversations
  for select to authenticated
  using (
    exists (
      select 1 from public.conversation_members
       where conversation_id = conversations.id
         and user_id = auth.uid()
    )
  );

-- Members: see members of conversations you belong to.
drop policy if exists "cmem_select_co_members" on public.conversation_members;
create policy "cmem_select_co_members" on public.conversation_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.conversation_members me
       where me.conversation_id = conversation_members.conversation_id
         and me.user_id = auth.uid()
    )
  );

-- Members: only update your OWN row (used by mark_read fallback if ever).
drop policy if exists "cmem_update_self" on public.conversation_members;
create policy "cmem_update_self" on public.conversation_members
  for update to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Messages: see messages in conversations you're a member of.
drop policy if exists "msg_select_member" on public.messages;
create policy "msg_select_member" on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversation_members
       where conversation_id = messages.conversation_id
         and user_id = auth.uid()
    )
  );

-- Messages: only insert as yourself, only into a conversation you're in.
drop policy if exists "msg_insert_member" on public.messages;
create policy "msg_insert_member" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversation_members
       where conversation_id = messages.conversation_id
         and user_id = auth.uid()
    )
  );

-- Inserts to conversations + conversation_members happen only via start_dm
-- (SECURITY DEFINER). Deny direct client inserts to both.
drop policy if exists "conv_insert_none" on public.conversations;
create policy "conv_insert_none" on public.conversations
  for insert to authenticated with check (false);

drop policy if exists "cmem_insert_none" on public.conversation_members;
create policy "cmem_insert_none" on public.conversation_members
  for insert to authenticated with check (false);

-- =========================================================================
-- Realtime
-- =========================================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.conversation_members;
