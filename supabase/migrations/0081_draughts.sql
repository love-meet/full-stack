-- Draughts (English / American Checkers) — third game type alongside
-- Pixel Rush and Number Duel. 1v1, best of 3.
--
-- The match reuses the existing trophy / rematch / advance scaffolding from
-- games/game_players; only the round table is new. The server stores the
-- board state and validates the structural shape of each move (turn order,
-- piece exists, target empty, diagonal step, capture squares hold the
-- opponent). The full rules engine — forced captures, multi-jump chains,
-- king promotion, no-move stalemate detection — lives in the client. If a
-- player has no legal move they call concede_draughts_round to award the
-- round to their opponent.

do $$ begin
  alter type public.game_type add value if not exists 'draughts';
exception when others then null;
end $$;

create table if not exists public.draughts_rounds (
  game_id       uuid not null references public.games(id) on delete cascade,
  round_no      int  not null,
  board         jsonb not null default '[]'::jsonb,
  turn_user_id  uuid references public.profiles(id) on delete set null,
  status        text not null default 'playing' check (status in ('playing','done')),
  winner_player uuid references public.profiles(id) on delete set null,
  started_at    timestamptz not null default now(),
  decided_at    timestamptz,
  primary key (game_id, round_no)
);

alter table public.draughts_rounds enable row level security;
drop policy if exists "draughts_rounds_read" on public.draughts_rounds;
create policy "draughts_rounds_read" on public.draughts_rounds
  for select to authenticated using (true);

-- ── Helpers ─────────────────────────────────────────────────────────────
create or replace function public._draughts_initial_board()
returns jsonb language sql immutable as $$
  with pieces as (
    select 'r'::text as color, r, c from generate_series(0,2) r, generate_series(0,7) c where (r+c)%2 = 1
    union all
    select 'b'::text as color, r, c from generate_series(5,7) r, generate_series(0,7) c where (r+c)%2 = 1
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('r', r, 'c', c, 'color', color, 'king', false)),
    '[]'::jsonb
  )
  from pieces
$$;

create or replace function public._draughts_first_mover(p_game_id uuid, p_round int)
returns uuid language plpgsql stable as $$
declare host_id_v uuid; opp_id uuid;
begin
  select host_id into host_id_v from public.games where id = p_game_id;
  select user_id into opp_id from public.game_players
   where game_id = p_game_id and user_id <> host_id_v limit 1;
  if p_round % 2 = 0 then return opp_id; else return host_id_v; end if;
end $$;

create or replace function public._draughts_player_color(p_game_id uuid, p_user_id uuid)
returns text language plpgsql stable as $$
declare host_id_v uuid;
begin
  select host_id into host_id_v from public.games where id = p_game_id;
  return case when p_user_id = host_id_v then 'r' else 'b' end;
end $$;

-- ── Seed a draughts round on start ──────────────────────────────────────
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

  if g.game_type = 'number_duel' then
    insert into public.duel_rounds (game_id, round_no, status) values (g.id, 1, 'picking')
    on conflict do nothing;
  elsif g.game_type = 'draughts' then
    insert into public.draughts_rounds (game_id, round_no, board, turn_user_id)
         values (g.id, 1, public._draughts_initial_board(), public._draughts_first_mover(g.id, 1))
    on conflict do nothing;
  else
    insert into public.game_rounds (game_id, round_no, turn_user_id) values (g.id, 1, me)
    on conflict do nothing;
  end if;
  return g;
end $$;
grant execute on function public.start_game(uuid) to authenticated;

-- ── Submit a draughts move (one diagonal step or one jump-chain) ────────
create or replace function public.submit_draughts_move(
  p_game_id uuid,
  p_round int,
  p_from_r int, p_from_c int,
  p_to_r   int, p_to_c   int,
  p_captures jsonb       -- e.g. '[{"r":3,"c":4}]'
)
returns public.draughts_rounds
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid(); g public.games; r public.draughts_rounds;
  my_color text; opp_color text; cap_count int := 0;
  board jsonb; new_board jsonb := '[]'::jsonb; piece jsonb;
  captured_ids int[] := ARRAY[]::int[];
  i int; j int; my_idx int := -1;
  dr int; dc int; promoted boolean := false;
  cr int; cc int; found boolean;
  is_king boolean; opp_pieces_left int := 0;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null or g.status <> 'active' or g.current_round <> p_round then
    raise exception 'round not active';
  end if;
  select * into r from public.draughts_rounds
    where game_id = p_game_id and round_no = p_round for update;
  if r.round_no is null or r.status <> 'playing' then
    raise exception 'round not in play';
  end if;
  if r.turn_user_id <> me then raise exception 'not your turn'; end if;

  my_color  := public._draughts_player_color(p_game_id, me);
  opp_color := case when my_color = 'r' then 'b' else 'r' end;
  board := r.board;
  if p_captures is not null then cap_count := jsonb_array_length(p_captures); end if;

  -- 1) Source piece must exist and be mine.
  for i in 0 .. jsonb_array_length(board) - 1 loop
    piece := board -> i;
    if (piece->>'r')::int = p_from_r and (piece->>'c')::int = p_from_c then
      if piece->>'color' <> my_color then raise exception 'not your piece'; end if;
      my_idx := i;
      exit;
    end if;
  end loop;
  if my_idx < 0 then raise exception 'no piece on source square'; end if;
  is_king := coalesce((board->my_idx->>'king')::boolean, false);

  -- 2) Destination on-board and empty.
  if p_to_r < 0 or p_to_r > 7 or p_to_c < 0 or p_to_c > 7 then
    raise exception 'destination off board';
  end if;
  for i in 0 .. jsonb_array_length(board) - 1 loop
    if (board->i->>'r')::int = p_to_r and (board->i->>'c')::int = p_to_c then
      raise exception 'destination occupied';
    end if;
  end loop;

  dr := p_to_r - p_from_r;
  dc := p_to_c - p_from_c;

  -- 3) Step shape & captures.
  if cap_count = 0 then
    if abs(dr) <> 1 or abs(dc) <> 1 then raise exception 'illegal step'; end if;
    if not is_king then
      if my_color = 'r' and dr <> 1  then raise exception 'pawn must move forward'; end if;
      if my_color = 'b' and dr <> -1 then raise exception 'pawn must move forward'; end if;
    end if;
  else
    if abs(dr) <> 2 * cap_count or abs(dc) <> 2 * cap_count then
      raise exception 'capture path doesn''t add up';
    end if;
    for i in 0 .. cap_count - 1 loop
      cr := (p_captures->i->>'r')::int;
      cc := (p_captures->i->>'c')::int;
      found := false;
      for j in 0 .. jsonb_array_length(board) - 1 loop
        if (board->j->>'r')::int = cr and (board->j->>'c')::int = cc then
          if board->j->>'color' <> opp_color then
            raise exception 'captured square not an opponent piece';
          end if;
          captured_ids := array_append(captured_ids, j);
          found := true;
          exit;
        end if;
      end loop;
      if not found then raise exception 'captured square empty'; end if;
    end loop;
  end if;

  -- 4) Build the new board.
  for i in 0 .. jsonb_array_length(board) - 1 loop
    if i = my_idx then continue; end if;
    if cap_count > 0 and i = ANY(captured_ids) then continue; end if;
    new_board := new_board || (board -> i);
  end loop;
  if (my_color = 'r' and p_to_r = 7) or (my_color = 'b' and p_to_r = 0) then
    promoted := true;
  end if;
  new_board := new_board || jsonb_build_object(
    'r', p_to_r, 'c', p_to_c, 'color', my_color, 'king', is_king or promoted
  );

  -- 5) Count opponent pieces remaining.
  for i in 0 .. jsonb_array_length(new_board) - 1 loop
    if new_board->i->>'color' = opp_color then
      opp_pieces_left := opp_pieces_left + 1;
    end if;
  end loop;

  if opp_pieces_left = 0 then
    update public.draughts_rounds
       set board = new_board, status = 'done', winner_player = me, decided_at = now()
     where game_id = p_game_id and round_no = p_round
     returning * into r;
    update public.game_players set score = score + 1
      where game_id = p_game_id and user_id = me;
  else
    update public.draughts_rounds
       set board = new_board,
           turn_user_id = (
             select user_id from public.game_players
              where game_id = p_game_id and user_id <> me limit 1
           )
     where game_id = p_game_id and round_no = p_round
     returning * into r;
  end if;
  return r;
end $$;
grant execute on function public.submit_draughts_move(uuid, int, int, int, int, int, jsonb) to authenticated;

-- ── Concede the round (used when client detects "no legal move") ───────
create or replace function public.concede_draughts_round(p_game_id uuid, p_round int)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); g public.games; r public.draughts_rounds; opp uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null or g.status <> 'active' or g.current_round <> p_round then
    raise exception 'round not active';
  end if;
  select * into r from public.draughts_rounds
    where game_id = p_game_id and round_no = p_round for update;
  if r.round_no is null or r.status <> 'playing' then return; end if;
  if r.turn_user_id <> me then raise exception 'not your turn to concede'; end if;
  select user_id into opp from public.game_players
    where game_id = p_game_id and user_id <> me limit 1;
  update public.draughts_rounds
     set status='done', winner_player=opp, decided_at=now()
   where game_id = p_game_id and round_no = p_round;
  update public.game_players set score = score + 1
    where game_id = p_game_id and user_id = opp;
end $$;
grant execute on function public.concede_draughts_round(uuid, int) to authenticated;

-- ── _advance_game + request_rematch wired for draughts ─────────────────
create or replace function public._advance_game(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  g public.games; n int; nxt int; next_turn uuid;
  remaining int; lead_score int; trail_score int;
  lead_team text; lead_team_score int; trail_team_score int;
  clinched boolean := false;
begin
  select * into g from public.games where id = p_game_id;
  if g.id is null or g.status <> 'active' then return; end if;
  select count(*) into n from public.game_players where game_id = g.id;
  remaining := g.rounds_total - g.current_round;
  nxt := g.current_round + 1;

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
    perform public._finish_match(p_game_id);
    return;
  end if;

  if n > 0 and g.game_type = 'pixel_rush' then
    select user_id into next_turn from (
      select user_id, row_number() over (order by joined_at) - 1 as idx
        from public.game_players where game_id = g.id
    ) q where q.idx = ((nxt - 1) % n);
  end if;

  update public.games set current_round = nxt where id = g.id;

  if g.game_type = 'number_duel' then
    insert into public.duel_rounds (game_id, round_no, status)
         values (p_game_id, nxt, 'picking')
    on conflict (game_id, round_no) do nothing;
  elsif g.game_type = 'draughts' then
    insert into public.draughts_rounds (game_id, round_no, board, turn_user_id)
         values (p_game_id, nxt, public._draughts_initial_board(),
                 public._draughts_first_mover(p_game_id, nxt))
    on conflict (game_id, round_no) do nothing;
  else
    insert into public.game_rounds (game_id, round_no, turn_user_id)
         values (p_game_id, nxt, next_turn)
    on conflict (game_id, round_no) do nothing;
  end if;
end $$;

create or replace function public.request_rematch(p_game_id uuid)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); g public.games; total int; voted int; first_turn uuid;
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

  if total >= 2 and voted >= total then
    update public.game_players set score = 0, wants_rematch = false where game_id = p_game_id;
    select user_id into first_turn from public.game_players where game_id = p_game_id order by joined_at asc limit 1;

    update public.games
       set status='active', current_round=1, started_at=now(),
           finished_at=null, winner_player=null, winner_team=null
     where id = p_game_id returning * into g;

    if g.game_type = 'number_duel' then
      delete from public.duel_guesses where game_id = p_game_id;
      delete from public.duel_secrets where game_id = p_game_id;
      delete from public.duel_rounds   where game_id = p_game_id;
      insert into public.duel_rounds (game_id, round_no, status) values (p_game_id, 1, 'picking')
      on conflict (game_id, round_no) do nothing;
    elsif g.game_type = 'draughts' then
      delete from public.draughts_rounds where game_id = p_game_id;
      insert into public.draughts_rounds (game_id, round_no, board, turn_user_id)
           values (p_game_id, 1, public._draughts_initial_board(),
                   public._draughts_first_mover(p_game_id, 1))
      on conflict (game_id, round_no) do nothing;
    else
      delete from public.game_rounds where game_id = p_game_id;
      insert into public.game_rounds (game_id, round_no, turn_user_id) values (p_game_id, 1, first_turn)
      on conflict (game_id, round_no) do nothing;
    end if;
  end if;
  return g;
end $$;
grant execute on function public.request_rematch(uuid) to authenticated;

-- ── create_game: draughts → best of 3 ──────────────────────────────────
create or replace function public.create_game(p_kind text, p_max int default 2, p_type text default 'pixel_rush')
returns public.games
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); g public.games; code text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.has_active_subscription(me) then
    raise exception 'Games are for Premium and VIP members. Free accounts can still join any game they''re invited to.';
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
                 when p_type = 'number_duel' then 12
                 when p_type = 'draughts'    then 3
                 else 9
               end)
    returning * into g;

  insert into public.game_players (game_id, user_id, team, is_host)
       values (g.id, me, 'A', true);

  return g;
end $$;
grant execute on function public.create_game(text, int, text) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='public' and tablename='draughts_rounds') then
    alter publication supabase_realtime add table public.draughts_rounds;
  end if;
end $$;
