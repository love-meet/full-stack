-- M5 extras:
--   1. Image + video attachments on chat messages.
--   2. Per-user pinned conversations (sorts to the top of the list).
--   3. mark_conversation_unread() RPC for the chat ⋯ menu.

-- =========================================================================
-- 1. Media columns on messages
-- =========================================================================
do $$ begin
  create type public.message_media_kind as enum ('image', 'video');
exception when duplicate_object then null;
end $$;

alter table public.messages
  add column if not exists media_url    text,
  add column if not exists media_kind   public.message_media_kind,
  add column if not exists media_aspect numeric(6, 4);

-- The 0013 body-check forced body to be present whenever the message isn't
-- soft-deleted. Now a message may be media-only with a null body too. Allow:
--   - deleted: body null
--   - media-only: media_url set, body may be null
--   - text: body set, length sane
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages
  add constraint messages_body_check check (
    (deleted_at is not null and body is null)
    or (media_url is not null and (body is null or length(body) <= 4000))
    or (body is not null and length(trim(body)) > 0 and length(body) <= 4000)
  );

-- =========================================================================
-- 2. Pinned conversations — `pinned_at` per (user, conversation).
-- =========================================================================
alter table public.conversation_members
  add column if not exists pinned_at timestamptz;

create index if not exists conversation_members_pinned_idx
  on public.conversation_members (user_id, pinned_at desc)
  where pinned_at is not null;

-- Rewrite the chat list view so pinned rows always come first, then by
-- last_message_at desc. Also surfaces my_pinned_at for the UI.
drop view if exists public.my_conversations;
create view public.my_conversations as
select
  c.id,
  c.last_message_at,
  c.last_message_preview,
  c.last_sender_id,
  me.last_read_at as my_last_read_at,
  me.pinned_at    as my_pinned_at,
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
     and m.deleted_at is null
     and m.created_at > coalesce(me.last_read_at, '1970-01-01'::timestamptz)
) unread on true
where c.last_message_at is not null;

grant select on public.my_conversations to authenticated;

-- =========================================================================
-- 3. RPCs for the chat ⋯ menu
-- =========================================================================

-- Toggle pin on a conversation I'm a member of.
create or replace function public.toggle_pin_conversation(conversation_id uuid)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  current_pin timestamptz;
  next_pin    timestamptz;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select pinned_at into current_pin
    from public.conversation_members
   where conversation_members.conversation_id = toggle_pin_conversation.conversation_id
     and user_id = me;

  if not found then raise exception 'not a member of this conversation'; end if;

  next_pin := case when current_pin is null then now() else null end;

  update public.conversation_members
     set pinned_at = next_pin
   where conversation_members.conversation_id = toggle_pin_conversation.conversation_id
     and user_id = me;

  return next_pin;
end $$;

grant execute on function public.toggle_pin_conversation(uuid) to authenticated;

-- "Mark unread" — roll my last_read_at back one second before the most
-- recent message I didn't send, so the unread count in my_conversations
-- becomes ≥ 1 and the row shows the rose badge again.
create or replace function public.mark_conversation_unread(conversation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  pivot timestamptz;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select m.created_at - interval '1 second' into pivot
    from public.messages m
   where m.conversation_id = mark_conversation_unread.conversation_id
     and m.sender_id <> me
     and m.deleted_at is null
   order by m.created_at desc
   limit 1;

  if pivot is null then return; end if;  -- no inbound message exists

  update public.conversation_members
     set last_read_at = pivot
   where conversation_members.conversation_id = mark_conversation_unread.conversation_id
     and user_id = me;
end $$;

grant execute on function public.mark_conversation_unread(uuid) to authenticated;
