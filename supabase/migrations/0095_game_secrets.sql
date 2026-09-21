-- =========================================================================
-- 0095 — hidden information for chat games.
--
-- Companion to 0094. Open-information games (noughts and crosses, Connect
-- Four, Twenty-One, Dots and Boxes, draughts) keep their rules in shared
-- client code and put their whole board in chat_games.state. Three games
-- cannot work that way:
--
--   Word Guess           the word must be invisible to the guesser
--   Rock Paper Scissors  the first throw must be invisible until both are in
--   Number Duel          the number must be invisible to the guesser
--
-- Anything in chat_games.state is sent to both clients. A word sitting there
-- is readable from devtools by the one person who must not see it — that
-- isn't a cheat, it's the game not working. So secrets live here, RLS shows
-- a row only to its owner, and the checks against them run server-side.
-- The opponent learns exactly what the answers below tell them.
-- =========================================================================

create table if not exists public.chat_game_secrets (
  game_id    uuid not null references public.chat_games(id) on delete cascade,
  owner_id   uuid not null references public.profiles(id)   on delete cascade,
  secret     jsonb not null,
  created_at timestamptz not null default now(),
  primary key (game_id, owner_id)
);

alter table public.chat_game_secrets enable row level security;

-- The owner, and nobody else. Not the opponent, not after the game ends.
drop policy if exists "chat_game_secrets_owner_read" on public.chat_game_secrets;
create policy "chat_game_secrets_owner_read" on public.chat_game_secrets
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists "chat_game_secrets_no_client_write" on public.chat_game_secrets;
create policy "chat_game_secrets_no_client_write" on public.chat_game_secrets
  for insert to authenticated with check (false);

-- -------------------------------------------------------------------------
-- Set once. Re-setting would let someone swap the word after a guess.
-- -------------------------------------------------------------------------
create or replace function public.set_game_secret(p_game uuid, p_secret jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  g  public.chat_games;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_secret is null then raise exception 'secret required'; end if;

  select cg.* into g from public.chat_games cg where cg.id = p_game;
  if g.id is null then raise exception 'no such game'; end if;
  if g.player_a <> me and g.player_b <> me then raise exception 'not your game'; end if;

  insert into public.chat_game_secrets (game_id, owner_id, secret)
       values (p_game, me, p_secret)
  on conflict (game_id, owner_id) do nothing;
end $$;

grant execute on function public.set_game_secret(uuid, jsonb) to authenticated;

-- -------------------------------------------------------------------------
-- Word Guess: is this letter in their word?
--
-- Returns what the guesser is entitled to know and nothing more — whether
-- the letter appears, where, and the word itself only once it is solved.
-- -------------------------------------------------------------------------
create or replace function public.guess_word_letter(p_game uuid, p_letter text)
returns table (hit boolean, positions int[], solved boolean, word text)
language plpgsql security definer set search_path = public
as $$
declare
  me        uuid := auth.uid();
  g         public.chat_games;
  setter    uuid;
  the_word  text;
  guessed   text[];
  i         int;
  pos       int[] := '{}';
  is_solved boolean;
  letter    text := upper(btrim(p_letter));
begin
  if me is null then raise exception 'not authenticated'; end if;
  if letter !~ '^[A-Z]$' then raise exception 'one letter, A-Z'; end if;

  select cg.* into g from public.chat_games cg where cg.id = p_game for update;
  if g.id is null then raise exception 'no such game'; end if;
  if g.status <> 'active' then raise exception 'game is not active'; end if;
  if g.turn_user_id is distinct from me then raise exception 'not your turn'; end if;

  -- The setter is whichever player is not guessing.
  setter := case when g.player_a = me then g.player_b else g.player_a end;

  select (s.secret ->> 'word') into the_word
    from public.chat_game_secrets s
   where s.game_id = p_game and s.owner_id = setter;

  if the_word is null then raise exception 'no word has been set yet'; end if;

  guessed := coalesce(
    array(select jsonb_array_elements_text(g.state -> 'guessed')),
    cast('{}' as text[])
  );
  if letter = any(guessed) then raise exception 'already guessed'; end if;
  guessed := guessed || letter;

  for i in 1 .. length(the_word) loop
    if substr(the_word, i, 1) = letter then pos := pos || i; end if;
  end loop;

  -- Solved when every non-space character has been guessed.
  is_solved := not exists (
    select 1
      from generate_series(1, length(the_word)) gs
     where substr(the_word, gs, 1) <> ' '
       and not (substr(the_word, gs, 1) = any(guessed))
  );

  return query select
    (array_length(pos, 1) is not null),
    pos,
    is_solved,
    case when is_solved then the_word else null end;
end $$;

grant execute on function public.guess_word_letter(uuid, text) to authenticated;

-- -------------------------------------------------------------------------
-- Number Duel: higher or lower?
--
-- -1 = their number is higher than your guess, 1 = lower, 0 = spot on. The
-- number itself is never returned.
-- -------------------------------------------------------------------------
create or replace function public.guess_duel_number(p_game uuid, p_value int)
returns table (verdict int, correct boolean)
language plpgsql security definer set search_path = public
as $$
declare
  me     uuid := auth.uid();
  g      public.chat_games;
  target uuid;
  secret int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_value is null then raise exception 'a guess is required'; end if;

  select cg.* into g from public.chat_games cg where cg.id = p_game for update;
  if g.id is null then raise exception 'no such game'; end if;
  if g.status <> 'active' then raise exception 'game is not active'; end if;
  if g.turn_user_id is distinct from me then raise exception 'not your turn'; end if;

  target := case when g.player_a = me then g.player_b else g.player_a end;

  select (s.secret ->> 'number')::int into secret
    from public.chat_game_secrets s
   where s.game_id = p_game and s.owner_id = target;

  if secret is null then raise exception 'they have not picked a number yet'; end if;

  return query select
    case when p_value < secret then -1 when p_value > secret then 1 else 0 end,
    (p_value = secret);
end $$;

grant execute on function public.guess_duel_number(uuid, int) to authenticated;

-- -------------------------------------------------------------------------
-- Rock Paper Scissors: reveal both throws, once both are in.
--
-- Refuses until the second throw exists, so the first thrower cannot peek at
-- what they are up against.
-- -------------------------------------------------------------------------
create or replace function public.reveal_rps_throws(p_game uuid)
returns table (mine text, theirs text)
language plpgsql security definer set search_path = public
as $$
declare
  me       uuid := auth.uid();
  g        public.chat_games;
  opponent uuid;
  my_throw text;
  op_throw text;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select cg.* into g from public.chat_games cg where cg.id = p_game;
  if g.id is null then raise exception 'no such game'; end if;
  if g.player_a <> me and g.player_b <> me then raise exception 'not your game'; end if;

  opponent := case when g.player_a = me then g.player_b else g.player_a end;

  select (s.secret ->> 'throw') into my_throw
    from public.chat_game_secrets s where s.game_id = p_game and s.owner_id = me;
  select (s.secret ->> 'throw') into op_throw
    from public.chat_game_secrets s where s.game_id = p_game and s.owner_id = opponent;

  if my_throw is null or op_throw is null then
    raise exception 'both players must throw first';
  end if;

  return query select my_throw, op_throw;
end $$;

grant execute on function public.reveal_rps_throws(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- Throws are per-round, so a settled round clears them ready for the next.
-- -------------------------------------------------------------------------
create or replace function public.clear_game_secrets(p_game uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  g  public.chat_games;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select cg.* into g from public.chat_games cg where cg.id = p_game;
  if g.id is null then raise exception 'no such game'; end if;
  if g.player_a <> me and g.player_b <> me then raise exception 'not your game'; end if;

  delete from public.chat_game_secrets where game_id = p_game;
end $$;

grant execute on function public.clear_game_secrets(uuid) to authenticated;
