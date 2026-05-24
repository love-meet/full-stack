-- M5 fixes:
--   1. "infinite recursion detected in policy for relation conversation_members"
--      The 0006 SELECT policy on conversation_members ORs in
--      `exists(select 1 from conversation_members where conversation_id = ... )`
--      and that subquery re-applies the same policy, which forces Postgres
--      to evaluate the OR branch on itself — infinite loop. The classic fix
--      is to move the membership check into a SECURITY DEFINER helper, which
--      bypasses RLS so the inner read can't recurse.
--   2. Conversations created via `start_dm` shouldn't appear in either user's
--      chat list until the first message has actually been sent — mirrors
--      the mobile app's behavior.

-- =========================================================================
-- 1. SECURITY DEFINER helper — answers "is auth.uid() a member of conv X?"
-- =========================================================================
create or replace function public.is_member_of(conv_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
     where conversation_id = conv_id
       and user_id = auth.uid()
  )
$$;

grant execute on function public.is_member_of(uuid) to authenticated;

-- =========================================================================
-- 2. Rewrite the recursive policies to call is_member_of() instead of
--    re-querying conversation_members from inside conversation_members'
--    own RLS policy.
-- =========================================================================
drop policy if exists "cmem_select_co_members" on public.conversation_members;
create policy "cmem_select_co_members" on public.conversation_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_member_of(conversation_id)
  );

drop policy if exists "conv_select_member" on public.conversations;
create policy "conv_select_member" on public.conversations
  for select to authenticated
  using (public.is_member_of(id));

drop policy if exists "msg_select_member" on public.messages;
create policy "msg_select_member" on public.messages
  for select to authenticated
  using (public.is_member_of(conversation_id));

-- Insert policy keeps the reply_to/same-conversation check from 0013.
drop policy if exists "msg_insert_member" on public.messages;
create policy "msg_insert_member" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_member_of(conversation_id)
    and (
      reply_to is null
      or exists (
        select 1 from public.messages r
         where r.id = messages.reply_to
           and r.conversation_id = messages.conversation_id
      )
    )
  );

-- =========================================================================
-- 3. Hide empty conversations from the chat list.
--    Drop + recreate the view (you can't change a view's column shape with
--    CREATE OR REPLACE in Postgres). The only change is the trailing
--    `where c.last_message_at is not null`.
-- =========================================================================
drop view if exists public.my_conversations;
create view public.my_conversations as
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
     and m.deleted_at is null
     and m.created_at > coalesce(me.last_read_at, '1970-01-01'::timestamptz)
) unread on true
where c.last_message_at is not null;
