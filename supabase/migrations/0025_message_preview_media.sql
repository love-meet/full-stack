-- Chat-list preview for media-only messages.
--
-- The conversation-list preview (conversations.last_message_preview) was
-- `substring(body for 200)`. A media-only message has a null body, so the
-- preview came back null and the UI showed the "Say hi." placeholder even
-- though a photo / video / voice note had been sent.
--
-- Now: text wins when present; otherwise describe the attachment by kind.
-- A captioned attachment shows the caption (already covered by the body
-- branch). Deleted messages still read "[deleted]".

create or replace function public.tg_update_conv_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_id uuid := coalesce(new.conversation_id, old.conversation_id);
begin
  update public.conversations c
     set last_message_at      = sub.created_at,
         last_message_preview = case
           when sub.deleted_at is not null then '[deleted]'
           when sub.body is not null and length(trim(sub.body)) > 0
             then substring(sub.body for 200)
           when sub.media_kind = 'image' then '📷 Photo'
           when sub.media_kind = 'video' then '🎥 Video'
           when sub.media_kind = 'audio' then '🎙 Voice note'
           when sub.media_url is not null then '📎 Attachment'
           else null
         end,
         last_sender_id       = sub.sender_id
    from (
      select m.created_at, m.sender_id, m.body, m.deleted_at,
             m.media_kind, m.media_url
        from public.messages m
       where m.conversation_id = conv_id
       order by m.created_at desc
       limit 1
    ) sub
   where c.id = conv_id;

  return coalesce(new, old);
end $$;

-- Backfill existing conversations whose latest message is media-only so the
-- list stops showing "Say hi." for chats that already have attachments.
update public.conversations c
   set last_message_preview = case
         when sub.deleted_at is not null then '[deleted]'
         when sub.body is not null and length(trim(sub.body)) > 0
           then substring(sub.body for 200)
         when sub.media_kind = 'image' then '📷 Photo'
         when sub.media_kind = 'video' then '🎥 Video'
         when sub.media_kind = 'audio' then '🎙 Voice note'
         when sub.media_url is not null then '📎 Attachment'
         else null
       end
  from (
    select distinct on (m.conversation_id)
           m.conversation_id, m.created_at, m.sender_id, m.body,
           m.deleted_at, m.media_kind, m.media_url
      from public.messages m
     order by m.conversation_id, m.created_at desc
  ) sub
 where c.id = sub.conversation_id;
