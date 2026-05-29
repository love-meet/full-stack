-- A mid-game stall should KICK the abandoning opponent out and revert the
-- game to its lobby, so the host can invite someone new. From there the
-- existing 3-min "abandoned lobby" cleanup closes the game if nobody joins.
--
-- (Previous 0074 behaviour: 3-min stall finished the match with the waiter
-- as winner. We're replacing that.)
--
-- Edge cases:
--   • If the HOST stalled, there's no one to revert for — just finish
--     the game (nothing prevents the lobby_since timer from re-opening it
--     anyway, and the host's the one who walked away).
--   • Lobby age is now tracked via games.lobby_since (reset when the game
--     re-enters lobby), so a long-running rematched game doesn't get
--     instantly closed when reverted.

alter table public.games add column if not exists lobby_since timestamptz default now();
-- Backfill existing rows so the sweep doesn't think they're all stale.
update public.games set lobby_since = coalesce(lobby_since, created_at) where lobby_since is null;

create or replace function public.sweep_games()
returns void
language plpgsql security definer set search_path = public
as $$
declare r record; ic text; secret_cnt int; host_stalled boolean;
begin
  -- ── Pixel Rush: round done → advance after 30 s ──────────────────────
  for r in
    select gr.game_id
      from public.game_rounds gr
      join public.games g on g.id = gr.game_id
     where g.status = 'active' and gr.round_no = g.current_round
       and gr.status = 'done' and gr.decided_at is not null
       and gr.decided_at < now() - interval '30 seconds'
  loop perform public._advance_game(r.game_id); end loop;

  -- ── Duel: round done → advance after 30 s ────────────────────────────
  for r in
    select dr.game_id, dr.round_no
      from public.duel_rounds dr
      join public.games g on g.id = dr.game_id
     where g.status = 'active' and dr.round_no = g.current_round
       and dr.status = 'done' and dr.decided_at is not null
       and dr.decided_at < now() - interval '30 seconds'
  loop perform public.advance_duel(r.game_id, r.round_no); end loop;

  -- ── 30 s reminder to a stalling Pixel uploader ───────────────────────
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

  -- ── 30 s reminder to a Duel player who hasn't picked yet ─────────────
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

  -- ── 3-min stall on Pixel awaiting_image → REVERT to lobby ────────────
  for r in
    select gr.game_id, gr.turn_user_id, g.host_id
      from public.game_rounds gr
      join public.games g on g.id = gr.game_id
     where g.status = 'active' and gr.round_no = g.current_round
       and gr.status = 'awaiting_image'
       and gr.created_at < now() - interval '3 minutes'
  loop
    if r.turn_user_id = r.host_id then
      -- Host themselves walked away; nothing to revert to. Close the game.
      update public.games set status='finished', finished_at=now() where id = r.game_id;
    else
      -- Kick the stalling non-host, wipe round state, revert to lobby.
      delete from public.game_players where game_id = r.game_id and user_id = r.turn_user_id;
      delete from public.game_rounds where game_id = r.game_id;
      update public.game_players set score = 0 where game_id = r.game_id;
      update public.games
         set status='lobby', current_round=0, started_at=null,
             winner_player=null, winner_team=null,
             lobby_since=now()
       where id = r.game_id;
    end if;
  end loop;

  -- ── 3-min stall on Duel picking → REVERT to lobby ────────────────────
  for r in
    select dr.game_id, dr.round_no, g.host_id
      from public.duel_rounds dr
      join public.games g on g.id = dr.game_id
     where g.status = 'active' and dr.round_no = g.current_round
       and dr.status = 'picking'
       and dr.created_at < now() - interval '3 minutes'
  loop
    select count(*) into secret_cnt from public.duel_secrets
      where game_id = r.game_id and round_no = r.round_no;

    if secret_cnt = 0 then
      -- Both abandoned — close.
      update public.games set status='finished', finished_at=now() where id = r.game_id;
      continue;
    end if;

    -- Did the host fail to submit?
    select not exists (
      select 1 from public.duel_secrets ds
        where ds.game_id = r.game_id and ds.round_no = r.round_no and ds.user_id = r.host_id
    ) into host_stalled;

    if host_stalled then
      update public.games set status='finished', finished_at=now() where id = r.game_id;
    else
      -- Kick everyone who didn't submit a secret.
      delete from public.game_players
        where game_id = r.game_id
          and not exists (
            select 1 from public.duel_secrets ds
              where ds.game_id = r.game_id and ds.round_no = r.round_no and ds.user_id = game_players.user_id
          );
      delete from public.duel_guesses where game_id = r.game_id;
      delete from public.duel_secrets where game_id = r.game_id;
      delete from public.duel_rounds  where game_id = r.game_id;
      update public.game_players set score = 0 where game_id = r.game_id;
      update public.games
         set status='lobby', current_round=0, started_at=null,
             winner_player=null, winner_team=null,
             lobby_since=now()
       where id = r.game_id;
    end if;
  end loop;

  -- ── Abandoned lobby: nobody joined in 3 min (uses lobby_since) ───────
  update public.games
     set status='finished', finished_at=now()
   where status='lobby'
     and lobby_since < now() - interval '3 minutes'
     and (select count(*) from public.game_players gp where gp.game_id = games.id) <= 1;
end $$;
