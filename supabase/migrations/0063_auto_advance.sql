-- Rounds should flow on their own: once a round is won the game advances
-- automatically (no host "Next round" click), and winning the final round
-- finishes the game and shows results automatically.
--
-- auto_advance_round can be called by any participant once they see a round is
-- decided. It locks the game row and only advances when the given round is the
-- current, finished round — so concurrent calls from several clients serialize
-- safely (the first advances, the rest become no-ops) and it can never advance
-- a round that's still being raced.

create or replace function public.auto_advance_round(p_game_id uuid, p_round int)
returns void
language plpgsql security definer set search_path = public
as $$
declare g public.games; r public.game_rounds;
begin
  -- Serialize concurrent auto-advance attempts for this game.
  select * into g from public.games where id = p_game_id for update;
  if g.id is null or g.status <> 'active' then return; end if;
  if g.current_round <> p_round then return; end if;

  select * into r from public.game_rounds where game_id = p_game_id and round_no = p_round;
  if r.round_no is null or r.status <> 'done' then return; end if;

  perform public._advance_game(p_game_id);
end $$;
grant execute on function public.auto_advance_round(uuid, int) to authenticated;
