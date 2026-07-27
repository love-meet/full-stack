-- =====================================================================
-- APPLY_MISSING_0088-0092.sql  (generated 2026-07-27)
--
-- Remote audit of jpcqxoolmheemdgqodvm found these migrations were never
-- run in production, while 0093-0097 WERE applied on top of them:
--
--   0088_coins.sql                      (profiles.coins, coin_ledger, RPCs)
--   0089_gifts_free.sql                 (send_gift/respond_gift rework)
--   0090_games_coins.sql                (create_game/join_game coin gate)
--   0091_legacy_removal.sql             (drops fiat wallet/subscriptions)
--   0092_local_fixes.sql                (RLS policy + grants patches)
--   0092_onboarding_branch_gallery.sql  (profiles.intent + gallery_urls
--                                        <- fixes "column pr.gallery_urls
--                                           does not exist" in the feed)
--
-- Paste this whole file into the Supabase SQL editor and run it once.
-- It is wrapped in a single transaction: all-or-nothing.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- >>> 0088_coins.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- >>> 0089_gifts_free.sql
-- ---------------------------------------------------------------------
-- 0089 — Rework gifts to be free, rewarding coins to the recipient.
--
-- Drops the wallet-debit/escrow path entirely. Senders pay nothing to send
-- a gift. Recipients receive 5 coins when they accept it.

alter table public.post_gifts
  alter column amount_cents drop not null,
  alter column amount_cents set default 0;

-- =========================================================================
-- send_gift — funds check and escrow debit removed.
-- =========================================================================
create or replace function public.send_gift(
  p_post_id    uuid,
  p_gift_id    text,
  p_gift_name  text,
  p_gift_image text,
  p_amount_cents int default 0
)
returns public.post_gifts
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  recipient uuid;
  g public.post_gifts;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select author_id into recipient from public.posts where id = p_post_id;
  if recipient is null then raise exception 'post not found'; end if;
  if recipient = me then raise exception 'You can''t send a gift to yourself.'; end if;

  -- Insert pending gift. No ledger debit, no balance check.
  insert into public.post_gifts (post_id, sender_id, recipient_id, gift_id, gift_name, gift_image, amount_cents, status)
       values (p_post_id, me, recipient, p_gift_id, p_gift_name, p_gift_image, 0, 'pending')
    returning * into g;

  -- No escrow / ledger entry for the sender.

  return g;
end $$;

grant execute on function public.send_gift(uuid, text, text, text, int) to authenticated;

-- =========================================================================
-- respond_gift — replace fiat credit/refund with a virtual coin reward.
-- =========================================================================
create or replace function public.respond_gift(p_gift_id uuid, p_accept boolean)
returns public.post_gifts
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  g public.post_gifts;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select * into g from public.post_gifts where id = p_gift_id for update;
  if g.id is null then raise exception 'gift not found'; end if;
  if g.recipient_id <> me then raise exception 'not your gift'; end if;
  if g.status <> 'pending' then raise exception 'this gift was already %', g.status; end if;

  if p_accept then
    update public.post_gifts set status = 'accepted', responded_at = now() where id = g.id
      returning * into g;
    
    -- Credit the recipient with +5 virtual coins.
    perform public.apply_coins(me, 5, 'gift_received', 'post_gifts', g.id, concat('Received gift: ', g.gift_name));
  else
    update public.post_gifts set status = 'rejected', responded_at = now() where id = g.id
      returning * into g;
    
    -- No refund logic needed anymore because sender didn't pay anything.
  end if;

  return g;
end $$;

grant execute on function public.respond_gift(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- >>> overload cleanup (NOT in the original files — required here)
-- 0090 adds a p_reward_token parameter to create_game/join_game but never
-- drops the old signatures. The frontend calls these with the short arg
-- lists, which would match BOTH versions and make PostgREST fail with
-- PGRST203 "ambiguous function". Drop the old signatures first.
-- ---------------------------------------------------------------------
drop function if exists public.create_game(text, int);
drop function if exists public.create_game(text, int, text);
drop function if exists public.join_game(text, text);

-- ---------------------------------------------------------------------
-- >>> 0090_games_coins.sql
-- ---------------------------------------------------------------------
-- 0090 — Replace subscription gates with coin gates for games.
--
-- 1. create_game and join_game now cost 1 coin (unless a rewarded ad token is provided).
-- 2. _finish_match awards 1 coin to the winner(s).

-- =========================================================================
-- create_game — Drop the has_active_subscription check, add coin gate.
-- =========================================================================
create or replace function public.create_game(
  p_kind text, 
  p_max int default 2, 
  p_type text default 'pixel_rush', 
  p_reward_token text default null
)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare 
  me uuid := auth.uid(); 
  g public.games; 
  code text; 
  bal int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  
  -- Gate: 1 coin or a rewarded ad token
  if p_reward_token is null or trim(p_reward_token) = '' then
    select coalesce(coins, 0) into bal from public.profiles where id = me;
    if bal < 1 then
      raise exception 'Not enough coins to create a game. Watch an ad to play for free!';
    end if;
    perform public.apply_coins(me, -1, 'game_entry');
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
                 when p_type = 'draughts' then 3
                 else 9 
               end)
    returning * into g;

  insert into public.game_players (game_id, user_id, team, is_host)
       values (g.id, me, 'A', true);

  return g;
end $$;
grant execute on function public.create_game(text, int, text, text) to authenticated;

-- =========================================================================
-- join_game — Add coin gate.
-- =========================================================================
create or replace function public.join_game(
  p_code text, 
  p_guest_name text default null, 
  p_reward_token text default null
)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  g public.games;
  cnt int; team_a int; team_b int; assigned text;
  bal int;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select * into g from public.games where invite_code = upper(p_code);
  if g.id is null then raise exception 'game not found'; end if;

  if exists (select 1 from public.game_players where game_id = g.id and user_id = me) then
    return g; -- already in
  end if;
  if g.status <> 'lobby' then raise exception 'this game has already started'; end if;

  select count(*) into cnt from public.game_players where game_id = g.id;
  if cnt >= g.max_players then raise exception 'this game is full'; end if;

  -- Gate: 1 coin or a rewarded ad token
  if p_reward_token is null or trim(p_reward_token) = '' then
    select coalesce(coins, 0) into bal from public.profiles where id = me;
    if bal < 1 then
      raise exception 'Not enough coins to join. Watch an ad to play for free!';
    end if;
    perform public.apply_coins(me, -1, 'game_entry');
  end if;

  if g.kind = '1v1' then
    assigned := 'B';
  else
    select count(*) filter (where team = 'A'), count(*) filter (where team = 'B')
      into team_a, team_b from public.game_players where game_id = g.id;
    assigned := case when coalesce(team_a,0) <= coalesce(team_b,0) then 'A' else 'B' end;
  end if;

  insert into public.game_players (game_id, user_id, guest_name, team)
       values (g.id, me, nullif(trim(coalesce(p_guest_name, '')), ''), assigned);

  return g;
end $$;
grant execute on function public.join_game(text, text, text) to authenticated;

-- =========================================================================
-- _finish_match — Call award_game_win for the winner(s).
-- =========================================================================
create or replace function public._finish_match(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare 
  g public.games; 
  win_player uuid; 
  win_team text;
  team_member record;
begin
  select * into g from public.games where id = p_game_id;
  if g.id is null then return; end if;
  
  if g.kind = '1v1' then
    select user_id into win_player from public.game_players where game_id = g.id order by score desc, joined_at asc limit 1;
    update public.games set status='finished', finished_at=now(), winner_player=win_player where id = g.id;
    update public.game_players set trophies = trophies + 1 where game_id = g.id and user_id = win_player;
    
    -- Award coin
    if win_player is not null then
      perform public.award_game_win(win_player, p_game_id);
    end if;
  else
    select team into win_team from public.game_players where game_id = g.id group by team order by sum(score) desc limit 1;
    update public.games set status='finished', finished_at=now(), winner_team=win_team where id = g.id;
    update public.game_players set trophies = trophies + 1 where game_id = g.id and team = win_team;
    
    -- Award coin to all players on the winning team
    for team_member in select user_id from public.game_players where game_id = g.id and team = win_team loop
      if team_member.user_id is not null then
        perform public.award_game_win(team_member.user_id, p_game_id);
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- >>> 0091_legacy_removal.sql
-- ---------------------------------------------------------------------
-- 0091 — Legacy Fiat Removal & Premium Model Reframe.
--
-- Drops the old fiat wallet, deposits, withdrawal requests, and legacy 
-- subscription plans schemas. 
--
-- Safely transitions the has_active_subscription helper to point to the new
-- premium fields on profiles so we don't break chat gates or feed ranking.

-- 1. Add premium fields to profiles
alter table public.profiles
  add column if not exists is_premium boolean not null default false,
  add column if not exists premium_expires_at timestamptz;

-- 2. Redirect has_active_subscription to use the new fields
--    (this prevents breaking chat_gates, follows privacy, and feed ranking)
create or replace function public.has_active_subscription(uid uuid default auth.uid())
returns boolean
language sql security definer set search_path = public
as $$
  select coalesce(is_premium, false)
    from public.profiles
   where id = uid
     and (premium_expires_at is null or premium_expires_at > now());
$$;

-- 3. Drop dependent views and functions first
drop view if exists public.my_affiliate_summary cascade;
drop view if exists public.my_transactions cascade;

drop trigger if exists launch_bonus_on_signup on public.profiles cascade;
drop function if exists public.tg_launch_bonus() cascade;
drop function if exists public.subscribe(text) cascade;
drop function if exists public.apply_referral(text) cascade;
drop function if exists public.request_withdrawal(numeric, text, text) cascade;

-- 4. Drop the legacy money schemas
drop table if exists public.withdrawal_requests cascade;
drop table if exists public.deposits cascade;
drop table if exists public.user_subscriptions cascade;
drop table if exists public.subscription_plans cascade;
drop table if exists public.fx_rates cascade;
drop table if exists public.ledger_entries cascade;
drop table if exists public.wallets cascade;

-- 5. Drop affiliate referral column
alter table public.profiles 
  drop column if exists referred_by cascade;

-- 6. Drop unused enums
drop type if exists public.payment_provider cascade;
drop type if exists public.deposit_status cascade;
drop type if exists public.withdrawal_status cascade;
drop type if exists public.subscription_status cascade;
drop type if exists public.ledger_kind cascade;
drop type if exists public.ledger_direction cascade;

-- ---------------------------------------------------------------------
-- >>> legacy-cron cleanup (NOT in the original files — required here)
-- 0042 scheduled a nightly 'expire-subscriptions' pg_cron job calling
-- expire_subscriptions(), which updates user_subscriptions — a table 0091
-- just dropped. The function body isn't a tracked dependency, so it
-- survives the cascade and the job would fail every night at 02:00 UTC.
-- Unschedule the job and drop the dead function.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'expire-subscriptions') then
    perform cron.unschedule('expire-subscriptions');
  end if;
end $$;
drop function if exists public.expire_subscriptions() cascade;

-- ---------------------------------------------------------------------
-- >>> 0092_local_fixes.sql
-- ---------------------------------------------------------------------
-- 0092 — Production patches discovered during local smoke test.

-- 1. Drop the launch promo trigger that references the now-deleted ledger_entries table.
drop trigger if exists launch_bonus_on_signup on public.profiles cascade;
drop function if exists public.tg_launch_bonus() cascade;

-- 2. Fix the RLS update policy — the old role subquery caused updates to return 0 rows.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- 3. Ensure explicit table-level privileges are granted.
grant select, update on public.profiles to authenticated;
grant select on public.profiles to anon;

-- 4. Re-grant SELECT on posts_with_counts (lost when view was recreated in 00871).
grant select on public.posts_with_counts to authenticated;

-- 5. Blanket-grant all public schema tables to authenticated.
--    Local Supabase db reset does not carry over the default-privilege grants
--    that the hosted platform applies automatically. Rather than listing every
--    table individually, grant on all current tables in one shot.
--    RLS policies are the real access-control layer; these grants just let
--    PostgREST see the tables at all.
grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

grant usage on schema public to authenticated, anon;

-- ---------------------------------------------------------------------
-- >>> 0092_onboarding_branch_gallery.sql
-- ---------------------------------------------------------------------
-- Onboarding branch + mandatory photo gallery.
--
-- Adds `intent` (the "What brings you to Love meet?" answer — relationship
-- vs fun, used to decide whether the detailed questionnaire is shown) and
-- `gallery_urls` (the 5-photo gallery filled in on the final onboarding
-- step, regardless of path). These are the photos the feed renders.
--
-- Numbered 0092 to avoid colliding with the in-flight 0089-0091 coins/legacy
-- migrations on another branch.

alter table public.profiles
  add column if not exists intent       text,
  add column if not exists gallery_urls text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_intent_check;
alter table public.profiles add  constraint profiles_intent_check
  check (intent is null or intent in ('relationship', 'fun'));

alter table public.profiles drop constraint if exists profiles_gallery_max_check;
alter table public.profiles add  constraint profiles_gallery_max_check
  check (array_length(gallery_urls, 1) is null or array_length(gallery_urls, 1) <= 5);

commit;
