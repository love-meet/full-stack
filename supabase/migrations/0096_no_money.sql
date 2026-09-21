-- =========================================================================
-- 0096 — nothing that talks in money survives.
--
-- Victor, 19 Sep: the §3 screen list was incomplete, and the rule is the
-- intent, not the list. So subscriptions and the USD wallet go, and gifts
-- become free and purely cosmetic.
--
-- Gifts explicitly must NOT grant credits to the recipient. An earlier draft
-- said they should; that opens a loophole where two accounts gift each other
-- free messaging forever. 'gift_received' comes out of the credit ledger
-- kinds here so it cannot be written even by mistake.
--
-- ── Also fixes a live bug shipped in 0089 ───────────────────────────────
-- 0089 dropped has_active_subscription(). Postgres does not dependency-track
-- string-bodied function definitions, so the drop succeeded while three
-- callers kept referencing it:
--
--   * tg_block_free_to_paid_dm — a BEFORE INSERT TRIGGER ON public.messages.
--     Once 0089 runs, EVERY message insert raises "function does not exist".
--     Chat is completely broken. This is the important one.
--   * profile_social / profile_relations — the blue-tick lookups, which
--     would throw on every profile and conversation list.
--   * ranked_feed — the old post feed's ordering, now unreachable.
--
-- None of it showed up because no migration in this series has ever been run
-- against a database. Worth remembering when the staging run happens.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. The message trigger. Dropped outright rather than repaired: it was the
--    "free accounts can't DM paid members" gate, and there are no paid
--    members any more. Messaging is gated by credits now (0092), which is
--    enforced in spend_daily_message_credit() before the insert.
-- -------------------------------------------------------------------------
drop trigger if exists block_free_to_paid_dm on public.messages;
drop function if exists public.tg_block_free_to_paid_dm();

-- -------------------------------------------------------------------------
-- 2. Blue tick, without a subscription behind it.
--
-- profiles.is_verified already exists and is admin-set. The tick now means
-- "we checked who this is", which is what a tick should mean on a dating
-- app, rather than "this one pays us". Column name `is_subscriber` is kept
-- so every caller keeps compiling; it reads is_verified.
-- -------------------------------------------------------------------------
create or replace function public.profile_relations(ids uuid[])
returns table (id uuid, is_subscriber boolean, is_following boolean)
language sql stable security definer set search_path = public
as $$
  select
    p.id,
    coalesce(p.is_verified, false),
    exists (select 1 from public.follows f
             where f.follower_id = auth.uid() and f.following_id = p.id)
  from public.profiles p
  where p.id = any(ids);
$$;

-- NOTE the name: get_profile_social, not profile_social. That is what 0052
-- defines and what useFollow.ts calls. An earlier draft of this migration
-- created a correctly-written function under the wrong name, which fixed
-- nothing — the real one stayed broken and the new one was never called.
create or replace function public.get_profile_social(target uuid)
returns table (followers int, following int, is_following boolean, is_subscriber boolean)
language sql stable security definer set search_path = public
as $$
  select
    (select count(*)::int from public.follows f where f.following_id = target),
    (select count(*)::int from public.follows f where f.follower_id  = target),
    exists (select 1 from public.follows f
             where f.follower_id = auth.uid() and f.following_id = target),
    coalesce((select p.is_verified from public.profiles p where p.id = target), false);
$$;

grant execute on function public.get_profile_social(uuid) to authenticated;

-- The old ranked post feed. The public post feed went in Phase 0 and the
-- people feed (0091) replaced it; this only survived as a broken reference.
drop function if exists public.ranked_feed(int, timestamptz);
drop function if exists public.ranked_feed(int, int);
drop function if exists public.ranked_feed();

-- The real-time lobby's game-creation RPCs. Phase 0 removed every route into
-- them and Phase 5 replaced them with chat_games, but they survived here
-- still calling has_active_subscription() — so they were both dead AND
-- broken. Both overloads go.
drop function if exists public.create_game(text, integer);
drop function if exists public.create_game(text, integer, text);

-- -------------------------------------------------------------------------
-- 3. Subscriptions.
--
-- Functions go so nothing can create or renew one. The tables are left in
-- place, stripped of client access — see the note in step 5 about why the
-- historical rows are not being destroyed here.
-- -------------------------------------------------------------------------
drop function if exists public.subscribe(text, int);
drop function if exists public.subscribe(uuid, int);
drop function if exists public.expire_subscriptions();

-- Guarded on existence. `drop policy if exists ... on public.foo` guards the
-- POLICY, not the table — if the table is missing the statement still errors
-- and takes the whole migration with it. The schema these run against is not
-- guaranteed to match a clean 0001→0088 build, so every reference to a
-- pre-existing money table is checked first.
do $$
begin
  if to_regclass('public.subscription_plans') is not null then
    execute 'revoke all on public.subscription_plans from authenticated, anon';
    execute 'alter table public.subscription_plans enable row level security';
    execute 'drop policy if exists "subscription_plans_read" on public.subscription_plans';
    execute 'drop policy if exists "subscription_plans_public" on public.subscription_plans';
  end if;

  if to_regclass('public.user_subscriptions') is not null then
    execute 'revoke all on public.user_subscriptions from authenticated, anon';
    execute 'alter table public.user_subscriptions enable row level security';
    execute 'drop policy if exists "user_subscriptions_read" on public.user_subscriptions';
    execute 'drop policy if exists "subs_self_read" on public.user_subscriptions';
    execute 'comment on table public.user_subscriptions is ''ARCHIVE (0096). Paid tiers, discontinued. No client access. Retain for refunds/disputes; export before dropping.''';
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 4. The USD wallet: deposits, balances, ledger.
--
-- Credits replaced all of it (0092). ALATPay stays as the credit-purchase
-- rail via record_credit_purchase(), which never touches these tables.
-- -------------------------------------------------------------------------
drop function if exists public.create_deposit(numeric, text, numeric, text);
drop function if exists public.mark_deposit_paid(uuid, text, jsonb);
drop function if exists public.record_alatpay_deposit(text, numeric, numeric, text, boolean, jsonb);
drop function if exists public.credit_alatpay_deposit(uuid);
drop function if exists public._settle_alatpay(uuid);

-- CASCADE on the two trigger functions, because their triggers still hang off
-- deposits and ledger_entries. `drop function if exists` guards a missing
-- FUNCTION, not a dependent trigger, so without CASCADE this fails with
-- "cannot drop function ... because other objects depend on it".
--
-- Dropping the triggers with it is exactly the intent — the whole deposit and
-- USD-wallet feature is going — and CASCADE also spares us naming triggers on
-- tables that may not exist on every database this runs against.
drop function if exists public.tg_notify_deposit() cascade;
drop function if exists public.tg_bump_wallet() cascade;

drop view if exists public.my_transactions;

-- Same existence guard as above.
do $$
begin
  if to_regclass('public.wallets') is not null then
    execute 'revoke all on public.wallets from authenticated, anon';
    execute 'drop policy if exists "wallets_self_read" on public.wallets';
    execute 'comment on table public.wallets is ''ARCHIVE (0096). USD wallet from the pre-credit economy. No client access. Retain for refunds/disputes/accounting; export before dropping.''';
  end if;

  if to_regclass('public.ledger_entries') is not null then
    execute 'revoke all on public.ledger_entries from authenticated, anon';
    execute 'drop policy if exists "ledger_self_read" on public.ledger_entries';
    execute 'comment on table public.ledger_entries is ''ARCHIVE (0096). USD ledger from the pre-credit economy. No client access. Retain for refunds/disputes/accounting; export before dropping.''';
  end if;

  if to_regclass('public.deposits') is not null then
    execute 'revoke all on public.deposits from authenticated, anon';
    execute 'drop policy if exists "deposits_self_read" on public.deposits';
    execute 'comment on table public.deposits is ''ARCHIVE (0096). USD deposits from the pre-credit economy. No client access. Retain for refunds/disputes/accounting; export before dropping.''';
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 5. Why the money tables are retained rather than dropped.
--
-- wallets / ledger_entries / deposits / user_subscriptions hold the record
-- of real money that real users actually paid. Dropping them destroys the
-- only evidence behind any refund, chargeback or dispute, and accounting
-- will want them at year end. Nothing can read or write them any more — no
-- RPC, no policy, no grant — so they are inert from the app's point of view,
-- which is what "nothing that talks in money survives" asks for.
--
-- Export them and drop them as a deliberate, separate step once finance has
-- what it needs. That is a decision with a paper trail, not a side effect of
-- a restructure.
--
-- The ARCHIVE comments that mark them are set in the guarded blocks above,
-- alongside the revokes — a table that does not exist here cannot be
-- commented on either.
-- -------------------------------------------------------------------------

-- -------------------------------------------------------------------------
-- 6. Gifts: free, cosmetic, and they grant nothing.
--
-- No price and no escrow, so there is no accept/reject step — a gift is just
-- delivered. The catalogue stays; only the money leaves.
-- -------------------------------------------------------------------------
drop function if exists public.respond_gift(uuid, boolean);
drop function if exists public.respond_gift(uuid, text);
drop function if exists public.tg_notify_gift_response() cascade;   -- its trigger on post_gifts goes with it

alter table public.post_gifts
  drop column if exists amount_cents;

alter table public.post_gifts
  drop constraint if exists post_gifts_status_check;

-- Existing pending/accepted rows all become 'sent'; rejected ones stay as a
-- record that it happened.
update public.post_gifts
   set status = 'sent'
 where status in ('pending', 'accepted', 'failed');

alter table public.post_gifts
  add constraint post_gifts_status_check check (status in ('sent', 'rejected'));

alter table public.post_gifts
  alter column status set default 'sent';

create or replace function public.send_gift(
  p_post_id    uuid,
  p_gift_id    text,
  p_gift_name  text,
  p_gift_image text
) returns public.post_gifts
language plpgsql security definer set search_path = public
as $$
declare
  me        uuid := auth.uid();
  recipient uuid;
  row       public.post_gifts;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select p.author_id into recipient from public.posts p where p.id = p_post_id;
  if recipient is null then raise exception 'no such post'; end if;
  if recipient = me then raise exception 'you cannot gift your own post'; end if;

  insert into public.post_gifts (post_id, sender_id, recipient_id,
                                 gift_id, gift_name, gift_image, status)
       values (p_post_id, me, recipient,
               p_gift_id, p_gift_name, p_gift_image, 'sent')
    returning * into row;

  -- Deliberately NO credit grant. Gifts are cosmetic; crediting the
  -- recipient would let two accounts gift each other free messaging for ever.
  insert into public.notifications (user_id, actor_id, type, post_id, body)
       values (recipient, me, 'gift', p_post_id, p_gift_name);

  return row;
end $$;

grant execute on function public.send_gift(uuid, text, text, text) to authenticated;

-- -------------------------------------------------------------------------
-- 7. 'gift_received' out of the credit ledger kinds.
--
-- This is the loophole closed at the type level: even a future mistake
-- cannot write a credit grant for a gift, because the value no longer
-- exists. Any historical row becomes admin_adjust with its origin noted;
-- balances are untouched.
-- -------------------------------------------------------------------------
update public.coin_ledger
   set note = concat('[gift_received] ', coalesce(note, ''))
 where kind = 'gift_received';

alter type public.coin_kind rename to coin_kind_old_0096;

create type public.coin_kind as enum (
  'signup_grant',
  'message_day',
  'purchase',
  'admin_adjust'
);

-- apply_coins takes the enum as a parameter, so it depends on the type and
-- has to be dropped before the rebuild and re-created after.
drop function if exists public.apply_coins(uuid, int, public.coin_kind_old_0096, text, uuid, text);

alter table public.coin_ledger
  alter column kind type public.coin_kind
  using (
    case
      when kind::text in ('signup_grant', 'message_day', 'purchase')
        then kind::text
      else 'admin_adjust'
    end
  )::public.coin_kind;

drop type public.coin_kind_old_0096;

create function public.apply_coins(
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
