-- Pixel Rush multiplayer — lobby foundation.
--
-- A member creates a game (1v1 or group), gets an invite code/link, and others
-- join — including people WITHOUT an account, who sign in anonymously and pick
-- a display name. Group games auto-balance joiners into team A / B. The host
-- starts the game once enough players are in.
--
-- Match play (per-round image race, scoring to 20, feed spectating) builds on
-- this schema in the next migration.

do $$ begin create type public.game_kind as enum ('1v1','group'); exception when duplicate_object then null; end $$;
do $$ begin create type public.game_status as enum ('lobby','active','finished'); exception when duplicate_object then null; end $$;

create table if not exists public.games (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references public.profiles(id) on delete cascade,
  kind          public.game_kind not null,
  max_players   int not null default 2 check (max_players between 2 and 50),
  status        public.game_status not null default 'lobby',
  invite_code   text not null unique,
  current_round int not null default 0,
  rounds_total  int not null default 20,
  winner_team   text,
  winner_player uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

create index if not exists games_status_idx on public.games (status, created_at desc);

create table if not exists public.game_players (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  guest_name text,                 -- label for account-less (anonymous) joiners
  team       text,                 -- 'A' | 'B'
  is_host    bool not null default false,
  score      int  not null default 0,
  joined_at  timestamptz not null default now(),
  unique (game_id, user_id)
);

create index if not exists game_players_game_idx on public.game_players (game_id);

-- =========================================================================
-- RLS — games + players are readable by any signed-in user (lobby +
-- spectating). All writes go through the SECURITY DEFINER RPCs below.
-- =========================================================================
alter table public.games        enable row level security;
alter table public.game_players enable row level security;

drop policy if exists "games_read" on public.games;
create policy "games_read" on public.games for select to authenticated using (true);
drop policy if exists "games_no_write" on public.games;
create policy "games_no_write" on public.games for insert to authenticated with check (false);

drop policy if exists "game_players_read" on public.game_players;
create policy "game_players_read" on public.game_players for select to authenticated using (true);
drop policy if exists "game_players_no_write" on public.game_players;
create policy "game_players_no_write" on public.game_players for insert to authenticated with check (false);

-- =========================================================================
-- create_game — members only. Inserts the host as the first player (team A).
-- =========================================================================
create or replace function public.create_game(p_kind text, p_max int default 2)
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

  insert into public.games (host_id, kind, max_players, invite_code, status)
       values (me, p_kind::public.game_kind,
               case when p_kind = '1v1' then 2 else greatest(2, least(50, p_max)) end,
               code, 'lobby')
    returning * into g;

  insert into public.game_players (game_id, user_id, team, is_host)
       values (g.id, me, 'A', true);

  return g;
end $$;

grant execute on function public.create_game(text, int) to authenticated;

-- =========================================================================
-- join_game — join by code. Guests (anonymous users) pass a display name.
-- Group games balance the two teams; 1v1 puts the joiner on team B.
-- =========================================================================
create or replace function public.join_game(p_code text, p_guest_name text default null)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  g public.games;
  cnt int; team_a int; team_b int; assigned text;
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

grant execute on function public.join_game(text, text) to authenticated;

-- =========================================================================
-- start_game — host only, needs at least 2 players.
-- =========================================================================
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

  update public.games
     set status = 'active', current_round = 1, started_at = now()
   where id = g.id
  returning * into g;
  return g;
end $$;

grant execute on function public.start_game(uuid) to authenticated;

-- Realtime so the lobby + spectators update live.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='games') then
    alter publication supabase_realtime add table public.games;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_players') then
    alter publication supabase_realtime add table public.game_players;
  end if;
end $$;
