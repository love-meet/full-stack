-- Withdrawals may only draw down EARNINGS, never deposited funds.
--
-- Until now request_withdrawal checked the amount against the full
-- wallets.balance_usdt, which also contains money the user deposited (to
-- buy gifts/subscriptions). Deposits are not cashable — only what you earn
-- (gifts/tips received + referral bonuses) can be withdrawn.
--
-- Withdrawable pool =
--     sum(earnings credits)
--   - sum(withdrawal debits)            -- funds already locked/sent
--   + sum(withdrawal refund credits)    -- rejected requests, given back
--
-- The wallet balance is still debited as before (so spending power and the
-- ledger stay accurate); we simply gate the withdrawal on the earnings pool.

create or replace function public.my_withdrawable()
returns numeric
language sql security definer stable set search_path = public
as $$
  select greatest(0,
      coalesce((
        select sum(amount_usdt) from public.ledger_entries
         where user_id = auth.uid() and direction = 'credit'
           and kind in ('gift_received', 'tip_received', 'referral_bonus')
      ), 0)
    - coalesce((
        select sum(amount_usdt) from public.ledger_entries
         where user_id = auth.uid() and direction = 'debit' and kind = 'withdrawal'
      ), 0)
    + coalesce((
        select sum(amount_usdt) from public.ledger_entries
         where user_id = auth.uid() and direction = 'credit' and kind = 'adjustment'
           and ref_table = 'withdrawal_requests'
      ), 0)
  );
$$;

grant execute on function public.my_withdrawable() to authenticated;

-- Re-gate request_withdrawal on the earnings pool instead of total balance.
create or replace function public.request_withdrawal(
  amount_usdt numeric,
  destination text
)
returns public.withdrawal_requests
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  withdrawable numeric;
  row public.withdrawal_requests;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if amount_usdt is null or amount_usdt <= 0 then
    raise exception 'amount must be > 0';
  end if;
  if destination is null or length(trim(destination)) < 30 then
    raise exception 'invalid destination address';
  end if;

  withdrawable := public.my_withdrawable();
  if withdrawable < amount_usdt then
    raise exception 'amount exceeds withdrawable earnings';
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
