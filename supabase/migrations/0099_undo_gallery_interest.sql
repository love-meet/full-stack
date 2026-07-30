-- undo_gallery_decision(target) — "unlike" someone you marked Interested in.
--
-- Until now the only way to reverse a decision was to block the person,
-- which is a much heavier action with side effects the user doesn't want.
--
-- Undoing clears three things so the state is genuinely as if you never
-- swiped:
--   1. the gallery_interests row  — drops them from your Interested tab
--   2. the gallery_views row      — puts them back in your feed (the feed
--      excludes anyone already served, so without this they'd only return
--      via the undecided-recycle pass in get_gallery_feed)
--   3. the matches row, if any    — you can't stay matched with someone you
--      just unliked; start_dm's gate then refuses NEW conversations again
--
-- Any EXISTING conversation is deliberately left intact: silently destroying
-- message history on an unlike would be far more destructive than the action
-- implies. That does mean a conversation you already opened stays reachable
-- from Messages — use block if the intent is to cut contact.
--
-- Note the match row is shared between both people, so undoing also flips
-- the other person's Interested tab from "matched" back to waiting. That's
-- accurate: there is no longer a mutual match.

create or replace function public.undo_gallery_decision(p_target_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  a  uuid;
  b  uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_target_id = me then raise exception 'cannot undo yourself'; end if;

  a := least(me, p_target_id);
  b := greatest(me, p_target_id);

  -- Serialize against tg_check_mutual_match on the same pair, so an undo
  -- racing the other person's swipe can't leave a match row behind whose
  -- backing interest row has just been deleted.
  perform pg_advisory_xact_lock(hashtextextended(a::text || ':' || b::text, 42));

  delete from public.gallery_interests
   where user_id = me and target_id = p_target_id;

  delete from public.gallery_views
   where viewer_id = me and target_id = p_target_id;

  delete from public.matches
   where user_a = a and user_b = b;
end $$;

grant execute on function public.undo_gallery_decision(uuid) to authenticated;
