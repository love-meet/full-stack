-- After a draughts round ends, the existing auto_advance_round RPC was a
-- dead-end: it checks game_rounds, which is empty for draughts games, so
-- it returns without calling _advance_game. The next-round seed never
-- happens and both players sit on the finished board forever.
--
-- Mirror what we did for Number Duel: a dedicated advance_draughts RPC the
-- client calls after the 3.5s "Next board starting…" pause.

create or replace function public.advance_draughts(p_game_id uuid, p_round int)
returns void
language plpgsql security definer set search_path = public
as $$
declare g public.games; r public.draughts_rounds;
begin
  -- Serialise concurrent calls.
  select * into g from public.games where id = p_game_id for update;
  if g.id is null or g.status <> 'active' then return; end if;
  if g.current_round <> p_round then return; end if;
  select * into r from public.draughts_rounds where game_id = p_game_id and round_no = p_round;
  if r.round_no is null or r.status <> 'done' then return; end if;

  perform public._advance_game(p_game_id);
end $$;
grant execute on function public.advance_draughts(uuid, int) to authenticated;
