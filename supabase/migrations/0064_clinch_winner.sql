-- End a match as soon as the result is mathematically decided, instead of
-- always playing all 9 rounds. If the leader's score is greater than the
-- trailer's score plus the rounds still left, the trailer can't catch up even
-- by winning everything remaining — so crown the leader now.
--   e.g. best-of-9: 5:1 with 3 left → 5 > 1+3 → decided (first to 5 wins).
--        4:1 with 4 left → 4 > 1+4 is false → keep playing.
-- This runs inside _advance_game (called after each decided round), so both the
-- client auto-advance and the sweep honour it.

create or replace function public._advance_game(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  g public.games; n int; nxt int; next_turn uuid; win_player uuid; win_team text;
  remaining int; lead_score int; trail_score int;
  lead_team text; lead_team_score int; trail_team_score int;
begin
  select * into g from public.games where id = p_game_id;
  if g.id is null or g.status <> 'active' then return; end if;
  select count(*) into n from public.game_players where game_id = g.id;
  remaining := g.rounds_total - g.current_round;

  -- Early clinch — the lead can no longer be overtaken.
  if g.kind = '1v1' then
    select max(score), min(score) into lead_score, trail_score
      from public.game_players where game_id = g.id;
    if coalesce(lead_score, 0) > coalesce(trail_score, 0) + remaining then
      select user_id into win_player from public.game_players
        where game_id = g.id order by score desc, joined_at asc limit 1;
      update public.games set status='finished', finished_at=now(), winner_player=win_player
        where id = g.id;
      return;
    end if;
  else
    select team, sum(score) into lead_team, lead_team_score
      from public.game_players where game_id = g.id group by team order by sum(score) desc limit 1;
    select sum(score) into trail_team_score
      from public.game_players where game_id = g.id and team <> lead_team
      group by team order by sum(score) desc limit 1;
    if coalesce(lead_team_score, 0) > coalesce(trail_team_score, 0) + remaining then
      update public.games set status='finished', finished_at=now(), winner_team=lead_team
        where id = g.id;
      return;
    end if;
  end if;

  nxt := g.current_round + 1;

  if nxt > g.rounds_total then
    if g.kind = '1v1' then
      select user_id into win_player from public.game_players where game_id = g.id order by score desc, joined_at asc limit 1;
      update public.games set status='finished', finished_at=now(), winner_player=win_player where id = g.id;
    else
      select team into win_team from public.game_players where game_id = g.id group by team order by sum(score) desc limit 1;
      update public.games set status='finished', finished_at=now(), winner_team=win_team where id = g.id;
    end if;
    return;
  end if;

  if n > 0 then
    select user_id into next_turn from (
      select user_id, row_number() over (order by joined_at) - 1 as idx
        from public.game_players where game_id = g.id
    ) q where q.idx = ((nxt - 1) % n);
  end if;

  update public.games set current_round = nxt where id = g.id;
  insert into public.game_rounds (game_id, round_no, turn_user_id)
       values (g.id, nxt, next_turn)
  on conflict (game_id, round_no) do nothing;
end $$;
