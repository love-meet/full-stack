-- Auto-close (or revert) any active game that's been UNDERSTAFFED for 3 min.
--
-- The previous sweep only caught stalls in awaiting_image / picking. If an
-- opponent left via leave_game (or simply disconnected) during the racing /
-- guessing / done phases, the player count dropped to 1 but the game stayed
-- active forever — that's the "active for hours after the opp left" bug.
--
-- Fix: track when an active game became understaffed (< 2 players) via a
-- trigger, then have sweep_games auto-resolve:
--   • host still in game        → revert to lobby (existing behaviour)
--   • host also gone / empty    → close the game outright
--
-- Backfill: any currently-active game with < 2 players is marked stale
-- right now so the next sweep wipes the slate.

alter table public.games add column if not exists understaffed_since timestamptz;

-- Stamp the moment an active game's player count dips below the playable
-- threshold. Cleared when the game is back to lobby or refilled.
create or replace function public.tg_games_track_understaffed()
returns trigger language plpgsql security definer set search_path = public
as $$
declare cnt int; g_id uuid;
begin
  g_id := coalesce(new.game_id, old.game_id);
  if g_id is null then return coalesce(new, old); end if;
  select count(*) into cnt from public.game_players where game_id = g_id;
  if cnt < 2 then
    update public.games set understaffed_since = coalesce(understaffed_since, now())
     where id = g_id and status = 'active' and understaffed_since is null;
  else
    update public.games set understaffed_since = null where id = g_id;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists track_understaffed_on_player_change on public.game_players;
create trigger track_understaffed_on_player_change
  after insert or delete on public.game_players
  for each row execute function public.tg_games_track_understaffed();

-- Also clear the stamp whenever the game leaves 'active' (closed/finished/
-- reverted to lobby), so the field doesn't linger as stale state.
create or replace function public.tg_games_clear_understaffed_on_status()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status <> 'active' then new.understaffed_since := null; end if;
  return new;
end $$;

drop trigger if exists clear_understaffed_on_status on public.games;
create trigger clear_understaffed_on_status
  before update of status on public.games
  for each row execute function public.tg_games_clear_understaffed_on_status();

-- Sweep: any active game understaffed for ≥ 3 min is resolved.
create or replace function public.sweep_games()
returns void
language plpgsql security definer set search_path = public
as $$
declare r record; ic text; secret_cnt int; host_stalled boolean; host_in boolean;
begin
  -- Pixel Rush: round done → advance after 30 s.
  for r in
    select gr.game_id from public.game_rounds gr
    join public.games g on g.id = gr.game_id
    where g.status='active' and gr.round_no=g.current_round
      and gr.status='done' and gr.decided_at < now() - interval '30 seconds'
  loop perform public._advance_game(r.game_id); end loop;

  -- Number Duel: round done → advance after 30 s.
  for r in
    select dr.game_id, dr.round_no from public.duel_rounds dr
    join public.games g on g.id = dr.game_id
    where g.status='active' and dr.round_no=g.current_round
      and dr.status='done' and dr.decided_at < now() - interval '30 seconds'
  loop perform public.advance_duel(r.game_id, r.round_no); end loop;

  -- 30 s reminders to a Pixel uploader who's holding things up.
  for r in
    select gr.game_id, gr.turn_user_id
      from public.game_rounds gr
      join public.games g on g.id = gr.game_id
     where g.status='active' and gr.round_no=g.current_round
       and gr.status='awaiting_image' and gr.turn_user_id is not null
       and gr.created_at < now() - interval '30 seconds'
       and (gr.last_reminder_at is null or gr.last_reminder_at < now() - interval '30 seconds')
  loop
    select invite_code into ic from public.games where id = r.game_id;
    perform public.tg_notify(r.turn_user_id, null, 'game_waiting', null, null, ic);
    update public.game_rounds set last_reminder_at = now()
      where game_id = r.game_id and round_no = (select current_round from public.games where id = r.game_id);
  end loop;

  -- 30 s reminders to Duel players who haven't picked a secret.
  for r in
    select dr.game_id, dr.round_no, gp.user_id
      from public.duel_rounds dr
      join public.games g on g.id = dr.game_id
      join public.game_players gp on gp.game_id = dr.game_id
     where g.status='active' and dr.round_no=g.current_round
       and dr.status='picking'
       and dr.created_at < now() - interval '30 seconds'
       and (dr.last_reminder_at is null or dr.last_reminder_at < now() - interval '30 seconds')
       and not exists (select 1 from public.duel_secrets ds
                        where ds.game_id=dr.game_id and ds.round_no=dr.round_no and ds.user_id=gp.user_id)
  loop
    select invite_code into ic from public.games where id = r.game_id;
    perform public.tg_notify(r.user_id, null, 'game_waiting', null, null, ic);
  end loop;
  update public.duel_rounds set last_reminder_at = now()
    where status='picking' and created_at < now() - interval '30 seconds'
      and (last_reminder_at is null or last_reminder_at < now() - interval '30 seconds');

  -- 3-min stall on Pixel awaiting_image → revert to lobby (or finish if host).
  for r in
    select gr.game_id, gr.turn_user_id, g.host_id
      from public.game_rounds gr
      join public.games g on g.id = gr.game_id
     where g.status='active' and gr.round_no=g.current_round
       and gr.status='awaiting_image'
       and gr.created_at < now() - interval '3 minutes'
  loop
    if r.turn_user_id = r.host_id then
      update public.games set status='finished', finished_at=now() where id = r.game_id;
    else
      delete from public.game_players where game_id = r.game_id and user_id = r.turn_user_id;
      delete from public.game_rounds where game_id = r.game_id;
      update public.game_players set score = 0 where game_id = r.game_id;
      update public.games
         set status='lobby', current_round=0, started_at=null,
             winner_player=null, winner_team=null, lobby_since=now()
       where id = r.game_id;
    end if;
  end loop;

  -- 3-min stall on Duel picking → revert (or finish if host stalled).
  for r in
    select dr.game_id, dr.round_no, g.host_id
      from public.duel_rounds dr
      join public.games g on g.id = dr.game_id
     where g.status='active' and dr.round_no=g.current_round
       and dr.status='picking'
       and dr.created_at < now() - interval '3 minutes'
  loop
    select count(*) into secret_cnt from public.duel_secrets
      where game_id=r.game_id and round_no=r.round_no;
    if secret_cnt = 0 then
      update public.games set status='finished', finished_at=now() where id = r.game_id;
      continue;
    end if;
    select not exists (
      select 1 from public.duel_secrets ds
        where ds.game_id=r.game_id and ds.round_no=r.round_no and ds.user_id=r.host_id
    ) into host_stalled;
    if host_stalled then
      update public.games set status='finished', finished_at=now() where id = r.game_id;
    else
      delete from public.game_players
        where game_id = r.game_id
          and not exists (
            select 1 from public.duel_secrets ds
              where ds.game_id=r.game_id and ds.round_no=r.round_no and ds.user_id = game_players.user_id
          );
      delete from public.duel_guesses where game_id = r.game_id;
      delete from public.duel_secrets where game_id = r.game_id;
      delete from public.duel_rounds  where game_id = r.game_id;
      update public.game_players set score = 0 where game_id = r.game_id;
      update public.games
         set status='lobby', current_round=0, started_at=null,
             winner_player=null, winner_team=null, lobby_since=now()
       where id = r.game_id;
    end if;
  end loop;

  -- ── NEW: any active game understaffed for ≥ 3 min is resolved ────────
  -- The previous blocks only catch awaiting_image / picking stalls; this
  -- catches plain "the opp left and walked away" — covers racing / guessing
  -- / done where the round phase itself doesn't time out.
  for r in
    select g.id as game_id, g.host_id
      from public.games g
     where g.status = 'active'
       and g.understaffed_since is not null
       and g.understaffed_since < now() - interval '3 minutes'
  loop
    select exists (select 1 from public.game_players
                    where game_id = r.game_id and user_id = r.host_id) into host_in;
    if host_in then
      -- Host still here — revert to lobby so they can invite again.
      delete from public.game_rounds where game_id = r.game_id;
      delete from public.duel_guesses where game_id = r.game_id;
      delete from public.duel_secrets where game_id = r.game_id;
      delete from public.duel_rounds  where game_id = r.game_id;
      update public.game_players set score = 0 where game_id = r.game_id;
      update public.games
         set status='lobby', current_round=0, started_at=null,
             winner_player=null, winner_team=null,
             lobby_since=now(), understaffed_since=null
       where id = r.game_id;
    else
      -- Host is gone too — there's no one to revert FOR. Just close.
      update public.games set status='finished', finished_at=now(), understaffed_since=null
       where id = r.game_id;
    end if;
  end loop;

  -- Abandoned lobby: nobody joined in 3 min.
  update public.games
     set status='finished', finished_at=now()
   where status='lobby'
     and lobby_since < now() - interval '3 minutes'
     and (select count(*) from public.game_players gp where gp.game_id = games.id) <= 1;
end $$;

-- Backfill: every currently-active game with < 2 players is marked stale
-- right now, so the very next sweep run resolves the existing ghost game(s).
update public.games g
   set understaffed_since = now() - interval '3 minutes'
 where g.status = 'active'
   and g.understaffed_since is null
   and (select count(*) from public.game_players gp where gp.game_id = g.id) < 2;
