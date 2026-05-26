-- Pixel Rush lifecycle refinements:
--   * close_game now FINISHES the game (keeps the row) so participants see
--     "Game over" instead of "not found"; it still leaves the live feed.
--   * host heartbeat → the sweep auto-closes a game if the host leaves.
--   * leave_game for joined (non-host) players.
--   * rounds no longer auto-end with no winner — a round runs until someone
--     wins (the game can stay as long as players keep trying).

alter table public.games add column if not exists host_seen_at timestamptz default now();

-- Close = finish (not delete), so the "Game over" screen can show.
create or replace function public.close_game(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); g public.games;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null then return; end if;
  if g.host_id <> me then raise exception 'only the host can close the game'; end if;
  update public.games set status = 'finished', finished_at = now()
   where id = p_game_id and status <> 'finished';
end $$;
grant execute on function public.close_game(uuid) to authenticated;

-- Host heartbeat — the host's client pings this while on the game page.
create or replace function public.host_heartbeat(p_game_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.games set host_seen_at = now()
   where id = p_game_id and host_id = auth.uid() and status <> 'finished';
$$;
grant execute on function public.host_heartbeat(uuid) to authenticated;

-- A joined (non-host) player leaves; if that drops an active game below 2
-- players, the game finishes.
create or replace function public.leave_game(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); g public.games; cnt int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null then return; end if;
  if g.host_id = me then raise exception 'the host should close the game instead'; end if;

  delete from public.game_players where game_id = p_game_id and user_id = me;

  if g.status = 'active' then
    select count(*) into cnt from public.game_players where game_id = p_game_id;
    if cnt < 2 then
      update public.games set status = 'finished', finished_at = now() where id = p_game_id;
    end if;
  end if;
end $$;
grant execute on function public.leave_game(uuid) to authenticated;

-- Sweep, revised: NO racing timeout (rounds run until someone wins). Still
-- skips an AFK uploader, auto-advances a decided round if the host idles, and
-- now closes a game whose host has gone (no heartbeat for 45s).
create or replace function public.sweep_games()
returns void
language plpgsql security definer set search_path = public
as $$
declare r record; np int; nextp uuid; cur_idx int;
begin
  -- Close games whose host has left (no heartbeat for 45s).
  update public.games set status = 'finished', finished_at = now()
   where status in ('lobby','active')
     and host_seen_at is not null and host_seen_at < now() - interval '45 seconds';

  -- Turn player hasn't uploaded in 60s → skip; once all skipped, end round.
  for r in
    select gr.game_id, gr.round_no, gr.turn_user_id, gr.skips
      from public.game_rounds gr join public.games g on g.id = gr.game_id
     where g.status = 'active' and gr.round_no = g.current_round
       and gr.status = 'awaiting_image' and gr.created_at < now() - interval '60 seconds'
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
      update public.game_rounds set turn_user_id = nextp, skips = skips + 1, created_at = now()
       where game_id = r.game_id and round_no = r.round_no;
    else
      perform public._advance_game(r.game_id);
    end if;
  end loop;

  -- Round decided but host idle 30s → auto-advance.
  for r in
    select gr.game_id from public.game_rounds gr join public.games g on g.id = gr.game_id
     where g.status = 'active' and gr.round_no = g.current_round
       and gr.status = 'done' and gr.decided_at is not null and gr.decided_at < now() - interval '30 seconds'
  loop
    perform public._advance_game(r.game_id);
  end loop;

  -- Abandon games with no activity for 15 minutes.
  update public.games g set status = 'finished', finished_at = now()
   where g.status = 'active'
     and not exists (
       select 1 from public.game_rounds gr where gr.game_id = g.id
        and coalesce(gr.decided_at, gr.started_at, gr.created_at) > now() - interval '15 minutes'
     );
end $$;
