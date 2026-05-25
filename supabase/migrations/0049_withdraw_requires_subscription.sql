-- Monetization gate: only subscribers can withdraw earnings. Free-mode users
-- can still receive gifts and accrue earnings, but must be on a paid plan to
-- cash out. Enforced server-side here (the client also hides the form).

create or replace function public.has_active_subscription(uid uuid default auth.uid())
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.user_subscriptions
     where user_id = uid and status = 'active' and expires_at > now()
  );
$$;

grant execute on function public.has_active_subscription(uuid) to authenticated;

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

  -- Free-mode users can't cash out — they must be on a paid plan.
  if not public.has_active_subscription(me) then
    raise exception 'Withdrawals are for subscribers — upgrade your plan to cash out your earnings.';
  end if;

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

  insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
       values (me, 'withdrawal', 'debit', amount_usd, 'withdrawal_requests', row.id,
               concat('Withdrawal to ', acct.bank_name));

  return row;
end $$;

grant execute on function public.request_withdrawal(numeric, numeric, text) to authenticated;
