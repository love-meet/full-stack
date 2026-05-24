-- M7 — payments + withdrawals + subscriptions.
--
-- This migration ships the SCHEMA and the ledger plumbing. The actual
-- payment integrations (Wema bank-transfer confirmation, Flutterwave
-- callbacks, CCPayment USDT-TRC20) live in Supabase Edge Functions
-- under supabase/functions/payment-*; this file just exposes the rows
-- those functions read/write, plus the RPCs the client calls, plus the
-- triggers that translate provider events into ledger entries.

-- =========================================================================
-- subscription_plans — three SKUs the user can buy. Seeded below.
-- =========================================================================
create table if not exists public.subscription_plans (
  id              text primary key,
  name            text not null,
  description     text,
  duration_days   int  not null check (duration_days > 0),
  price_usdt      numeric(20, 6) not null check (price_usdt > 0),
  features        jsonb not null default '[]'::jsonb,
  active          bool not null default true,
  sort_order      int  not null default 0,
  created_at      timestamptz not null default now()
);

insert into public.subscription_plans (id, name, duration_days, price_usdt, features, sort_order) values
  ('lite_30',    'Lite',     30,  4.99,  '["No ads", "Send unlimited gifts"]'::jsonb, 1),
  ('pro_90',     'Pro',      90,  11.99, '["Lite features", "Priority feed boost", "Stealth read receipts"]'::jsonb, 2),
  ('premium_365','Premium',  365, 39.99, '["Pro features", "Verified badge", "See who liked you", "Voice + video unlimited"]'::jsonb, 3)
on conflict (id) do nothing;

-- =========================================================================
-- user_subscriptions — current and past subscriptions per user.
-- One ACTIVE row per user max; a UNIQUE partial index enforces that.
-- =========================================================================
do $$ begin
  create type public.subscription_status as enum ('active', 'expired', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists public.user_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  plan_id       text not null references public.subscription_plans(id),
  status        public.subscription_status not null default 'active',
  started_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  paid_with_deposit uuid,   -- FK below after deposits exists
  created_at    timestamptz not null default now()
);

create unique index if not exists one_active_subscription_per_user
  on public.user_subscriptions (user_id)
  where status = 'active';

create index if not exists user_subscriptions_user_idx on public.user_subscriptions (user_id);

-- =========================================================================
-- deposits — every "I want to put money in" event. Created in 'pending',
-- moves to 'paid' when the provider confirms (via webhook or admin
-- approval), or 'failed'/'cancelled'.
-- =========================================================================
do $$ begin
  create type public.payment_provider as enum ('wema', 'flutterwave', 'ccpayment', 'manual');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.deposit_status as enum ('pending', 'paid', 'failed', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists public.deposits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  amount_usdt     numeric(20, 6) not null check (amount_usdt > 0),
  amount_local    numeric(20, 6),
  currency_local  text,          -- 'NGN', 'USD', 'USDT', etc.
  provider        public.payment_provider not null,
  provider_ref    text,          -- provider's transaction reference
  status          public.deposit_status not null default 'pending',
  paid_at         timestamptz,
  webhook_payload jsonb,
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists deposits_user_idx     on public.deposits (user_id);
create index if not exists deposits_status_idx   on public.deposits (status);
create index if not exists deposits_provider_ref_idx on public.deposits (provider_ref);

-- Close the loop: user_subscriptions.paid_with_deposit references this.
alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_paid_with_deposit_fkey;
alter table public.user_subscriptions
  add constraint user_subscriptions_paid_with_deposit_fkey
  foreign key (paid_with_deposit) references public.deposits(id) on delete set null;

-- =========================================================================
-- withdrawal_requests — user wants USDT out. Funds are LOCKED at request
-- time via a 'withdrawal' ledger debit, so the balance check is just the
-- existing wallets.balance_usdt. Admin approval moves status to 'approved';
-- once the on-chain TX lands, an admin (or a webhook) flips it to 'sent'.
-- Rejection refunds the debit via a paired credit.
-- =========================================================================
do $$ begin
  create type public.withdrawal_status as enum (
    'pending', 'approved', 'sent', 'rejected', 'failed'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.withdrawal_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  amount_usdt     numeric(20, 6) not null check (amount_usdt > 0),
  destination     text not null,             -- TRC-20 wallet address
  status          public.withdrawal_status not null default 'pending',
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  sent_tx_hash    text,
  reject_reason   text,
  created_at      timestamptz not null default now()
);

create index if not exists withdrawals_user_idx   on public.withdrawal_requests (user_id);
create index if not exists withdrawals_status_idx on public.withdrawal_requests (status);

-- =========================================================================
-- RPC: create_deposit(amount_usdt, provider, amount_local?, currency_local?)
-- Just inserts the pending row. The actual provider-specific work (return
-- a checkout URL, a bank account number, a USDT address) lives in the
-- payment-init Edge Function which reads this row.
-- =========================================================================
create or replace function public.create_deposit(
  amount_usdt    numeric,
  provider       public.payment_provider,
  amount_local   numeric default null,
  currency_local text   default null
)
returns public.deposits
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.deposits;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if amount_usdt is null or amount_usdt <= 0 then
    raise exception 'amount must be > 0';
  end if;

  insert into public.deposits (user_id, amount_usdt, amount_local, currency_local, provider)
       values (me, amount_usdt, amount_local, currency_local, provider)
    returning * into row;

  return row;
end $$;

grant execute on function public.create_deposit(numeric, public.payment_provider, numeric, text) to authenticated;

-- =========================================================================
-- RPC: mark_deposit_paid(deposit_id, provider_ref?) — admin or webhook
-- only. Flips status to 'paid' and writes the matching ledger credit.
-- =========================================================================
create or replace function public.mark_deposit_paid(
  deposit_id   uuid,
  ref          text default null,
  payload      jsonb default null
)
returns public.deposits
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  is_admin bool;
  row public.deposits;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select coalesce(role in ('admin','super_admin'), false)
    into is_admin from public.profiles where id = me;
  if not is_admin then raise exception 'admin only'; end if;

  update public.deposits
     set status          = 'paid',
         paid_at         = now(),
         provider_ref    = coalesce(ref, provider_ref),
         webhook_payload = coalesce(payload, webhook_payload)
   where id = deposit_id
     and status = 'pending'
  returning * into row;

  if row.id is null then raise exception 'deposit not pending'; end if;

  -- Credit the user's wallet via the ledger.
  insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
       values (row.user_id, 'deposit', 'credit', row.amount_usdt, 'deposits', row.id,
               concat('Deposit via ', row.provider::text));

  return row;
end $$;

grant execute on function public.mark_deposit_paid(uuid, text, jsonb) to authenticated;

-- =========================================================================
-- RPC: request_withdrawal(amount_usdt, destination)
-- - Locks the funds immediately by writing a ledger debit.
-- - Creates a 'pending' withdrawal_requests row.
-- - If balance is insufficient, raises before the lock.
-- =========================================================================
create or replace function public.request_withdrawal(
  amount_usdt numeric,
  destination text
)
returns public.withdrawal_requests
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  balance numeric;
  row public.withdrawal_requests;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if amount_usdt is null or amount_usdt <= 0 then
    raise exception 'amount must be > 0';
  end if;
  if destination is null or length(trim(destination)) < 30 then
    raise exception 'invalid destination address';
  end if;

  select coalesce(balance_usdt, 0) into balance
    from public.wallets where user_id = me;
  if balance is null or balance < amount_usdt then
    raise exception 'insufficient balance';
  end if;

  insert into public.withdrawal_requests (user_id, amount_usdt, destination)
       values (me, amount_usdt, trim(destination))
    returning * into row;

  -- Lock the funds now — admins flip status, ledger already debited.
  insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
       values (me, 'withdrawal', 'debit', amount_usdt, 'withdrawal_requests', row.id,
               concat('Withdrawal request to ', substring(row.destination from 1 for 10), '…'));

  return row;
end $$;

grant execute on function public.request_withdrawal(numeric, text) to authenticated;

-- =========================================================================
-- RPCs the admin payout-approval screen uses.
-- =========================================================================
create or replace function public.approve_withdrawal(req_id uuid)
returns public.withdrawal_requests
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  is_admin bool;
  row public.withdrawal_requests;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select coalesce(role in ('admin','super_admin'), false) into is_admin
    from public.profiles where id = me;
  if not is_admin then raise exception 'admin only'; end if;

  update public.withdrawal_requests
     set status = 'approved', reviewed_by = me, reviewed_at = now()
   where id = req_id and status = 'pending'
  returning * into row;
  if row.id is null then raise exception 'withdrawal not pending'; end if;
  return row;
end $$;

grant execute on function public.approve_withdrawal(uuid) to authenticated;

create or replace function public.mark_withdrawal_sent(req_id uuid, tx_hash text)
returns public.withdrawal_requests
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  is_admin bool;
  row public.withdrawal_requests;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select coalesce(role in ('admin','super_admin'), false) into is_admin
    from public.profiles where id = me;
  if not is_admin then raise exception 'admin only'; end if;

  update public.withdrawal_requests
     set status = 'sent', sent_tx_hash = tx_hash, reviewed_by = me, reviewed_at = now()
   where id = req_id and status in ('approved','pending')
  returning * into row;
  if row.id is null then raise exception 'withdrawal not in a sendable state'; end if;
  return row;
end $$;

grant execute on function public.mark_withdrawal_sent(uuid, text) to authenticated;

create or replace function public.reject_withdrawal(req_id uuid, reason text)
returns public.withdrawal_requests
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  is_admin bool;
  row public.withdrawal_requests;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select coalesce(role in ('admin','super_admin'), false) into is_admin
    from public.profiles where id = me;
  if not is_admin then raise exception 'admin only'; end if;

  update public.withdrawal_requests
     set status = 'rejected', reviewed_by = me, reviewed_at = now(), reject_reason = reason
   where id = req_id and status in ('pending','approved')
  returning * into row;
  if row.id is null then raise exception 'withdrawal not refundable'; end if;

  -- Refund the locked balance with a paired credit entry.
  insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
       values (row.user_id, 'adjustment', 'credit', row.amount_usdt, 'withdrawal_requests', row.id,
               concat('Refund for rejected withdrawal: ', coalesce(reason, 'no reason given')));

  return row;
end $$;

grant execute on function public.reject_withdrawal(uuid, text) to authenticated;

-- =========================================================================
-- RPC: subscribe(plan_id) — uses your existing wallet balance to buy a
-- subscription. Atomic: debit ledger + insert user_subscriptions in one
-- function. The "Buy with cash" path goes deposit → wallet credit →
-- subscribe(), so there's exactly one place that writes subscriptions.
-- =========================================================================
create or replace function public.subscribe(plan_id text)
returns public.user_subscriptions
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  pl public.subscription_plans;
  balance numeric;
  row public.user_subscriptions;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select * into pl from public.subscription_plans where id = plan_id and active;
  if pl.id is null then raise exception 'plan not found'; end if;

  select coalesce(balance_usdt, 0) into balance from public.wallets where user_id = me;
  if balance is null or balance < pl.price_usdt then
    raise exception 'insufficient balance';
  end if;

  -- Cancel any existing active sub for cleanliness — only one active at a time.
  update public.user_subscriptions
     set status = 'cancelled'
   where user_id = me and status = 'active';

  insert into public.user_subscriptions (user_id, plan_id, expires_at)
       values (me, plan_id, now() + (pl.duration_days || ' days')::interval)
    returning * into row;

  insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
       values (me, 'adjustment', 'debit', pl.price_usdt, 'user_subscriptions', row.id,
               concat('Subscribed to ', pl.name));

  return row;
end $$;

grant execute on function public.subscribe(text) to authenticated;

-- =========================================================================
-- RLS — users see their own deposits + withdrawals + subscriptions;
-- subscription_plans is public-readable.
-- =========================================================================
alter table public.deposits             enable row level security;
alter table public.withdrawal_requests  enable row level security;
alter table public.user_subscriptions   enable row level security;
alter table public.subscription_plans   enable row level security;

drop policy if exists "deposits_self_read" on public.deposits;
create policy "deposits_self_read" on public.deposits
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles
                where id = auth.uid() and role in ('admin','super_admin'))
  );

drop policy if exists "withdrawals_self_read" on public.withdrawal_requests;
create policy "withdrawals_self_read" on public.withdrawal_requests
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles
                where id = auth.uid() and role in ('admin','super_admin'))
  );

drop policy if exists "subs_self_read" on public.user_subscriptions;
create policy "subs_self_read" on public.user_subscriptions
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles
                where id = auth.uid() and role in ('admin','super_admin'))
  );

drop policy if exists "plans_public_read" on public.subscription_plans;
create policy "plans_public_read" on public.subscription_plans
  for select to authenticated using (true);

-- Direct client writes denied everywhere — all flows go through the
-- SECURITY DEFINER RPCs above.
drop policy if exists "deposits_no_client_write" on public.deposits;
create policy "deposits_no_client_write" on public.deposits
  for insert to authenticated with check (false);

drop policy if exists "withdrawals_no_client_write" on public.withdrawal_requests;
create policy "withdrawals_no_client_write" on public.withdrawal_requests
  for insert to authenticated with check (false);

drop policy if exists "subs_no_client_write" on public.user_subscriptions;
create policy "subs_no_client_write" on public.user_subscriptions
  for insert to authenticated with check (false);

-- Realtime so the wallet UI updates instantly when an admin marks paid.
alter publication supabase_realtime add table public.deposits;
alter publication supabase_realtime add table public.withdrawal_requests;
alter publication supabase_realtime add table public.user_subscriptions;
