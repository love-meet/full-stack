-- Hardening: let the host reassign the turn to the next player when the
-- current turn player is AFK and won't upload a picture. (Ending a stalled
-- race and rematches reuse the existing advance_round / create_game RPCs.)

create or replace function public.reassign_turn(p_game_id uuid, p_round int)
returns public.game_rounds
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid(); g public.games; r public.game_rounds;
  n int; cur_idx int; next_turn uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null then raise exception 'game not found'; end if;
  if g.host_id <> me then raise exception 'only the host can skip'; end if;

  select * into r from public.game_rounds where game_id = p_game_id and round_no = p_round;
  if r.game_id is null then raise exception 'round not found'; end if;
  if r.status <> 'awaiting_image' then raise exception 'round already started'; end if;

  select count(*) into n from public.game_players where game_id = g.id;
  if n < 2 then return r; end if;

  -- index of the current turn player in join order, then pick the next.
  select idx into cur_idx from (
    select user_id, row_number() over (order by joined_at) - 1 as idx
      from public.game_players where game_id = g.id
  ) q where q.user_id = r.turn_user_id;

  select user_id into next_turn from (
    select user_id, row_number() over (order by joined_at) - 1 as idx
      from public.game_players where game_id = g.id
  ) q where q.idx = ((coalesce(cur_idx, 0) + 1) % n);

  update public.game_rounds set turn_user_id = next_turn
   where game_id = p_game_id and round_no = p_round
  returning * into r;
  return r;
end $$;

grant execute on function public.reassign_turn(uuid, int) to authenticated;
