-- Safety net so a Pixel Rush match never stalls — even if the host or all
-- players go AFK. A per-minute pg_cron sweep:
--   * skips a turn player who won't upload (then ends the round if everyone
--     has been skipped),
--   * ends a race that's run too long with no winner,
--   * auto-advances a finished round when the host doesn't click Next,
--   * abandons games with no activity for 15 minutes.

-- Timestamps to measure staleness.
alter table public.game_rounds
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists decided_at timestamptz,
  add column if not exists skips int not null default 0;

-- submit_solve: stamp decided_at when a round is won.
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
  if r.status <> 'racing' or r.winner_player is not null then return r; end if;

  select team into my_team from public.game_players where game_id = p_game_id and user_id = me;
  update public.game_rounds
     set winner_player = me, winner_team = my_team, winner_time_ms = p_time_ms,
         status = 'done', decided_at = now()
   where game_id = p_game_id and round_no = p_round
  returning * into r;
  update public.game_players set score = score + 1 where game_id = p_game_id and user_id = me;
  return r;
end $$;
grant execute on function public.submit_solve(uuid, int, int) to authenticated;

-- Internal advance/finish (no host check) — shared by advance_round + sweep.
create or replace function public._advance_game(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare g public.games; n int; nxt int; next_turn uuid; win_player uuid; win_team text;
begin
  select * into g from public.games where id = p_game_id;
  if g.id is null or g.status <> 'active' then return; end if;
  select count(*) into n from public.game_players where game_id = g.id;
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

-- advance_round: host-gated wrapper around _advance_game.
create or replace function public.advance_round(p_game_id uuid)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); g public.games;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null then raise exception 'game not found'; end if;
  if g.host_id <> me then raise exception 'only the host can advance'; end if;
  if g.status <> 'active' then raise exception 'game is not active'; end if;

  perform public._advance_game(p_game_id);
  select * into g from public.games where id = p_game_id;
  return g;
end $$;
grant execute on function public.advance_round(uuid) to authenticated;

-- The sweep.
create or replace function public.sweep_games()
returns void
language plpgsql security definer set search_path = public
as $$
declare r record; np int; nextp uuid; cur_idx int;
begin
  -- 1) Turn player hasn't uploaded in 60s → skip to next; once everyone has
  --    been skipped, end the round.
  for r in
    select gr.game_id, gr.round_no, gr.turn_user_id, gr.skips
      from public.game_rounds gr
      join public.games g on g.id = gr.game_id
     where g.status = 'active' and gr.round_no = g.current_round
       and gr.status = 'awaiting_image'
       and gr.created_at < now() - interval '60 seconds'
  loop
    select count(*) into np from public.game_players where game_id = r.game_id;
    if r.skips < np then
      select idx into cur_idx from (
        select user_id, row_number() over (order by joined_at) - 1 as idx
          from public.game_players where game_id = r.game_id
      ) q where q.user_id = r.turn_user_id;
      select user_id into nextp from (
        select user_id, row_number() over (order by joined_at) - 1 as idx
          from public.game_players where game_id = r.game_id
      ) q where q.idx = ((coalesce(cur_idx, 0) + 1) % greatest(np, 1));
      update public.game_rounds
         set turn_user_id = nextp, skips = skips + 1, created_at = now()
       where game_id = r.game_id and round_no = r.round_no;
    else
      perform public._advance_game(r.game_id);
    end if;
  end loop;

  -- 2) Race running 120s with no winner → end the round (no winner).
  update public.game_rounds gr
     set status = 'done', decided_at = now()
    from public.games g
   where g.id = gr.game_id and g.status = 'active' and gr.round_no = g.current_round
     and gr.status = 'racing' and gr.winner_player is null
     and gr.started_at < now() - interval '120 seconds';

  -- 3) Round decided but host idle 30s → auto-advance.
  for r in
    select gr.game_id
      from public.game_rounds gr
      join public.games g on g.id = gr.game_id
     where g.status = 'active' and gr.round_no = g.current_round
       and gr.status = 'done' and gr.decided_at is not null
       and gr.decided_at < now() - interval '30 seconds'
  loop
    perform public._advance_game(r.game_id);
  end loop;

  -- 4) No activity for 15 minutes → abandon (drops it from the live feed).
  update public.games g
     set status = 'finished', finished_at = now()
   where g.status = 'active'
     and not exists (
       select 1 from public.game_rounds gr
        where gr.game_id = g.id
          and coalesce(gr.decided_at, gr.started_at, gr.created_at) > now() - interval '15 minutes'
     );
end $$;

-- Schedule every minute (enable pg_cron in Dashboard → Database → Extensions
-- if this block is skipped).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('pixel-rush-sweep')
      where exists (select 1 from cron.job where jobname = 'pixel-rush-sweep');
    perform cron.schedule('pixel-rush-sweep', '* * * * *', $cron$ select public.sweep_games() $cron$);
  end if;
end $$;
