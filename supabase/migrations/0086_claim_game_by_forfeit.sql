-- Forfeit-by-disconnect: a player can claim the match when their 1v1
-- opponent has been offline for more than 3 minutes.
--
-- The client shows the "reconnecting..." banner with a 3-minute countdown
-- the moment the opponent drops out of Supabase Realtime presence. When the
-- countdown hits zero, the client calls this RPC. We DOUBLE-CHECK on the
-- server using the opponent's `last_seen_at` heartbeat (touched every ~25s
-- by usePresenceInit) — that way a malicious client can't spoof a forfeit
-- while the opponent is genuinely online.
--
-- On success:
--   • games.status        -> 'finished'
--   • games.winner_player  -> the caller
--   • games.finished_at    -> now()
--   • caller's trophies    +1   (matches _finish_match)
--
-- On failure (opponent reconnected, caller not a player, game not active,
-- etc.) we raise — the client surfaces it as a toast and clears the banner.

create or replace function public.claim_game_by_forfeit(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  g  public.games;
  opp_id        uuid;
  opp_last_seen timestamptz;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select * into g from public.games where id = p_game_id for update;
  if g.id is null              then raise exception 'game not found'; end if;
  if g.status <> 'active'      then raise exception 'game not active'; end if;
  if g.kind <> '1v1'           then raise exception 'forfeit is only for 1v1 matches'; end if;

  -- Caller must be a player in this game.
  if not exists (
    select 1 from public.game_players
     where game_id = p_game_id and user_id = me
  ) then
    raise exception 'not a player in this game';
  end if;

  -- Find the opponent.
  select user_id into opp_id
    from public.game_players
   where game_id = p_game_id and user_id <> me
   limit 1;
  if opp_id is null then raise exception 'no opponent to claim against'; end if;

  -- Server-side verification: the opponent's heartbeat must be at least
  -- 3 minutes stale. usePresenceInit touches last_seen_at every ~25s while
  -- the tab/app is alive, so a 3-minute gap is a confident "really gone".
  select last_seen_at into opp_last_seen
    from public.profiles where id = opp_id;
  if opp_last_seen is null or opp_last_seen > now() - interval '3 minutes' then
    raise exception 'opponent still connected';
  end if;

  -- Award the match.
  update public.games
     set status        = 'finished',
         finished_at   = now(),
         winner_player = me
   where id = p_game_id;

  update public.game_players
     set trophies = trophies + 1
   where game_id = p_game_id and user_id = me;
end $$;
grant execute on function public.claim_game_by_forfeit(uuid) to authenticated;
