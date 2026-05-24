-- M5 chat parity with the mobile app:
--   * Reply / quote (reply_to)
--   * Edit (edited_at)
--   * Soft-delete (deleted_at, body nulled out)
--   * Per-message read receipts (read_by uuid[])
-- Run after 0006_chat.sql.

-- =========================================================================
-- Schema additions on public.messages
-- =========================================================================
alter table public.messages
  add column if not exists reply_to   uuid references public.messages(id) on delete set null,
  add column if not exists edited_at  timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists read_by    uuid[] not null default '{}';

-- Body becomes nullable so soft-deleted rows can null it out (UI shows
-- "This message was deleted" instead of the original text).
alter table public.messages
  alter column body drop not null;

-- The original "body not empty" check predated nullable body + deletion. Drop
-- it and re-add a version that allows null body, but only when deleted.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages
  add constraint messages_body_check check (
    (deleted_at is not null and body is null)
    or (body is not null and length(trim(body)) > 0 and length(body) <= 4000)
  );

create index if not exists messages_reply_to_idx
  on public.messages (reply_to)
  where reply_to is not null;

-- =========================================================================
-- Replace the after-insert trigger so the preview stays correct after
-- edits AND soft-deletes (mobile shows "This message was deleted" in the
-- conv list when the last message is deleted; we mirror that).
-- =========================================================================
create or replace function public.tg_update_conv_on_message()
returns trigger language plpgsql as $$
declare
  conv_id uuid := coalesce(new.conversation_id, old.conversation_id);
begin
  update public.conversations c
     set last_message_at      = sub.created_at,
         last_message_preview = case
                                  when sub.deleted_at is not null then '[deleted]'
                                  else substring(sub.body for 200)
                                end,
         last_sender_id       = sub.sender_id
    from (
      select m.created_at, m.sender_id, m.body, m.deleted_at
        from public.messages m
       where m.conversation_id = conv_id
       order by m.created_at desc
       limit 1
    ) sub
   where c.id = conv_id;

  return coalesce(new, old);
end $$;

-- Fire on edit + soft-delete too so the conv list preview stays in sync.
drop trigger if exists messages_update_conv on public.messages;
create trigger messages_update_conv
  after insert or update on public.messages
  for each row execute function public.tg_update_conv_on_message();

-- =========================================================================
-- edit_message(message_id, new_body)
-- Author only. Sets edited_at. Refuses to touch deleted messages.
-- =========================================================================
create or replace function public.edit_message(message_id uuid, new_body text)
returns public.messages
language plpgsql security definer set search_path = public as $$
declare
  my_id  uuid := auth.uid();
  out_row public.messages;
begin
  if my_id is null then raise exception 'not authenticated'; end if;

  new_body := trim(new_body);
  if new_body is null or length(new_body) = 0 then
    raise exception 'body cannot be empty';
  end if;
  if length(new_body) > 4000 then
    raise exception 'body too long';
  end if;

  update public.messages
     set body      = new_body,
         edited_at = now()
   where id        = edit_message.message_id
     and sender_id = my_id
     and deleted_at is null
  returning * into out_row;

  if out_row.id is null then
    raise exception 'message not found, not yours, or deleted';
  end if;
  return out_row;
end $$;

grant execute on function public.edit_message(uuid, text) to authenticated;

-- =========================================================================
-- delete_message(message_id) — soft delete. Author only.
-- =========================================================================
create or replace function public.delete_message(message_id uuid)
returns public.messages
language plpgsql security definer set search_path = public as $$
declare
  my_id  uuid := auth.uid();
  out_row public.messages;
begin
  if my_id is null then raise exception 'not authenticated'; end if;

  update public.messages
     set body       = null,
         deleted_at = now()
   where id         = delete_message.message_id
     and sender_id  = my_id
     and deleted_at is null
  returning * into out_row;

  if out_row.id is null then
    raise exception 'message not found, not yours, or already deleted';
  end if;
  return out_row;
end $$;

grant execute on function public.delete_message(uuid) to authenticated;

-- =========================================================================
-- mark_messages_read(conversation_id)
-- Appends me to read_by[] for every message in the conv I haven't read yet
-- and that wasn't sent by me. Also bumps my conversation_members.last_read_at
-- so the existing my_conversations.unread_count stays correct.
-- =========================================================================
create or replace function public.mark_messages_read(conversation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  my_id uuid := auth.uid();
begin
  if my_id is null then raise exception 'not authenticated'; end if;

  -- Must be a member of the conv.
  if not exists (
    select 1 from public.conversation_members
     where conversation_members.conversation_id = mark_messages_read.conversation_id
       and user_id = my_id
  ) then
    raise exception 'not a member of this conversation';
  end if;

  update public.messages m
     set read_by = array_append(m.read_by, my_id)
   where m.conversation_id = mark_messages_read.conversation_id
     and m.sender_id <> my_id
     and m.deleted_at is null
     and not (my_id = any(m.read_by));

  update public.conversation_members
     set last_read_at = now()
   where conversation_members.conversation_id = mark_messages_read.conversation_id
     and user_id = my_id;
end $$;

grant execute on function public.mark_messages_read(uuid) to authenticated;

-- =========================================================================
-- Tighten the message-insert RLS so reply_to must point to a message in the
-- SAME conversation (prevents grafting a reply from another thread).
-- =========================================================================
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
    and (
      reply_to is null
      or exists (
        select 1 from public.messages r
         where r.id = messages.reply_to
           and r.conversation_id = messages.conversation_id
      )
    )
  );

-- Direct client UPDATE on messages is denied. Edits and deletes flow through
-- the RPCs above (SECURITY DEFINER). The trigger fires on UPDATE so the
-- conversation preview stays in sync.
