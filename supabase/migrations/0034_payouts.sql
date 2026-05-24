-- Withdrawals to a local bank account (replaces the TRC-20 crypto destination).
--
-- Flow:
--   1. User saves payout (bank) details.
--   2. A 3-day cooling-off period starts (anti-fraud); they can't withdraw
--      until it elapses. Changing the details restarts the clock.
--   3. Withdrawing creates a 'pending' request for admins, locking the USD
--      amount via a ledger debit (so the withdrawable earnings drop at once).
--   4. Admin approves → mark sent; reject → the lock is refunded.
--
-- The wallet is USD-based; the user withdraws an amount in their local
-- currency, which we convert to USD for the ledger and keep the local
-- figure + currency for the admin to pay the bank.

-- =========================================================================
-- payout_accounts — one bank account per user.
-- =========================================================================
create table if not exists public.payout_accounts (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  account_name   text not null,
  bank_name      text not null,
  account_number text not null,
  bank_code      text,
  country_code   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Withdrawals are blocked until now() >= eligible_at (set to +3 days on
  -- every insert/update by the trigger below).
  eligible_at    timestamptz not null default now() + interval '3 days'
);

create or replace function public.tg_payout_cooldown()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.eligible_at := now() + interval '3 days';
  return new;
end $$;

drop trigger if exists payout_accounts_cooldown on public.payout_accounts;
create trigger payout_accounts_cooldown
  before insert or update on public.payout_accounts
  for each row execute function public.tg_payout_cooldown();

alter table public.payout_accounts enable row level security;

drop policy if exists "payout_accounts_select" on public.payout_accounts;
create policy "payout_accounts_select" on public.payout_accounts
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "payout_accounts_upsert" on public.payout_accounts;
create policy "payout_accounts_upsert" on public.payout_accounts
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "payout_accounts_update" on public.payout_accounts;
create policy "payout_accounts_update" on public.payout_accounts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- withdrawal_requests — record the local payout amount + currency so the
-- admin knows exactly what to send to the bank.
-- =========================================================================
alter table public.withdrawal_requests
  add column if not exists payout_amount_local numeric(20, 6),
  add column if not exists payout_currency     text;

-- =========================================================================
-- request_withdrawal — now uses the saved bank account + 3-day gate, and
-- takes the USD amount (ledger) plus the local amount/currency to pay.
-- =========================================================================
drop function if exists public.request_withdrawal(numeric, text);

create or replace function public.request_withdrawal(
  amount_usd     numeric,
  amount_local   numeric,
  currency_local text
)
returns public.withdrawal_requests
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  acct public.payout_accounts;
  withdrawable numeric;
  snapshot text;
  row public.withdrawal_requests;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if amount_usd is null or amount_usd <= 0 then raise exception 'amount must be > 0'; end if;

  select * into acct from public.payout_accounts where user_id = me;
  if acct.user_id is null then
    raise exception 'add your payout bank details first';
  end if;
  if acct.eligible_at > now() then
    raise exception 'your payout details are still in the 3-day verification window';
  end if;

  withdrawable := public.my_withdrawable();
  if withdrawable < amount_usd then
    raise exception 'amount exceeds withdrawable earnings';
  end if;

  snapshot := concat(acct.account_name, ' · ', acct.bank_name, ' · ', acct.account_number);

  insert into public.withdrawal_requests
    (user_id, amount_usdt, destination, payout_amount_local, payout_currency)
  values
    (me, amount_usd, snapshot, amount_local, coalesce(currency_local, 'USD'))
  returning * into row;

  -- Lock the funds now (earnings drop immediately; refunded if rejected).
  insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
       values (me, 'withdrawal', 'debit', amount_usd, 'withdrawal_requests', row.id,
               concat('Withdrawal to ', acct.bank_name));

  return row;
end $$;

grant execute on function public.request_withdrawal(numeric, numeric, text) to authenticated;
