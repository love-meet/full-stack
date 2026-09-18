-- =========================================================================
-- 0092 — the credit economy (§2), and the notifications §6 asks for.
--
-- Reworks 0088 forward; 0088 itself is untouched and the ledger stays
-- append-only.
--
--   Purchase        $2 = 2,000 credits
--   Messaging       100 credits on the FIRST message sent in a day
--   After that      unlimited messages, all chats, rest of the day, free
--   Inactive day    costs nothing — no decay, no daily refill
--   Games           free: no entry cost, no winnings, no rewards
--   New signup      1,000 credits
--   Existing users  1,000 credits, backfilled once
--
-- 2,000 credits = 20 active chatting days. The signup grant = 10 free days.
-- Credits are non-cashable and non-transferable to money. Ever.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. What the old economy paid out, and no longer does.
-- -------------------------------------------------------------------------
drop function if exists public.award_game_win(uuid, uuid);   -- games pay nothing
drop function if exists public.claim_daily_coins();          -- no free refill

alter table public.profiles drop column if exists last_daily_coins_at;

-- apply_coins takes coin_kind as a parameter, so it depends on the type and
-- would block the rebuild below. Dropped here against the OLD type name and
-- re-created against the new one in step 2.
drop function if exists public.apply_coins(uuid, int, public.coin_kind, text, uuid, text);

-- -------------------------------------------------------------------------
-- 2. Ledger kinds. game_win / daily_refill / game_entry described an economy
--    that no longer exists; message_day is the one that matters now.
--
--    Postgres can't remove enum values in place, so the type is rebuilt.
--    Existing rows in a dropped kind become 'admin_adjust' with the original
--    kind kept in the note — deltas and balances are untouched.
-- -------------------------------------------------------------------------
update public.coin_ledger
   set note = concat('[', kind::text, '] ', coalesce(note, ''))
 where kind in ('game_win', 'daily_refill', 'game_entry');

alter type public.coin_kind rename to coin_kind_old;

create type public.coin_kind as enum (
  'signup_grant',   -- 1,000 on account creation
  'message_day',    -- -100, the first message sent on a given day
  'purchase',       -- bought via IAP / ALATPay
  'gift_received',  -- a few credits for receiving a (free) gift
  'admin_adjust'    -- manual correction
);

alter table public.coin_ledger
  alter column kind type public.coin_kind
  using (
    case
      when kind::text in ('signup_grant', 'purchase', 'gift_received')
        then kind::text
      else 'admin_adjust'
    end
  )::public.coin_kind;

drop type public.coin_kind_old;

-- Re-created against the new type. Body is unchanged from 0088: still the one
-- place credits move, still clamped at 0, still internal-only (no grant).
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

-- -------------------------------------------------------------------------
-- 3. The signup grant.
--
-- 0088 handed out 100 via a column default, which left no ledger row. The
-- grant is a function now so the history is complete, and a trigger fires it
-- on profile creation.
-- -------------------------------------------------------------------------
alter table public.profiles alter column coins set default 0;

create or replace function public.grant_signup_credits(p_user uuid default null)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  target uuid := coalesce(p_user, auth.uid());
  bal    int;
begin
  if target is null then raise exception 'not authenticated'; end if;

  -- Once, ever. The ledger row is the record that it happened.
  if exists (
    select 1 from public.coin_ledger cl
     where cl.user_id = target and cl.kind = 'signup_grant'
  ) then
    select p.coins into bal from public.profiles p where p.id = target;
    return coalesce(bal, 0);
  end if;

  return public.apply_coins(target, 1000, 'signup_grant', null, null,
                            'Welcome — 1,000 credits');
end $$;

grant execute on function public.grant_signup_credits(uuid) to authenticated;

create or replace function public.tg_grant_signup_credits()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform public.grant_signup_credits(new.id);
  return new;
end $$;

drop trigger if exists grant_signup_credits_on_profile on public.profiles;
create trigger grant_signup_credits_on_profile
  after insert on public.profiles
  for each row execute function public.tg_grant_signup_credits();

-- -------------------------------------------------------------------------
-- 4. Backfill — 1,000 to every existing profile, exactly once.
--
-- The 100 coins 0088 handed out belong to an economy that no longer exists,
-- so they are reversed first and everyone lands on exactly 1,000. Both moves
-- leave a ledger row. Guarded by the signup_grant row, so re-running this
-- migration grants nobody a second time.
-- -------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.id, p.coins
      from public.profiles p
     where not exists (
       select 1 from public.coin_ledger cl
        where cl.user_id = p.id and cl.kind = 'signup_grant'
     )
  loop
    if r.coins <> 0 then
      perform public.apply_coins(r.id, -r.coins, 'admin_adjust', null, null,
                                 'Reset from the pre-credit coin balance');
    end if;
    perform public.grant_signup_credits(r.id);
  end loop;
end $$;

-- -------------------------------------------------------------------------
-- 5. spend_daily_message_credit — the whole billing model.
--
--   * already charged today  → succeed, charge nothing
--   * else balance >= 100    → deduct 100, stamp the date, succeed
--   * else                   → fail with insufficient_credits
--
-- Idempotent per user per day, and enforced here rather than in the client.
-- The FOR UPDATE is what makes it idempotent under concurrency: two messages
-- fired at once from two devices serialise on the profile row, so the second
-- sees the stamped date and charges nothing.
--
-- The day is UTC so the boundary is the same for everyone and does not move
-- when a user travels.
-- -------------------------------------------------------------------------
alter table public.profiles
  add column if not exists last_message_charge_on date;

comment on column public.profiles.last_message_charge_on is
  'UTC date of the last messaging charge. One charge per user per day; set only by spend_daily_message_credit().';

create or replace function public.spend_daily_message_credit()
returns table (balance int, charged boolean)
language plpgsql security definer set search_path = public
as $$
declare
  me      uuid := auth.uid();
  today   date := (now() at time zone 'utc')::date;
  cur     int;
  last_on date;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select p.coins, p.last_message_charge_on
    into cur, last_on
    from public.profiles p
   where p.id = me
     for update;

  if cur is null then raise exception 'profile not found'; end if;

  -- Already paid for today. Unlimited messages, all chats, no further cost.
  if last_on = today then
    return query select cur, false;
    return;
  end if;

  if cur < 100 then
    raise exception 'insufficient_credits';
  end if;

  update public.profiles set last_message_charge_on = today where id = me;
  cur := public.apply_coins(me, -100, 'message_day', null, null,
                            concat('Messaging — ', today::text));

  return query select cur, true;
end $$;

grant execute on function public.spend_daily_message_credit() to authenticated;

-- -------------------------------------------------------------------------
-- 6. Buying credits. $2 = 2,000, so 1,000 credits per USD.
--
-- A separate rail from the USD `deposits` table on purpose: that one still
-- funds subscriptions and gifts, which are outside this restructure. Credits
-- never touch wallets.balance_usdt, and there is no path back out.
-- -------------------------------------------------------------------------
create table if not exists public.credit_purchases (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  transaction_id text not null unique,
  amount_usd     numeric(20, 2) not null check (amount_usd > 0),
  credits        int not null check (credits > 0),
  status         text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  payload        jsonb,
  created_at     timestamptz not null default now(),
  paid_at        timestamptz
);

create index if not exists credit_purchases_user_idx on public.credit_purchases (user_id, created_at desc);

alter table public.credit_purchases enable row level security;

drop policy if exists "credit_purchases_self_read" on public.credit_purchases;
create policy "credit_purchases_self_read" on public.credit_purchases
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "credit_purchases_no_client_write" on public.credit_purchases;
create policy "credit_purchases_no_client_write" on public.credit_purchases
  for insert to authenticated with check (false);

-- Parameters are p_-prefixed so none of them shadow a credit_purchases column.
create or replace function public.record_credit_purchase(
  p_transaction_id text,
  p_amount_usd     numeric,
  p_completed      boolean,
  p_payload        jsonb default null
) returns int
language plpgsql security definer set search_path = public
as $$
declare
  me       uuid := auth.uid();
  n        int;
  existing public.credit_purchases;
  bal      int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_transaction_id is null or btrim(p_transaction_id) = '' then
    raise exception 'transaction_id required';
  end if;
  if p_amount_usd is null or p_amount_usd <= 0 then raise exception 'amount must be > 0'; end if;

  n := floor(p_amount_usd * 1000)::int;   -- $2 = 2,000 credits
  if n <= 0 then raise exception 'amount too small'; end if;

  -- Idempotent on the provider's transaction id: re-firing the callback, or a
  -- webhook arriving after it, must not credit twice.
  select cp.* into existing
    from public.credit_purchases cp
   where cp.transaction_id = btrim(p_transaction_id)
     for update;

  if existing.id is not null then
    -- Already credited, or still not completed — either way, no new credits.
    if existing.status = 'paid' or not p_completed then
      select p.coins into bal from public.profiles p where p.id = me;
      return coalesce(bal, 0);
    end if;
    update public.credit_purchases cp
       set status  = 'paid',
           paid_at = now(),
           payload = coalesce(p_payload, cp.payload)
     where cp.id = existing.id;
    return public.apply_coins(existing.user_id, existing.credits, 'purchase',
                              'credit_purchases', existing.id,
                              concat('Bought ', existing.credits, ' credits'));
  end if;

  insert into public.credit_purchases (user_id, transaction_id, amount_usd, credits, status, payload, paid_at)
       values (me, btrim(p_transaction_id), p_amount_usd, n,
               case when p_completed then 'paid' else 'pending' end,
               p_payload,
               case when p_completed then now() else null end)
    returning * into existing;

  if not p_completed then
    select p.coins into bal from public.profiles p where p.id = me;
    return coalesce(bal, 0);
  end if;

  return public.apply_coins(me, n, 'purchase', 'credit_purchases', existing.id,
                            concat('Bought ', n, ' credits'));
end $$;

grant execute on function public.record_credit_purchase(text, numeric, boolean, jsonb) to authenticated;

-- -------------------------------------------------------------------------
-- 7. Notifications: profile viewed (§6).
--
-- "New message" (chat_message) and "game invite" (game_invite) already exist.
-- "Game round played" is wired in Phase 5, when games move into chat — the
-- per-round machinery today belongs to the real-time lobby that Phase 0
-- removed.
--
-- One row per (viewer, viewed) pair, so repeat visits update rather than
-- accumulate, and the notification fires at most once a day per pair — a
-- profile view is a nice signal, not a reason to buzz someone's phone every
-- time you scroll back.
-- -------------------------------------------------------------------------
create table if not exists public.profile_views (
  viewer_id        uuid not null references public.profiles(id) on delete cascade,
  viewed_id        uuid not null references public.profiles(id) on delete cascade,
  viewed_at        timestamptz not null default now(),
  last_notified_at timestamptz,
  primary key (viewer_id, viewed_id),
  check (viewer_id <> viewed_id)
);

create index if not exists profile_views_viewed_idx on public.profile_views (viewed_id, viewed_at desc);

alter table public.profile_views enable row level security;

drop policy if exists "profile_views_self_read" on public.profile_views;
create policy "profile_views_self_read" on public.profile_views
  for select to authenticated using (viewed_id = auth.uid());

drop policy if exists "profile_views_no_client_write" on public.profile_views;
create policy "profile_views_no_client_write" on public.profile_views
  for insert to authenticated with check (false);

create or replace function public.record_profile_view(p_viewed uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me     uuid := auth.uid();
  last_n timestamptz;
  should boolean;
begin
  if me is null or p_viewed is null or me = p_viewed then return; end if;

  -- Don't tell someone they were viewed by a person they blocked, or who
  -- blocked them.
  if exists (
    select 1 from public.user_blocks b
     where (b.blocker_id = me and b.blocked_id = p_viewed)
        or (b.blocker_id = p_viewed and b.blocked_id = me)
  ) then
    return;
  end if;

  -- Decided before the upsert rather than inside ON CONFLICT: the conflict
  -- clause can only see `excluded` and the bare table name, and working out
  -- "did we just notify?" from RETURNING there is more subtle than it looks.
  select pv.last_notified_at into last_n
    from public.profile_views pv
   where pv.viewer_id = me and pv.viewed_id = p_viewed
     for update;

  should := last_n is null or last_n < now() - interval '24 hours';

  insert into public.profile_views (viewer_id, viewed_id, viewed_at, last_notified_at)
       values (me, p_viewed, now(), case when should then now() else last_n end)
  on conflict (viewer_id, viewed_id) do update
          set viewed_at        = excluded.viewed_at,
              last_notified_at = excluded.last_notified_at;

  if should then
    insert into public.notifications (user_id, actor_id, type, body)
         values (p_viewed, me, 'profile_viewed', null);
  end if;
end $$;

grant execute on function public.record_profile_view(uuid) to authenticated;
