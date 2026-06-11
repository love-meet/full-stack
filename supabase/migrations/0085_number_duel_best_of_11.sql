-- Number Duel: best of 11 (was best of 12).
--
-- Bug it fixes: with 12 rounds, the clinch math gives "first to 7 wins", but
-- when both players land at 6-6 after round 12, `_finish_match` falls back
-- to `order by score desc, joined_at asc limit 1` — and `joined_at asc`
-- means the HOST always wins ties because they joined first. So in practice:
--
--   * host reaches 6 → ends in a 6-6 tie at round 12 → trophy goes to host
--                      (looks like "host wins at 6")
--   * opponent reaches 6 → same tie → trophy still goes to host
--                          (opponent has to clinch with 7 to actually win)
--
-- Switching to 11 rounds makes "first to 6 wins" the actual clinch (because
-- 6 > 11-6 = 5), and ties become mathematically impossible. Symmetric for
-- both players, matches user intuition for "best of N", and no tiebreaker
-- bias.

-- 1. New default for newly-created matches.
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
                 when p_type = 'number_duel' then 11
                 when p_type = 'draughts'    then 3
                 else 9
               end)
    returning * into g;

  insert into public.game_players (game_id, user_id, team, is_host)
       values (g.id, me, 'A', true);

  return g;
end $$;
grant execute on function public.create_game(text, int, text) to authenticated;

-- 2. Heal in-progress matches that were created on the old 12-round default.
--
-- Only touch games where shrinking the total to 11 is still consistent with
-- play so far: the current_round must be <= 11 AND no player has already
-- crossed 6 wins (which under the old rules would have allowed the match to
-- run another round without clinching). For the leader-with-6 case the new
-- rules clinch immediately on next advance_duel; the helper sweep / next
-- advance_duel call picks it up cleanly.
update public.games
   set rounds_total = 11
 where game_type = 'number_duel'
   and status     = 'active'
   and rounds_total = 12
   and current_round <= 11;
