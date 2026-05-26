-- Decide a round by the fastest ACTUAL solve time, not by which request hits
-- the server first. On a flaky connection a player who genuinely solved first
-- could lose because their request was delayed (or dropped and retried),
-- while a slower opponent's request landed first. That let the network — not
-- skill — pick the winner.
--
-- Fix: submit_solve now records the winner by lowest time_ms, and a strictly
-- faster solve OVERRIDES an already-recorded slower one (transferring the
-- point) as long as the round is still the live, current round. Combined with
-- the client-side retry, a delayed-but-faster solve corrects the result
-- instead of being thrown away.
--
-- Time is measured client-side from the synced race start (shared startedAt +
-- preview), so the two clients' times are directly comparable; arrival order
-- no longer matters.

create or replace function public.submit_solve(p_game_id uuid, p_round int, p_time_ms int)
returns public.game_rounds
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  r public.game_rounds;
  g public.games;
  my_team text;
  prev_winner uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = me) then
    raise exception 'not a player in this game';
  end if;

  select * into g from public.games where id = p_game_id;
  if g.id is null then raise exception 'game not found'; end if;

  -- Lock the round row so concurrent solves serialize cleanly.
  select * into r from public.game_rounds
    where game_id = p_game_id and round_no = p_round for update;
  if r.game_id is null then raise exception 'round not found'; end if;

  -- Only the live, current round of an active game can be (re)decided. A round
  -- the game has already advanced past is frozen — no late override.
  if g.status <> 'active' or g.current_round <> p_round then return r; end if;
  if r.status = 'awaiting_image' then return r; end if;

  if r.winner_player is not null then
    -- Same player re-submitting (e.g. a retry of a dropped request) → no-op.
    if r.winner_player = me then return r; end if;
    -- Not strictly faster than the recorded winner → recorded result stands.
    if p_time_ms >= coalesce(r.winner_time_ms, 2147483647) then return r; end if;
    -- Strictly faster: this player genuinely solved first. Take back the point
    -- from the slower previously-recorded winner before re-awarding it.
    prev_winner := r.winner_player;
    update public.game_players set score = greatest(0, score - 1)
      where game_id = p_game_id and user_id = prev_winner;
  end if;

  select team into my_team from public.game_players
    where game_id = p_game_id and user_id = me;

  update public.game_rounds
     set winner_player = me, winner_team = my_team, winner_time_ms = p_time_ms,
         status = 'done', decided_at = now()
   where game_id = p_game_id and round_no = p_round
  returning * into r;

  -- Award the point to the (new) winner — skip if they somehow already held it.
  if prev_winner is distinct from me then
    update public.game_players set score = score + 1
      where game_id = p_game_id and user_id = me;
  end if;

  return r;
end $$;
grant execute on function public.submit_solve(uuid, int, int) to authenticated;
