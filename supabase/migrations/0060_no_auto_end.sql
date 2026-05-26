-- Stop games from ever ending by themselves. A game now finishes ONLY when:
--   * the host clicks Close (close_game), or
--   * all rounds are completed (a win on the final round).
-- No host-leave timeout, no inactivity abandon, no upload skip-timeout, no
-- no-winner race timeout. A round runs until someone wins; a lobby/match waits
-- as long as needed for players to join or take their turn.
--
-- The only thing the sweep still does is auto-advance AFTER a round has been
-- won, if the host is idle — purely so rounds progress; it never finishes a
-- live game early.

create or replace function public.sweep_games()
returns void
language plpgsql security definer set search_path = public
as $$
declare r record;
begin
  for r in
    select gr.game_id
      from public.game_rounds gr
      join public.games g on g.id = gr.game_id
     where g.status = 'active' and gr.round_no = g.current_round
       and gr.status = 'done' and gr.decided_at is not null
       and gr.decided_at < now() - interval '30 seconds'
  loop
    perform public._advance_game(r.game_id);
  end loop;
end $$;

-- Leaving no longer auto-finishes a game (host decides when it ends). A player
-- who leaves is simply removed; the host can close if they want to stop.
create or replace function public.leave_game(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); g public.games;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null then return; end if;
  if g.host_id = me then raise exception 'the host should close the game instead'; end if;
  delete from public.game_players where game_id = p_game_id and user_id = me;
end $$;
grant execute on function public.leave_game(uuid) to authenticated;
