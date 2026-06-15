-- 0088 — Coin economy foundation.
--
-- Coins are the app's in-app virtual currency. They are bought (Apple IAP /
-- Google Play Billing via RevenueCat, and ALATPay on web + Telegram), earned
-- (game wins, daily refill, receiving gifts), and spent (entering games).
-- Coins are non-cashable by design — there is no withdrawal path.
--
-- This migration builds the coin primitives only. Gifts rework (0089), the
-- games coin/ad gate (0090), and removal of the legacy wallet/payments code
-- (0091) follow.

-- =========================================================================
-- 1. coin balance — a single int per user, on profiles. New signups start
--    at 100 (the column default also backfills every existing profile).
-- =========================================================================
alter table public.profiles
  add column if not exists coins               int not null default 100,
  add column if not exists last_daily_coins_at timestamptz;

-- =========================================================================
-- 2. coin_ledger — append-only history. Pure transparency; no cash value.
-- =========================================================================
do $$ begin
  create type public.coin_kind as enum (
    'signup_grant',   -- 100 on account creation (via the column default)
    'game_win',       -- +1 for winning a game
    'daily_refill',   -- +10 once per 24h, only when empty
    'gift_received',  -- a few coins for receiving a (free) gift
    'game_entry',     -- -1 to join a game
    'purchase',       -- bought via IAP / ALATPay
    'admin_adjust'    -- manual correction
  );
exception when duplicate_object then null; end $$;

create table if not exists public.coin_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  kind          public.coin_kind not null,
  delta         int  not null,          -- +credit / -debit, in whole coins
  balance_after int  not null,
  ref_table     text,
  ref_id        uuid,
  note          text,
  created_at    timestamptz not null default now()
);

create index if not exists coin_ledger_user_created_idx
  on public.coin_ledger (user_id, created_at desc);

-- =========================================================================
-- 3. apply_coins — the ONE place coins move. Atomic balance update + history
--    row. Clamps at 0 so a balance can never go negative. Internal helper:
--    NOT granted to clients; only the SECURITY DEFINER functions below call it.
-- =========================================================================
create or replace function public.apply_coins(
  p_user      uuid,
  p_delta     int,
  p_kind      public.coin_kind,
  p_ref_table text default null,
  p_ref_id    uuid default null,
  p_note      text default null
) returns int
language plpgsql security definer set search_path = public
as $$
declare new_balance int;
begin
  update public.profiles
     set coins = greatest(0, coins + p_delta)
   where id = p_user
  returning coins into new_balance;

  if new_balance is null then raise exception 'no such user'; end if;

  insert into public.coin_ledger (user_id, kind, delta, balance_after, ref_table, ref_id, note)
       values (p_user, p_kind, p_delta, new_balance, p_ref_table, p_ref_id, p_note);

  return new_balance;
end $$;

-- =========================================================================
-- 4. claim_daily_coins — +10, at most once per 24h, ONLY when the user has
--    run out (coins = 0). Keeps free players topped up without a cash path.
-- =========================================================================
create or replace function public.claim_daily_coins()
returns int
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); cur int; last timestamptz;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select coins, last_daily_coins_at into cur, last from public.profiles where id = me;
  if cur > 0 then
    raise exception 'Daily coins are only for when you run out.';
  end if;
  if last is not null and last > now() - interval '24 hours' then
    raise exception 'Come back later — daily coins refresh every 24 hours.';
  end if;
  update public.profiles set last_daily_coins_at = now() where id = me;
  return public.apply_coins(me, 10, 'daily_refill', null, null, 'Daily top-up');
end $$;
grant execute on function public.claim_daily_coins() to authenticated;

-- =========================================================================
-- 5. award_game_win — +1 to a winner. Internal: called by the game-finish
--    RPC (wired in 0090), never directly by a client.
-- =========================================================================
create or replace function public.award_game_win(p_winner uuid, p_game uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_winner is null then return; end if;
  perform public.apply_coins(p_winner, 1, 'game_win', 'games', p_game, 'Game win');
end $$;

-- =========================================================================
-- 6. grant_purchased_coins — admin/service only. Called by the IAP receipt
--    verifier and the ALATPay webhook after a confirmed coin-pack purchase.
-- =========================================================================
create or replace function public.grant_purchased_coins(p_user uuid, p_amount int, p_ref text)
returns int
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); is_admin bool;
begin
  select coalesce(role in ('admin','super_admin'), false) into is_admin
    from public.profiles where id = me;
  if not is_admin then raise exception 'admin/service only'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be > 0'; end if;
  return public.apply_coins(p_user, p_amount, 'purchase', null, null, p_ref);
end $$;
grant execute on function public.grant_purchased_coins(uuid, int, text) to authenticated;

-- =========================================================================
-- 7. RLS — a user reads their own coin history. The balance itself rides on
--    profiles (already readable). All writes go through the functions above.
-- =========================================================================
alter table public.coin_ledger enable row level security;

drop policy if exists "coin_ledger_self_read" on public.coin_ledger;
create policy "coin_ledger_self_read" on public.coin_ledger
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "coin_ledger_no_client_write" on public.coin_ledger;
create policy "coin_ledger_no_client_write" on public.coin_ledger
  for insert to authenticated with check (false);

-- Realtime so the coin chip animates the moment a balance changes.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'coin_ledger'
  ) then
    alter publication supabase_realtime add table public.coin_ledger;
  end if;
end $$;
