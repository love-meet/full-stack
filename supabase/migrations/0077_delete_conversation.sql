-- Delete a 1:1 chat from MY list. Implementation: remove just my row from
-- conversation_members. The conversation + messages stay for the other
-- party (so they don't suddenly lose history); my_conversations stops
-- showing this conversation because I'm no longer a member.

create or replace function public.delete_conversation_for_me(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from public.conversation_members
   where conversation_id = p_conversation_id and user_id = me;
end $$;

grant execute on function public.delete_conversation_for_me(uuid) to authenticated;
