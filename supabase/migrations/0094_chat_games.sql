-- =========================================================================
-- 0094 — Phase 5: games live inside a chat.
--
-- §8: turn-based, asynchronous, played inside a chat. Each move notifies the
-- other player. No presence, no spectators, no lobby. Games are free — they
-- cost nothing and pay nothing (§2), so nothing here touches credits.
--
-- This replaces the real-time lobby model entirely. The old games tables
-- (0054-0086) are left in place rather than dropped: Phase 0 already removed
-- every route into them, and dropping live tables is a separate, deliberate
-- clean-up once this has been running for a while.
--
-- ── Where the rules live ────────────────────────────────────────────────
-- The dividing line is information, not effort.
--
-- OPEN-INFORMATION games (noughts and crosses, Connect Four, Twenty-One,
-- Dots and Boxes, draughts) keep their rules in shared client code. The
-- server enforces only what matters structurally:
--   * only the player whose turn it is may move
--   * moves apply in order (optimistic concurrency on move_count), so a
--     replayed or duplicated request cannot apply twice
--   * only the two players can see or touch the game
-- It does not re-verify move legality. A modified client could submit an
-- illegal board — but games are free, with no entry cost, no winnings, no
-- rewards and no ranking, so the prize for cheating is beating one person at
-- noughts and crosses. The cost of the alternative is five duplicated rule
-- engines kept in lockstep with the client forever. If games ever gain
-- stakes, this is the decision to revisit first.
--
-- HIDDEN-INFORMATION games (Word Guess, Rock Paper Scissors, Number Duel)
-- cannot work that way. Anything in `state` is sent to both clients, so a
-- word or an unrevealed throw sitting there is readable from devtools by the
-- one person who must not see it — that is not a cheat, it is the game not
-- working. Their secrets live in chat_game_secrets and the checks against
-- them run server-side. See 0095.
-- =========================================================================

do $$ begin
  create type public.chat_game_kind as enum (
    'tic_tac_toe',
    'connect_four',
    'rock_paper_scissors',
    'nim',
    'word_guess',
    'dots_and_boxes',
    'draughts',
    'number_duel'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.chat_game_status as enum ('invited', 'active', 'finished', 'declined');
exception when duplicate_object then null; end $$;

create table if not exists public.chat_games (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  kind            public.chat_game_kind not null,
  status          public.chat_game_status not null default 'invited',

  -- 'a' is always the player who sent the invite, 'b' the one who accepted.
  -- Game state refers to roles, never to user ids, so the rule code never
  -- needs to know who is who.
  player_a        uuid not null references public.profiles(id) on delete cascade,
  player_b        uuid not null references public.profiles(id) on delete cascade,

  turn_user_id    uuid references public.profiles(id) on delete set null,
  state           jsonb not null default '{}'::jsonb,
  move_count      int  not null default 0,

  winner_user_id  uuid references public.profiles(id) on delete set null,
  is_draw         boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  finished_at     timestamptz,

  check (player_a <> player_b)
);

create index if not exists chat_games_conversation_idx
  on public.chat_games (conversation_id, created_at desc);
create index if not exists chat_games_turn_idx
  on public.chat_games (turn_user_id) where status = 'active';

-- -------------------------------------------------------------------------
-- RLS — only the two players, ever. No spectators (§8).
-- -------------------------------------------------------------------------
alter table public.chat_games enable row level security;

drop policy if exists "chat_games_players_read" on public.chat_games;
create policy "chat_games_players_read" on public.chat_games
  for select to authenticated
  using (auth.uid() = player_a or auth.uid() = player_b);

drop policy if exists "chat_games_no_client_write" on public.chat_games;
create policy "chat_games_no_client_write" on public.chat_games
  for insert to authenticated with check (false);

drop policy if exists "chat_games_no_client_update" on public.chat_games;
create policy "chat_games_no_client_update" on public.chat_games
  for update to authenticated using (false);

-- -------------------------------------------------------------------------
-- Helper: the other member of a 1-on-1 conversation, or null if the caller
-- isn't in it. Every RPC below starts here, so membership is checked once.
-- -------------------------------------------------------------------------
create or replace function public._chat_partner(p_conversation uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select cm.user_id
    from public.conversation_members cm
   where cm.conversation_id = p_conversation
     and cm.user_id <> auth.uid()
     and exists (
       select 1 from public.conversation_members me
        where me.conversation_id = p_conversation and me.user_id = auth.uid()
     )
   limit 1;
$$;

-- -------------------------------------------------------------------------
-- Invite. One live game per kind per conversation: inviting again while one
-- is already running returns the running one rather than stacking boards up
-- in the thread.
-- -------------------------------------------------------------------------
create or replace function public.create_chat_game(
  p_conversation uuid,
  p_kind         public.chat_game_kind,
  p_state        jsonb default '{}'::jsonb
) returns public.chat_games
language plpgsql security definer set search_path = public
as $$
declare
  me      uuid := auth.uid();
  partner uuid;
  row     public.chat_games;
begin
  if me is null then raise exception 'not authenticated'; end if;

  partner := public._chat_partner(p_conversation);
  if partner is null then raise exception 'not a member of this conversation'; end if;

  select cg.* into row
    from public.chat_games cg
   where cg.conversation_id = p_conversation
     and cg.kind = p_kind
     and cg.status in ('invited', 'active')
   limit 1;
  if row.id is not null then return row; end if;

  insert into public.chat_games (conversation_id, kind, status, player_a, player_b,
                                 turn_user_id, state)
       values (p_conversation, p_kind, 'invited', me, partner,
               me, coalesce(p_state, '{}'::jsonb))
    returning * into row;

  insert into public.notifications (user_id, actor_id, type, conversation_id, body)
       values (partner, me, 'game_invite', p_conversation, p_kind::text);

  return row;
end $$;

grant execute on function public.create_chat_game(uuid, public.chat_game_kind, jsonb) to authenticated;

-- -------------------------------------------------------------------------
-- Accept / decline. Only the invitee can answer.
-- -------------------------------------------------------------------------
create or replace function public.respond_chat_game(p_game uuid, p_accept boolean)
returns public.chat_games
language plpgsql security definer set search_path = public
as $$
declare
  me  uuid := auth.uid();
  row public.chat_games;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select cg.* into row from public.chat_games cg where cg.id = p_game for update;
  if row.id is null then raise exception 'no such game'; end if;
  if row.player_b <> me then raise exception 'only the invited player can answer'; end if;
  if row.status <> 'invited' then return row; end if;

  update public.chat_games
     set status       = case when p_accept then 'active' else 'declined' end,
         turn_user_id = case when p_accept then player_a else null end,
         updated_at   = now(),
         finished_at  = case when p_accept then null else now() end
   where id = p_game
   returning * into row;

  return row;
end $$;

grant execute on function public.respond_chat_game(uuid, boolean) to authenticated;

-- -------------------------------------------------------------------------
-- A move.
--
-- p_expected_move is the move_count the client believed it was moving from.
-- If it doesn't match, the opponent already moved (or this request is a
-- duplicate) and the move is rejected rather than silently clobbering the
-- board — the client refetches and re-renders.
--
-- p_next_turn is a role ('a' or 'b') rather than a user id so the game rules
-- never need to know who is playing. Games where the same player moves twice
-- (a multi-jump, a second guess) just pass their own role back.
-- -------------------------------------------------------------------------
create or replace function public.play_chat_move(
  p_game          uuid,
  p_state         jsonb,
  p_expected_move int,
  p_next_turn     text default null,     -- 'a' | 'b' | null (keep current)
  p_finished      boolean default false,
  p_winner        text default null,     -- 'a' | 'b' | null (null + finished = draw)
  p_summary       text default null      -- one line for the notification
) returns public.chat_games
language plpgsql security definer set search_path = public
as $$
declare
  me       uuid := auth.uid();
  row      public.chat_games;
  next_uid uuid;
  win_uid  uuid;
  opponent uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_state is null then raise exception 'state required'; end if;

  select cg.* into row from public.chat_games cg where cg.id = p_game for update;
  if row.id is null then raise exception 'no such game'; end if;
  if row.status <> 'active' then raise exception 'game is not active'; end if;
  if row.turn_user_id is distinct from me then raise exception 'not your turn'; end if;
  if row.move_count <> p_expected_move then
    raise exception 'stale_move';   -- the board moved on; refetch and retry
  end if;

  opponent := case when row.player_a = me then row.player_b else row.player_a end;

  next_uid := case p_next_turn
                when 'a' then row.player_a
                when 'b' then row.player_b
                else opponent            -- default: hand the turn over
              end;

  win_uid := case p_winner
               when 'a' then row.player_a
               when 'b' then row.player_b
               else null
             end;

  update public.chat_games
     set state          = p_state,
         move_count     = move_count + 1,
         turn_user_id   = case when p_finished then null else next_uid end,
         status         = case when p_finished then 'finished' else 'active' end,
         winner_user_id = case when p_finished then win_uid else null end,
         is_draw        = case when p_finished and win_uid is null then true else false end,
         updated_at     = now(),
         finished_at    = case when p_finished then now() else null end
   where id = p_game
   returning * into row;

  -- Each move notifies the other player (§6, §8). One row per move; the bell
  -- collapses them in the UI, and there is no presence to check first.
  insert into public.notifications (user_id, actor_id, type, conversation_id, body)
       values (opponent, me, 'game_round', row.conversation_id,
               coalesce(p_summary, row.kind::text));

  return row;
end $$;

grant execute on function public.play_chat_move(uuid, jsonb, int, text, boolean, text, text) to authenticated;

-- -------------------------------------------------------------------------
-- Resign. Either player, any time a game is live. Asynchronous games need a
-- way out that isn't "wait forever for a move that never comes".
-- -------------------------------------------------------------------------
create or replace function public.resign_chat_game(p_game uuid)
returns public.chat_games
language plpgsql security definer set search_path = public
as $$
declare
  me       uuid := auth.uid();
  row      public.chat_games;
  opponent uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select cg.* into row from public.chat_games cg where cg.id = p_game for update;
  if row.id is null then raise exception 'no such game'; end if;
  if row.player_a <> me and row.player_b <> me then raise exception 'not your game'; end if;
  if row.status not in ('invited', 'active') then return row; end if;

  opponent := case when row.player_a = me then row.player_b else row.player_a end;

  update public.chat_games
     set status         = 'finished',
         turn_user_id   = null,
         winner_user_id = opponent,
         is_draw        = false,
         updated_at     = now(),
         finished_at    = now()
   where id = p_game
   returning * into row;

  insert into public.notifications (user_id, actor_id, type, conversation_id, body)
       values (opponent, me, 'game_round', row.conversation_id, 'resigned');

  return row;
end $$;

grant execute on function public.resign_chat_game(uuid) to authenticated;

-- Realtime so the opponent's board updates the moment a move lands, without
-- anyone having to be present when it happens.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_games'
  ) then
    alter publication supabase_realtime add table public.chat_games;
  end if;
end $$;
