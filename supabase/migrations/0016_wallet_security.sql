-- M7 lite — wallets, ledger, PINs, and the close-account stub.
-- This is the part of the payments stack that doesn't need any payment
-- provider wired in yet: an append-only USDT ledger + a cached balance
-- table + a per-user PIN + a soft-delete column on profiles. The
-- close-account Edge Function (supabase/functions/delete-account) calls
-- auth.admin.deleteUser to hard-delete; this migration only flags the row.

-- =========================================================================
-- wallets — cached per-user balance, source of truth for the chip in
-- Settings and the Wallet screen header. Recomputed by a trigger when a
-- new ledger entry lands.
-- =========================================================================
create table if not exists public.wallets (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  balance_usdt  numeric(20, 6) not null default 0,
  updated_at    timestamptz not null default now()
);

-- =========================================================================
-- ledger_entries — append-only. Every credit/debit on a user's wallet
-- gets one row. Reference back to whatever produced the entry (a gift,
-- a deposit, a withdrawal) via ref_table + ref_id.
-- =========================================================================
do $$ begin
  create type public.ledger_kind as enum (
    'gift_sent',
    'gift_received',
    'tip_sent',
    'tip_received',
    'referral_bonus',
    'deposit',
    'withdrawal',
    'adjustment'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.ledger_direction as enum ('credit', 'debit');
exception when duplicate_object then null;
end $$;

create table if not exists public.ledger_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kind         public.ledger_kind not null,
  direction    public.ledger_direction not null,
  amount_usdt  numeric(20, 6) not null check (amount_usdt > 0),
  ref_table    text,
  ref_id       uuid,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists ledger_user_created_idx
  on public.ledger_entries (user_id, created_at desc);

-- Bump the wallet on every entry. Trigger function runs as SECURITY DEFINER
-- so it can update the wallets row even though the row owner (auth.uid())
-- has no UPDATE policy on `wallets` from the client.
create or replace function public.tg_bump_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (user_id, balance_usdt, updated_at)
       values (new.user_id, 0, now())
  on conflict (user_id) do nothing;

  update public.wallets
     set balance_usdt = balance_usdt + (
           case when new.direction = 'credit' then new.amount_usdt
                else -new.amount_usdt
           end
         ),
         updated_at = now()
   where user_id = new.user_id;

  return new;
end $$;

drop trigger if exists ledger_bump_wallet on public.ledger_entries;
create trigger ledger_bump_wallet
  after insert on public.ledger_entries
  for each row execute function public.tg_bump_wallet();

-- =========================================================================
-- account_pins — per-user 4-6 digit PIN. We never ship raw PINs over the
-- wire to the client; the verify_pin RPC compares hashes server-side.
-- =========================================================================
create extension if not exists pgcrypto;

create table if not exists public.account_pins (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  pin_hash   text not null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_pin(new_pin text)
returns void
language plpgsql security definer set search_path = public
as $$
declare my_id uuid := auth.uid();
begin
  if my_id is null then raise exception 'not authenticated'; end if;
  if new_pin !~ '^\d{4,6}$' then raise exception 'PIN must be 4 to 6 digits'; end if;

  insert into public.account_pins (user_id, pin_hash, updated_at)
       values (my_id, crypt(new_pin, gen_salt('bf', 8)), now())
  on conflict (user_id) do update
       set pin_hash = excluded.pin_hash,
           updated_at = now();
end $$;

grant execute on function public.set_pin(text) to authenticated;

create or replace function public.verify_pin(candidate text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  my_id uuid := auth.uid();
  stored text;
begin
  if my_id is null then raise exception 'not authenticated'; end if;
  select pin_hash into stored from public.account_pins where user_id = my_id;
  if stored is null then return false; end if;
  return stored = crypt(candidate, stored);
end $$;

grant execute on function public.verify_pin(text) to authenticated;

create or replace function public.has_pin()
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (select 1 from public.account_pins where user_id = auth.uid())
$$;

grant execute on function public.has_pin() to authenticated;

-- =========================================================================
-- Soft-delete marker on profiles for the close-account flow. The actual
-- auth row gets removed by the Edge Function; this column is for any
-- pre-existing data we want to scrub or any in-flight cleanup jobs.
-- =========================================================================
alter table public.profiles
  add column if not exists deleted_at timestamptz;

create index if not exists profiles_deleted_at_idx
  on public.profiles (deleted_at)
  where deleted_at is not null;

-- =========================================================================
-- RLS — users can read their own wallet + ledger and nothing else.
-- Inserts to ledger come from SECURITY DEFINER functions that wrap the
-- domain operations (e.g. send_gift writes the matching pair of entries
-- and is already in place from M3++). Direct client inserts are denied.
-- =========================================================================
alter table public.wallets         enable row level security;
alter table public.ledger_entries  enable row level security;
alter table public.account_pins    enable row level security;

drop policy if exists "wallet_self_read" on public.wallets;
create policy "wallet_self_read" on public.wallets
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "ledger_self_read" on public.ledger_entries;
create policy "ledger_self_read" on public.ledger_entries
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "ledger_no_client_insert" on public.ledger_entries;
create policy "ledger_no_client_insert" on public.ledger_entries
  for insert to authenticated with check (false);

drop policy if exists "pins_self_read" on public.account_pins;
create policy "pins_self_read" on public.account_pins
  for select to authenticated using (user_id = auth.uid());

-- account_pins is only written via set_pin (SECURITY DEFINER), so no
-- client INSERT/UPDATE policies — RLS denies them by default.

-- Make wallets visible in realtime so the chip animates when a gift lands.
alter publication supabase_realtime add table public.wallets;
alter publication supabase_realtime add table public.ledger_entries;
