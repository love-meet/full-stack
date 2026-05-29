-- Game-related notifications + stall handling.
--
-- 1. game_invite      — a DM message contains a /play/CODE link
-- 2. game_join        — somebody (not the host) joined a game
-- 3. game_waiting     — periodic "your turn / pick your number" reminder
--                       to a player who's holding up the game
-- 4. sweep_games gains:
--      • abandoned-lobby cleanup (no joiner after 3 min)
--      • 30s reminder to the stalling player while they're idle
--      • 3-minute auto-forfeit + game-finish in favour of the waiter

-- ── Columns we need for staleness tracking ──────────────────────────────
alter table public.game_rounds add column if not exists created_at       timestamptz not null default now();
alter table public.game_rounds add column if not exists last_reminder_at timestamptz;
alter table public.duel_rounds add column if not exists created_at       timestamptz not null default now();
alter table public.duel_rounds add column if not exists last_reminder_at timestamptz;

-- ── 1. Invite via chat ──────────────────────────────────────────────────
create or replace function public.tg_notify_game_invite()
returns trigger language plpgsql security definer set search_path = public
as $$
declare other_id uuid; code text;
begin
  code := substring(coalesce(new.body, '') from '/play/([A-Za-z0-9]{4,16})');
  if code is null or length(code) = 0 then return new; end if;

  select cm.user_id into other_id
    from public.conversation_members cm
   where cm.conversation_id = new.conversation_id
     and cm.user_id <> new.sender_id
   limit 1;
  if other_id is null then return new; end if;

  perform public.tg_notify(other_id, new.sender_id, 'game_invite', null, null, upper(code));
  return new;
end $$;
drop trigger if exists notify_on_game_invite_message on public.messages;
create trigger notify_on_game_invite_message
  after insert on public.messages
  for each row execute function public.tg_notify_game_invite();

-- ── 2. Someone joins → notify the host ──────────────────────────────────
create or replace function public.tg_notify_game_join()
returns trigger language plpgsql security definer set search_path = public
as $$
declare g public.games;
begin
  if new.is_host then return new; end if;
  select * into g from public.games where id = new.game_id;
  if g.id is null or g.host_id is null then return new; end if;
  perform public.tg_notify(g.host_id, new.user_id, 'game_join', null, null, g.invite_code);
  return new;
end $$;
drop trigger if exists notify_on_game_join on public.game_players;
create trigger notify_on_game_join
  after insert on public.game_players
  for each row execute function public.tg_notify_game_join();

-- ── 4. Sweep: auto-advance + stall reminders + 3-min auto-forfeit ───────
create or replace function public.sweep_games()
returns void
language plpgsql security definer set search_path = public
as $$
declare r record; waiter uuid; ic text; secret_cnt int;
begin
  -- Pixel Rush: round done → auto-advance after 30s.
  for r in
    select gr.game_id
      from public.game_rounds gr
      join public.games g on g.id = gr.game_id
     where g.status = 'active' and gr.round_no = g.current_round
       and gr.status = 'done' and gr.decided_at is not null
       and gr.decided_at < now() - interval '30 seconds'
  loop perform public._advance_game(r.game_id); end loop;

  -- Number Duel: round done → auto-advance after 30s.
  for r in
    select dr.game_id, dr.round_no
      from public.duel_rounds dr
      join public.games g on g.id = dr.game_id
     where g.status = 'active' and dr.round_no = g.current_round
       and dr.status = 'done' and dr.decided_at is not null
       and dr.decided_at < now() - interval '30 seconds'
  loop perform public.advance_duel(r.game_id, r.round_no); end loop;

  -- 30s reminder to a Pixel Rush player who hasn't uploaded their picture.
  for r in
    select gr.game_id, gr.turn_user_id
      from public.game_rounds gr
      join public.games g on g.id = gr.game_id
     where g.status = 'active' and gr.round_no = g.current_round
       and gr.status = 'awaiting_image' and gr.turn_user_id is not null
       and gr.created_at < now() - interval '30 seconds'
       and (gr.last_reminder_at is null or gr.last_reminder_at < now() - interval '30 seconds')
  loop
    select invite_code into ic from public.games where id = r.game_id;
    perform public.tg_notify(r.turn_user_id, null, 'game_waiting', null, null, ic);
    update public.game_rounds set last_reminder_at = now()
      where game_id = r.game_id and round_no = (select current_round from public.games where id = r.game_id);
  end loop;

  -- 30s reminder to a Duel player who hasn't picked their secret yet.
  for r in
    select dr.game_id, dr.round_no, gp.user_id
      from public.duel_rounds dr
      join public.games g on g.id = dr.game_id
      join public.game_players gp on gp.game_id = dr.game_id
     where g.status = 'active' and dr.round_no = g.current_round
       and dr.status = 'picking'
       and dr.created_at < now() - interval '30 seconds'
       and (dr.last_reminder_at is null or dr.last_reminder_at < now() - interval '30 seconds')
       and not exists (
         select 1 from public.duel_secrets ds
          where ds.game_id = dr.game_id and ds.round_no = dr.round_no and ds.user_id = gp.user_id
       )
  loop
    select invite_code into ic from public.games where id = r.game_id;
    perform public.tg_notify(r.user_id, null, 'game_waiting', null, null, ic);
  end loop;
  update public.duel_rounds set last_reminder_at = now()
    where status = 'picking' and created_at < now() - interval '30 seconds'
      and (last_reminder_at is null or last_reminder_at < now() - interval '30 seconds');

  -- 3-minute stall → the WAITER wins and the whole match ends.
  -- Pixel awaiting_image: waiter = anyone other than the turn player.
  for r in
    select gr.game_id, gr.turn_user_id
      from public.game_rounds gr
      join public.games g on g.id = gr.game_id
     where g.status = 'active' and gr.round_no = g.current_round
       and gr.status = 'awaiting_image'
       and gr.created_at < now() - interval '3 minutes'
  loop
    select user_id into waiter from public.game_players
      where game_id = r.game_id and user_id <> r.turn_user_id limit 1;
    if waiter is null then
      update public.games set status='finished', finished_at=now() where id = r.game_id;
    else
      update public.games set status='finished', finished_at=now(), winner_player=waiter where id = r.game_id;
      update public.game_players set score = score + 1, trophies = trophies + 1
        where game_id = r.game_id and user_id = waiter;
    end if;
  end loop;

  -- Duel picking: waiter = the only player who DID submit a secret.
  for r in
    select dr.game_id, dr.round_no
      from public.duel_rounds dr
      join public.games g on g.id = dr.game_id
     where g.status = 'active' and dr.round_no = g.current_round
       and dr.status = 'picking'
       and dr.created_at < now() - interval '3 minutes'
  loop
    select count(*) into secret_cnt from public.duel_secrets
      where game_id = r.game_id and round_no = r.round_no;
    if secret_cnt = 1 then
      select user_id into waiter from public.duel_secrets
        where game_id = r.game_id and round_no = r.round_no limit 1;
      update public.games set status='finished', finished_at=now(), winner_player=waiter where id = r.game_id;
      update public.game_players set score = score + 1, trophies = trophies + 1
        where game_id = r.game_id and user_id = waiter;
    else
      update public.games set status='finished', finished_at=now() where id = r.game_id;
    end if;
  end loop;

  -- Abandoned lobby: host opened a game and nobody joined for 3 minutes.
  update public.games
     set status = 'finished', finished_at = now()
   where status = 'lobby'
     and created_at < now() - interval '3 minutes'
     and (select count(*) from public.game_players gp where gp.game_id = games.id) <= 1;
end $$;
