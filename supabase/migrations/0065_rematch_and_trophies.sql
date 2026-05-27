-- Rematch in place (no new link) + a running trophy tally.
--
-- • Each finished match awards a trophy to the winner (1v1: the winner;
--   group: every player on the winning team). The tally persists across
--   rematches so you can see "how many times each has taken the trophy".
-- • request_rematch lets a player vote to run it back on the SAME game (same
--   invite link, same players). When everyone who's still in has voted, the
--   game resets — scores back to 0, round 1, status active — keeping trophies.

alter table public.game_players add column if not exists trophies int not null default 0;
alter table public.game_players add column if not exists wants_rematch boolean not null default false;

-- _advance_game now awards a trophy whenever it finishes a match (clinch or
-- final round), via a single consolidated finish path.
create or replace function public._advance_game(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  g public.games; n int; nxt int; next_turn uuid; win_player uuid; win_team text;
  remaining int; lead_score int; trail_score int;
  lead_team text; lead_team_score int; trail_team_score int;
  clinched boolean := false;
begin
  select * into g from public.games where id = p_game_id;
  if g.id is null or g.status <> 'active' then return; end if;
  select count(*) into n from public.game_players where game_id = g.id;
  remaining := g.rounds_total - g.current_round;
  nxt := g.current_round + 1;

  -- Decide whether the match is over: an unbeatable lead (clinch) or no rounds
  -- left.
  if g.kind = '1v1' then
    select max(score), min(score) into lead_score, trail_score
      from public.game_players where game_id = g.id;
    clinched := coalesce(lead_score, 0) > coalesce(trail_score, 0) + remaining;
  else
    select team, sum(score) into lead_team, lead_team_score
      from public.game_players where game_id = g.id group by team order by sum(score) desc limit 1;
    select sum(score) into trail_team_score
      from public.game_players where game_id = g.id and team <> lead_team
      group by team order by sum(score) desc limit 1;
    clinched := coalesce(lead_team_score, 0) > coalesce(trail_team_score, 0) + remaining;
  end if;

  if clinched or nxt > g.rounds_total then
    if g.kind = '1v1' then
      select user_id into win_player from public.game_players where game_id = g.id order by score desc, joined_at asc limit 1;
      update public.games set status='finished', finished_at=now(), winner_player=win_player where id = g.id;
      update public.game_players set trophies = trophies + 1 where game_id = g.id and user_id = win_player;
    else
      select team into win_team from public.game_players where game_id = g.id group by team order by sum(score) desc limit 1;
      update public.games set status='finished', finished_at=now(), winner_team=win_team where id = g.id;
      update public.game_players set trophies = trophies + 1 where game_id = g.id and team = win_team;
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

-- Vote to rematch the same game. Sets the caller's flag; when every remaining
-- player has voted, resets the match (keeping players + trophies).
create or replace function public.request_rematch(p_game_id uuid)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid(); g public.games; total int; voted int; first_turn uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.games where id = p_game_id for update;
  if g.id is null then raise exception 'game not found'; end if;
  if g.status <> 'finished' then return g; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = me) then
    raise exception 'not a player in this game';
  end if;

  update public.game_players set wants_rematch = true where game_id = p_game_id and user_id = me;

  select count(*), count(*) filter (where wants_rematch) into total, voted
    from public.game_players where game_id = p_game_id;

  -- Everyone in agreed → run it back on the same game.
  if total >= 2 and voted >= total then
    delete from public.game_rounds where game_id = p_game_id;
    update public.game_players set score = 0, wants_rematch = false where game_id = p_game_id;

    select user_id into first_turn from public.game_players
      where game_id = p_game_id order by joined_at asc limit 1;

    update public.games
       set status='active', current_round=1, started_at=now(),
           finished_at=null, winner_player=null, winner_team=null
     where id = p_game_id returning * into g;

    insert into public.game_rounds (game_id, round_no, turn_user_id)
         values (p_game_id, 1, first_turn)
    on conflict (game_id, round_no) do nothing;
  end if;

  return g;
end $$;
grant execute on function public.request_rematch(uuid) to authenticated;
