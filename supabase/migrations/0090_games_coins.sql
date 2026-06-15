-- 0090 — Replace subscription gates with coin gates for games.
--
-- 1. create_game and join_game now cost 1 coin (unless a rewarded ad token is provided).
-- 2. _finish_match awards 1 coin to the winner(s).

-- =========================================================================
-- create_game — Drop the has_active_subscription check, add coin gate.
-- =========================================================================
create or replace function public.create_game(
  p_kind text, 
  p_max int default 2, 
  p_type text default 'pixel_rush', 
  p_reward_token text default null
)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare 
  me uuid := auth.uid(); 
  g public.games; 
  code text; 
  bal int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  
  -- Gate: 1 coin or a rewarded ad token
  if p_reward_token is null or trim(p_reward_token) = '' then
    select coalesce(coins, 0) into bal from public.profiles where id = me;
    if bal < 1 then
      raise exception 'Not enough coins to create a game. Watch an ad to play for free!';
    end if;
    perform public.apply_coins(me, -1, 'game_entry');
  end if;

  loop
    code := upper(substring(md5(random()::text) for 6));
    exit when not exists (select 1 from public.games where invite_code = code);
  end loop;

  insert into public.games (host_id, kind, game_type, max_players, invite_code, status, rounds_total)
       values (me, p_kind::public.game_kind, p_type::public.game_type,
               case when p_kind = '1v1' then 2 else greatest(2, least(50, p_max)) end,
               code, 'lobby',
               case 
                 when p_type = 'number_duel' then 11 
                 when p_type = 'draughts' then 3
                 else 9 
               end)
    returning * into g;

  insert into public.game_players (game_id, user_id, team, is_host)
       values (g.id, me, 'A', true);

  return g;
end $$;
grant execute on function public.create_game(text, int, text, text) to authenticated;

-- =========================================================================
-- join_game — Add coin gate.
-- =========================================================================
create or replace function public.join_game(
  p_code text, 
  p_guest_name text default null, 
  p_reward_token text default null
)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  g public.games;
  cnt int; team_a int; team_b int; assigned text;
  bal int;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select * into g from public.games where invite_code = upper(p_code);
  if g.id is null then raise exception 'game not found'; end if;

  if exists (select 1 from public.game_players where game_id = g.id and user_id = me) then
    return g; -- already in
  end if;
  if g.status <> 'lobby' then raise exception 'this game has already started'; end if;

  select count(*) into cnt from public.game_players where game_id = g.id;
  if cnt >= g.max_players then raise exception 'this game is full'; end if;

  -- Gate: 1 coin or a rewarded ad token
  if p_reward_token is null or trim(p_reward_token) = '' then
    select coalesce(coins, 0) into bal from public.profiles where id = me;
    if bal < 1 then
      raise exception 'Not enough coins to join. Watch an ad to play for free!';
    end if;
    perform public.apply_coins(me, -1, 'game_entry');
  end if;

  if g.kind = '1v1' then
    assigned := 'B';
  else
    select count(*) filter (where team = 'A'), count(*) filter (where team = 'B')
      into team_a, team_b from public.game_players where game_id = g.id;
    assigned := case when coalesce(team_a,0) <= coalesce(team_b,0) then 'A' else 'B' end;
  end if;

  insert into public.game_players (game_id, user_id, guest_name, team)
       values (g.id, me, nullif(trim(coalesce(p_guest_name, '')), ''), assigned);

  return g;
end $$;
grant execute on function public.join_game(text, text, text) to authenticated;

-- =========================================================================
-- _finish_match — Call award_game_win for the winner(s).
-- =========================================================================
create or replace function public._finish_match(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare 
  g public.games; 
  win_player uuid; 
  win_team text;
  team_member record;
begin
  select * into g from public.games where id = p_game_id;
  if g.id is null then return; end if;
  
  if g.kind = '1v1' then
    select user_id into win_player from public.game_players where game_id = g.id order by score desc, joined_at asc limit 1;
    update public.games set status='finished', finished_at=now(), winner_player=win_player where id = g.id;
    update public.game_players set trophies = trophies + 1 where game_id = g.id and user_id = win_player;
    
    -- Award coin
    if win_player is not null then
      perform public.award_game_win(win_player, p_game_id);
    end if;
  else
    select team into win_team from public.game_players where game_id = g.id group by team order by sum(score) desc limit 1;
    update public.games set status='finished', finished_at=now(), winner_team=win_team where id = g.id;
    update public.game_players set trophies = trophies + 1 where game_id = g.id and team = win_team;
    
    -- Award coin to all players on the winning team
    for team_member in select user_id from public.game_players where game_id = g.id and team = win_team loop
      if team_member.user_id is not null then
        perform public.award_game_win(team_member.user_id, p_game_id);
      end if;
    end loop;
  end if;
end $$;
