-- Number Duel — a second game type that reuses ALL the existing multiplayer
-- setup (lobby, invite, VS header, scoreboard, rematch, trophies, spectating,
-- live comments, ads). Only the round gameplay differs.
--
-- How a round works (1v1):
--   1. Each player secretly picks a number (any figure: 2.4, 90, …).
--   2. Once both have picked, the guessing phase begins. Each player guesses
--      the OTHER's number on a number-only keypad.
--   3. Feedback per guess: guess too high → "lower" (↓), too low → "higher"
--      (↑). First to guess the opponent's EXACT number wins the round.
--   4. Best of 12; trophy + rematch reuse the shared logic.

-- ── Game type discriminator ──────────────────────────────────────────────
do $$ begin create type public.game_type as enum ('pixel_rush','number_duel'); exception when duplicate_object then null; end $$;
alter table public.games add column if not exists game_type public.game_type not null default 'pixel_rush';

-- ── Round + secret + guess tables ────────────────────────────────────────
create table if not exists public.duel_rounds (
  game_id       uuid not null references public.games(id) on delete cascade,
  round_no      int  not null,
  status        text not null default 'picking' check (status in ('picking','guessing','done')),
  winner_player uuid references public.profiles(id) on delete set null,
  started_at    timestamptz,         -- when guessing began (both secrets in)
  decided_at    timestamptz,
  primary key (game_id, round_no)
);

create table if not exists public.duel_secrets (
  game_id  uuid not null references public.games(id) on delete cascade,
  round_no int  not null,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  secret   numeric not null,
  primary key (game_id, round_no, user_id)
);

create table if not exists public.duel_guesses (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games(id) on delete cascade,
  round_no   int  not null,
  guesser_id uuid not null references public.profiles(id) on delete cascade,
  value      numeric not null,
  feedback   text not null check (feedback in ('higher','lower','correct')),
  created_at timestamptz not null default now()
);
create index if not exists duel_guesses_round_idx on public.duel_guesses (game_id, round_no, created_at);

alter table public.duel_rounds  enable row level security;
alter table public.duel_secrets enable row level security;
alter table public.duel_guesses enable row level security;

drop policy if exists "duel_rounds_read" on public.duel_rounds;
create policy "duel_rounds_read" on public.duel_rounds for select to authenticated using (true);

-- Secrets: you see your OWN; spectators (non-players) see both; everyone sees
-- both once the round is decided. A player never sees the live opponent secret.
drop policy if exists "duel_secrets_read" on public.duel_secrets;
create policy "duel_secrets_read" on public.duel_secrets for select to authenticated using (
  user_id = auth.uid()
  or not exists (select 1 from public.game_players gp where gp.game_id = duel_secrets.game_id and gp.user_id = auth.uid())
  or exists (select 1 from public.duel_rounds dr where dr.game_id = duel_secrets.game_id and dr.round_no = duel_secrets.round_no and dr.status = 'done')
);

-- Guesses are public (the whole point is watching people close in).
drop policy if exists "duel_guesses_read" on public.duel_guesses;
create policy "duel_guesses_read" on public.duel_guesses for select to authenticated using (true);

-- ── Shared finish helper (winner by score + trophy) ──────────────────────
create or replace function public._finish_match(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare g public.games; win_player uuid; win_team text;
begin
  select * into g from public.games where id = p_game_id;
  if g.id is null then return; end if;
  if g.kind = '1v1' then
    select user_id into win_player from public.game_players where game_id = g.id order by score desc, joined_at asc limit 1;
    update public.games set status='finished', finished_at=now(), winner_player=win_player where id = g.id;
    update public.game_players set trophies = trophies + 1 where game_id = g.id and user_id = win_player;
  else
    select team into win_team from public.game_players where game_id = g.id group by team order by sum(score) desc limit 1;
    update public.games set status='finished', finished_at=now(), winner_team=win_team where id = g.id;
    update public.game_players set trophies = trophies + 1 where game_id = g.id and team = win_team;
  end if;
end $$;

-- ── create_game gains a type; number duel is best-of-12 ──────────────────
create or replace function public.create_game(p_kind text, p_max int default 2, p_type text default 'pixel_rush')
returns public.games
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); g public.games; code text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.has_active_subscription(me) then
    raise exception 'Creating games is for members — upgrade your plan.';
  end if;

  loop
    code := upper(substring(md5(random()::text) for 6));
    exit when not exists (select 1 from public.games where invite_code = code);
  end loop;

  insert into public.games (host_id, kind, game_type, max_players, invite_code, status, rounds_total)
       values (me, p_kind::public.game_kind, p_type::public.game_type,
               case when p_kind = '1v1' then 2 else greatest(2, least(50, p_max)) end,
               code, 'lobby',
               case when p_type = 'number_duel' then 12 else 9 end)
    returning * into g;

  insert into public.game_players (game_id, user_id, team, is_host)
       values (g.id, me, 'A', true);

  return g;
end $$;
grant execute on function public.create_game(text, int, text) to authenticated;

-- ── start_game seeds the right kind of round ─────────────────────────────
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
    on conflict (game_id, round_no) do nothing;
  else
    insert into public.game_rounds (game_id, round_no, turn_user_id) values (g.id, 1, me)
    on conflict (game_id, round_no) do nothing;
  end if;
  return g;
end $$;
grant execute on function public.start_game(uuid) to authenticated;

-- ── Pick your secret number for the round ────────────────────────────────
create or replace function public.set_duel_secret(p_game_id uuid, p_round int, p_secret numeric)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); g public.games; r public.duel_rounds; secret_count int; player_count int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null or g.status <> 'active' or g.current_round <> p_round then raise exception 'round not active'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = me) then
    raise exception 'not a player in this game';
  end if;
  select * into r from public.duel_rounds where game_id = p_game_id and round_no = p_round for update;
  if r.round_no is null or r.status <> 'picking' then return; end if;

  insert into public.duel_secrets (game_id, round_no, user_id, secret)
       values (p_game_id, p_round, me, p_secret)
  on conflict (game_id, round_no, user_id) do update set secret = excluded.secret;

  select count(*) into player_count from public.game_players where game_id = p_game_id;
  select count(*) into secret_count from public.duel_secrets where game_id = p_game_id and round_no = p_round;
  if secret_count >= player_count then
    update public.duel_rounds set status='guessing', started_at=now()
     where game_id = p_game_id and round_no = p_round;
  end if;
end $$;
grant execute on function public.set_duel_secret(uuid, int, numeric) to authenticated;

-- ── Guess the opponent's number; returns the feedback ────────────────────
create or replace function public.submit_duel_guess(p_game_id uuid, p_round int, p_value numeric)
returns text
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); g public.games; r public.duel_rounds; target numeric; fb text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null or g.status <> 'active' or g.current_round <> p_round then raise exception 'round not active'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = me) then
    raise exception 'not a player in this game';
  end if;
  select * into r from public.duel_rounds where game_id = p_game_id and round_no = p_round for update;
  if r.round_no is null or r.status <> 'guessing' then return 'closed'; end if;

  -- The opponent's secret (1v1: the other player).
  select secret into target from public.duel_secrets
    where game_id = p_game_id and round_no = p_round and user_id <> me limit 1;
  if target is null then return 'closed'; end if;

  if p_value = target then fb := 'correct';
  elsif p_value < target then fb := 'higher';   -- aim higher
  else fb := 'lower'; end if;

  insert into public.duel_guesses (game_id, round_no, guesser_id, value, feedback)
       values (p_game_id, p_round, me, p_value, fb);

  if fb = 'correct' then
    update public.duel_rounds set status='done', winner_player=me, decided_at=now()
     where game_id = p_game_id and round_no = p_round;
    update public.game_players set score = score + 1 where game_id = p_game_id and user_id = me;
  end if;
  return fb;
end $$;
grant execute on function public.submit_duel_guess(uuid, int, numeric) to authenticated;

-- ── Advance after a duel round is won (mirrors auto_advance_round) ────────
create or replace function public.advance_duel(p_game_id uuid, p_round int)
returns void
language plpgsql security definer set search_path = public
as $$
declare g public.games; r public.duel_rounds; remaining int; lead_score int; trail_score int;
begin
  select * into g from public.games where id = p_game_id for update;
  if g.id is null or g.status <> 'active' or g.current_round <> p_round then return; end if;
  select * into r from public.duel_rounds where game_id = p_game_id and round_no = p_round;
  if r.round_no is null or r.status <> 'done' then return; end if;

  remaining := g.rounds_total - g.current_round;
  select max(score), min(score) into lead_score, trail_score from public.game_players where game_id = g.id;

  if coalesce(lead_score,0) > coalesce(trail_score,0) + remaining or g.current_round + 1 > g.rounds_total then
    perform public._finish_match(p_game_id);
    return;
  end if;

  update public.games set current_round = g.current_round + 1 where id = g.id;
  insert into public.duel_rounds (game_id, round_no, status)
       values (p_game_id, g.current_round + 1, 'picking')
  on conflict (game_id, round_no) do nothing;
end $$;
grant execute on function public.advance_duel(uuid, int) to authenticated;

-- ── Rematch resets the right round kind ──────────────────────────────────
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
      delete from public.duel_rounds where game_id = p_game_id;
      insert into public.duel_rounds (game_id, round_no, status) values (p_game_id, 1, 'picking')
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

-- Realtime for live duel updates.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='duel_rounds') then
    alter publication supabase_realtime add table public.duel_rounds;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='duel_secrets') then
    alter publication supabase_realtime add table public.duel_secrets;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='duel_guesses') then
    alter publication supabase_realtime add table public.duel_guesses;
  end if;
end $$;
