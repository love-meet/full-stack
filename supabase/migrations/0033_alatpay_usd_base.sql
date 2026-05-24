-- Switch the deposit ledger to USD base (2026-05-23).
--
-- The platform's base currency is USD (the wallet columns are already named
-- *_usdt). Deposits now record the USD amount in the ledger; the local
-- amount the user paid (and its currency) is kept alongside for the record.
-- ALATPay still charges the NGN equivalent — that conversion happens in the
-- client / webhook before calling these functions.
--
-- Supersedes 0030's NGN-as-usdt settle. Old signatures are dropped.

drop function if exists public.record_alatpay_deposit(text, numeric, boolean, jsonb);
drop function if exists public.settle_alatpay_webhook(uuid, text, numeric, jsonb);
drop function if exists public._settle_alatpay(uuid, text, numeric, boolean, jsonb);

-- Internal: ensure a deposit row exists for this transaction and settle it.
-- amount_usd → ledger/wallet; amount_local + currency_local → record only.
create or replace function public._settle_alatpay(
  p_user           uuid,
  p_transaction_id text,
  p_amount_usd     numeric,
  p_amount_local   numeric,
  p_currency_local text,
  p_completed      boolean,
  p_payload        jsonb
)
returns public.deposits
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  row public.deposits;
begin
  select id into v_id
    from public.deposits
   where provider = 'alatpay' and provider_ref = p_transaction_id
   limit 1;

  if v_id is null then
    begin
      insert into public.deposits
        (user_id, amount_usdt, amount_local, currency_local, provider, provider_ref, status, webhook_payload)
      values
        (p_user, p_amount_usd, p_amount_local, coalesce(p_currency_local, 'NGN'),
         'alatpay', p_transaction_id, 'pending', p_payload)
      returning id into v_id;
    exception when unique_violation then
      select id into v_id from public.deposits
       where provider = 'alatpay' and provider_ref = p_transaction_id;
    end;
  end if;

  if p_completed then
    update public.deposits
       set status = 'paid', paid_at = now(),
           webhook_payload = coalesce(p_payload, webhook_payload)
     where id = v_id and status = 'pending';
    if found then
      insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
      select user_id, 'deposit', 'credit', amount_usdt, 'deposits', id, 'Deposit via ALATPay'
        from public.deposits where id = v_id;
    end if;
  end if;

  select * into row from public.deposits where id = v_id;
  return row;
end $$;

revoke all on function public._settle_alatpay(uuid, text, numeric, numeric, text, boolean, jsonb) from public, authenticated;

-- Client entry: the signed-in user records their own ALATPay payment.
create or replace function public.record_alatpay_deposit(
  transaction_id text,
  amount_usd      numeric,
  amount_local    numeric,
  currency_local  text,
  completed       boolean default true,
  payload         jsonb   default null
)
returns public.deposits
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if transaction_id is null or length(trim(transaction_id)) = 0 then
    raise exception 'transaction_id required';
  end if;
  if amount_usd is null or amount_usd <= 0 then raise exception 'amount must be > 0'; end if;
  return public._settle_alatpay(me, transaction_id, amount_usd, amount_local, currency_local,
                                coalesce(completed, true), payload);
end $$;

grant execute on function public.record_alatpay_deposit(text, numeric, numeric, text, boolean, jsonb) to authenticated;

-- Service entry for the webhook (later). The function derives the USD amount
-- from the callback (USD charge → as-is; NGN charge → divide by the cached
-- NGN rate) and passes the local amount + currency for the record.
create or replace function public.settle_alatpay_webhook(
  user_id        uuid,
  transaction_id text,
  amount_usd     numeric,
  amount_local   numeric,
  currency_local text,
  payload        jsonb default null
)
returns public.deposits
language plpgsql security definer set search_path = public
as $$
begin
  if user_id is null or transaction_id is null then
    raise exception 'user_id and transaction_id required';
  end if;
  return public._settle_alatpay(user_id, transaction_id, amount_usd, amount_local,
                                coalesce(currency_local, 'NGN'), true, payload);
end $$;

revoke all on function public.settle_alatpay_webhook(uuid, text, numeric, numeric, text, jsonb) from public, authenticated;
grant execute on function public.settle_alatpay_webhook(uuid, text, numeric, numeric, text, jsonb) to service_role;
