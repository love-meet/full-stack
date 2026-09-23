-- 0114_withdraw_invite_declines.sql
--
-- Withdrawing a game invite recorded a win that never happened.
--
-- resign_chat_game (0094) treats an `invited` row exactly like an `active`
-- one: status='finished', winner_user_id = the other player, and a
-- 'game_round' notification whose body ('resigned') the bell never shows --
-- NotificationsScreen renders a fixed "made a move. Your turn." for every
-- game_round. So the inviter cancelling an invite nobody accepted produced a
-- zero-move row asserting the invitee won, and a bell entry telling the
-- invitee it was their turn in a game that does not exist.
--
-- Now:
--   invited + resign by the inviter   -> 'declined' (the same shape
--                                        respond_chat_game(false) writes),
--                                        no winner, one notification:
--                                        "{inviter} withdrew the invite."
--   invited + resign by the invitee   -> 'declined', no notification --
--                                        identical to tapping "No thanks".
--   active  + resign (any move_count) -> 'finished', opponent wins. An
--                                        accepted game that one side quits
--                                        is a forfeit even before the first
--                                        move; the body says which.
--
-- Bodies are phrased to follow "{actor} " because that is how the bell
-- renders game_round now (and how every play_chat_move summary was already
-- written). No new notification type: game_round already routes to the chat
-- on every client, old or new.
--
-- Status is assigned with a literal plus an explicit enum cast in two
-- separate UPDATEs rather than a CASE: a CASE over text arms silently
-- fails at call time unless cast (see respond_chat_game in 0094).
-- ==========================================================================

create or replace function public.resign_chat_game(p_game uuid)
returns public.chat_games
language plpgsql security definer set search_path = public
as $$
declare
  me       uuid := auth.uid();
  row      public.chat_games;
  opponent uuid;
  note     text;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select cg.* into row from public.chat_games cg where cg.id = p_game for update;
  if row.id is null then raise exception 'no such game'; end if;
  if row.player_a <> me and row.player_b <> me then raise exception 'not your game'; end if;
  if row.status not in ('invited', 'active') then return row; end if;

  opponent := case when row.player_a = me then row.player_b else row.player_a end;

  -- An invite nobody accepted: not a game, so not a result.
  if row.status = 'invited' then
    update public.chat_games
       set status         = 'declined'::public.chat_game_status,
           turn_user_id   = null,
           winner_user_id = null,
           is_draw        = false,
           updated_at     = now(),
           finished_at    = now()
     where id = p_game
     returning * into row;

    -- Only the inviter withdrawing tells the other side; the invitee ending
    -- an invite is a decline, and respond_chat_game(false) sends nothing.
    if row.player_a = me then
      insert into public.notifications (user_id, actor_id, type, conversation_id, body)
           values (opponent, me, 'game_round', row.conversation_id, 'withdrew the invite');
    end if;

    return row;
  end if;

  -- A live game one side quits: a forfeit, whatever the move count.
  note := case when row.move_count = 0
               then 'resigned before the first move — you win'
               else 'resigned — you win'
          end;

  update public.chat_games
     set status         = 'finished'::public.chat_game_status,
         turn_user_id   = null,
         winner_user_id = opponent,
         is_draw        = false,
         updated_at     = now(),
         finished_at    = now()
   where id = p_game
   returning * into row;

  insert into public.notifications (user_id, actor_id, type, conversation_id, body)
       values (opponent, me, 'game_round', row.conversation_id, note);

  return row;
end $$;

grant execute on function public.resign_chat_game(uuid) to authenticated;
