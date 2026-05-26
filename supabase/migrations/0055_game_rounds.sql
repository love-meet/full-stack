-- Pixel Rush — the round race + scoring.
--
-- Each round: the turn player uploads a picture; everyone races the SAME
-- scramble (clients derive the identical tile order from a shared seed of
-- game_id + round_no, so we never stream individual moves). The first to
-- restore the picture wins the round (+1 to their score). Best of N rounds
-- decides the trophy. Turn rotates through players by join order.

create table if not exists public.game_rounds (
  game_id        uuid not null references public.games(id) on delete cascade,
  round_no       int  not null,
  turn_user_id   uuid references public.profiles(id) on delete set null,
  image_url      text,
  status         text not null default 'awaiting_image'
                   check (status in ('awaiting_image','racing','done')),
  started_at     timestamptz,        -- when racing began (image set)
  winner_player  uuid references public.profiles(id) on delete set null,
  winner_team    text,
  winner_time_ms int,
  primary key (game_id, round_no)
);

alter table public.game_rounds enable row level security;
drop policy if exists "game_rounds_read" on public.game_rounds;
create policy "game_rounds_read" on public.game_rounds for select to authenticated using (true);
drop policy if exists "game_rounds_no_write" on public.game_rounds;
create policy "game_rounds_no_write" on public.game_rounds for insert to authenticated with check (false);

-- start_game now also creates round 1 (turn = host).
create or replace function public.start_game(p_game_id uuid)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); g public.games; cnt int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null then raise exception 'game not found'; end if;
  if g.host_id <> me then raise exception 'only the host can start'; end if;
  if g.status <> 'lobby' then raise exception 'game already started'; end if;
  select count(*) into cnt from public.game_players where game_id = g.id;
  if cnt < 2 then raise exception 'need at least 2 players to start'; end if;

  update public.games set status='active', current_round=1, started_at=now()
   where id = g.id returning * into g;

  insert into public.game_rounds (game_id, round_no, turn_user_id)
       values (g.id, 1, me)
  on conflict (game_id, round_no) do nothing;
  return g;
end $$;
grant execute on function public.start_game(uuid) to authenticated;

-- =========================================================================
-- set_round_image — the turn player uploads the picture and starts the race.
-- =========================================================================
create or replace function public.set_round_image(p_game_id uuid, p_round int, p_image text)
returns public.game_rounds
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); r public.game_rounds;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into r from public.game_rounds where game_id = p_game_id and round_no = p_round;
  if r.game_id is null then raise exception 'round not found'; end if;
  if r.turn_user_id <> me then raise exception 'not your turn to pick the picture'; end if;
  if r.status <> 'awaiting_image' then raise exception 'round already started'; end if;
  if coalesce(trim(p_image),'') = '' then raise exception 'image required'; end if;

  update public.game_rounds
     set image_url = p_image, status = 'racing', started_at = now()
   where game_id = p_game_id and round_no = p_round
  returning * into r;
  return r;
end $$;
grant execute on function public.set_round_image(uuid, int, text) to authenticated;

-- =========================================================================
-- submit_solve — first solver wins the round (+1 to their score).
-- =========================================================================
create or replace function public.submit_solve(p_game_id uuid, p_round int, p_time_ms int)
returns public.game_rounds
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); r public.game_rounds; my_team text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = me) then
    raise exception 'not a player in this game';
  end if;

  select * into r from public.game_rounds where game_id = p_game_id and round_no = p_round for update;
  if r.game_id is null then raise exception 'round not found'; end if;
  if r.status <> 'racing' then return r; end if;            -- already decided
  if r.winner_player is not null then return r; end if;

  select team into my_team from public.game_players where game_id = p_game_id and user_id = me;

  update public.game_rounds
     set winner_player = me, winner_team = my_team, winner_time_ms = p_time_ms, status = 'done'
   where game_id = p_game_id and round_no = p_round
  returning * into r;

  update public.game_players set score = score + 1
   where game_id = p_game_id and user_id = me;

  return r;
end $$;
grant execute on function public.submit_solve(uuid, int, int) to authenticated;

-- =========================================================================
-- advance_round — host moves to the next round, or finishes the game and
-- crowns the winner (highest score for 1v1, highest team total for group).
-- =========================================================================
create or replace function public.advance_round(p_game_id uuid)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid(); g public.games; n int; nxt int; next_turn uuid;
  win_player uuid; win_team text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null then raise exception 'game not found'; end if;
  if g.host_id <> me then raise exception 'only the host can advance'; end if;
  if g.status <> 'active' then raise exception 'game is not active'; end if;

  select count(*) into n from public.game_players where game_id = g.id;
  nxt := g.current_round + 1;

  if nxt > g.rounds_total then
    -- finish
    if g.kind = '1v1' then
      select user_id into win_player from public.game_players
        where game_id = g.id order by score desc, joined_at asc limit 1;
      update public.games set status='finished', finished_at=now(), winner_player=win_player
        where id = g.id returning * into g;
    else
      select team into win_team from public.game_players
        where game_id = g.id group by team order by sum(score) desc limit 1;
      update public.games set status='finished', finished_at=now(), winner_team=win_team
        where id = g.id returning * into g;
    end if;
    return g;
  end if;

  -- next turn player by join order, round-robin
  select user_id into next_turn from (
    select user_id, row_number() over (order by joined_at) - 1 as idx
      from public.game_players where game_id = g.id
  ) q where q.idx = ((nxt - 1) % n);

  update public.games set current_round = nxt where id = g.id returning * into g;
  insert into public.game_rounds (game_id, round_no, turn_user_id)
       values (g.id, nxt, next_turn)
  on conflict (game_id, round_no) do nothing;
  return g;
end $$;
grant execute on function public.advance_round(uuid) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_rounds') then
    alter publication supabase_realtime add table public.game_rounds;
  end if;
end $$;
