-- M5 fix: messages were inserting, but conversations.last_message_at was
-- staying NULL — so after 0014 added `WHERE last_message_at IS NOT NULL`
-- to the my_conversations view, the chat disappeared from both users'
-- lists the moment a message was sent.
--
-- Root cause: `tg_update_conv_on_message` ran as SECURITY INVOKER (the
-- default). The calling role is `authenticated`, which has no UPDATE
-- policy on `public.conversations` (0006 deliberately added only INSERT
-- and SELECT policies, plus a deny-all INSERT — never an UPDATE), so RLS
-- silently denied the trigger's denormalization update.
--
-- Fix: promote the trigger function to SECURITY DEFINER. It's owned by
-- postgres (the conversations table owner), which bypasses RLS for that
-- table — exactly what we want for an internal denormalization write.
-- Then backfill any existing rows that the broken trigger missed.

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

-- Backfill: any conversation that already has messages but whose
-- `last_message_at` is stale (or null because the broken trigger never
-- got to write it) is repaired to point at its most recent message.
update public.conversations c
   set last_message_at      = sub.created_at,
       last_message_preview = case
                                when sub.deleted_at is not null then '[deleted]'
                                else substring(sub.body for 200)
                              end,
       last_sender_id       = sub.sender_id
  from (
    select distinct on (m.conversation_id)
           m.conversation_id,
           m.created_at,
           m.sender_id,
           m.body,
           m.deleted_at
      from public.messages m
     order by m.conversation_id, m.created_at desc
  ) sub
 where c.id = sub.conversation_id
   and (c.last_message_at is null or c.last_message_at < sub.created_at);
