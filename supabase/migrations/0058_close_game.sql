-- Host can close a game. Deletes the game and (via ON DELETE CASCADE) all its
-- players and rounds, so nothing is left in the database and it drops off the
-- live feed immediately.

create or replace function public.close_game(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); g public.games;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null then return; end if;             -- already gone
  if g.host_id <> me then raise exception 'only the host can close the game'; end if;
  delete from public.games where id = p_game_id;   -- cascades to game_players + game_rounds
end $$;

grant execute on function public.close_game(uuid) to authenticated;
