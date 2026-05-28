-- Cap Number Duel secrets and guesses at 2 decimal places so the game stays
-- guessable (0.22 ok, 0.99999 not). Enforced server-side so a tampered client
-- can't bypass.

create or replace function public.set_duel_secret(p_game_id uuid, p_round int, p_secret numeric)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); g public.games; r public.duel_rounds; secret_count int; player_count int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_secret <> round(p_secret, 2) then raise exception 'Numbers can use at most 2 decimal places'; end if;
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

create or replace function public.submit_duel_guess(p_game_id uuid, p_round int, p_value numeric)
returns text
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); g public.games; r public.duel_rounds; target numeric; fb text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_value <> round(p_value, 2) then raise exception 'Guesses can use at most 2 decimal places'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null or g.status <> 'active' or g.current_round <> p_round then raise exception 'round not active'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = me) then
    raise exception 'not a player in this game';
  end if;
  select * into r from public.duel_rounds where game_id = p_game_id and round_no = p_round for update;
  if r.round_no is null or r.status <> 'guessing' then return 'closed'; end if;

  select secret into target from public.duel_secrets
    where game_id = p_game_id and round_no = p_round and user_id <> me limit 1;
  if target is null then return 'closed'; end if;

  if p_value = target then fb := 'correct';
  elsif p_value < target then fb := 'higher';
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
