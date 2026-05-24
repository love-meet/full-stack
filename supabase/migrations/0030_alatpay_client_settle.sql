-- ALATPay: record + credit at payment time (no webhook required yet).
--
-- New flow (per product decision 2026-05-23):
--   * NOTHING is recorded when the user merely opens the deposit screen or
--     taps "Add" — we don't know if they'll pay.
--   * Only once ALATPay fires the transaction callback do we record the
--     deposit: as 'paid' (and credit the wallet) when completed, else
--     'pending' for an admin to resolve.
--   * Crediting happens straight from the client callback via
--     record_alatpay_deposit — there is NO Node backend, and the webhook URL
--     isn't wired yet. The same settle logic backs the webhook (service
--     variant) for when the callback URL is configured later.
--
-- Idempotent on the ALATPay transaction id (unique index from 0029), so the
-- client call and a later webhook can't double-credit.
--
-- SECURITY NOTE: until the webhook + signature verification is enabled, this
-- trusts the client's "completed" callback. A user can only credit THEIR OWN
-- wallet (auth.uid()), and each transaction id credits once — but it is not
-- cryptographically verified. Harden with the ALATPay webhook (Webhook
-- Secret Key) once the callback URL can be set in the portal.

-- Internal: ensure a deposit row exists for this transaction and settle it.
create or replace function public._settle_alatpay(
  p_user uuid, p_transaction_id text, p_amount_ngn numeric, p_completed boolean, p_payload jsonb
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
        (p_user, p_amount_ngn, p_amount_ngn, 'NGN', 'alatpay', p_transaction_id, 'pending', p_payload)
      returning id into v_id;
    exception when unique_violation then
      select id into v_id from public.deposits
       where provider = 'alatpay' and provider_ref = p_transaction_id;
    end;
  end if;

  -- Settle once: flip pending → paid and write the ledger credit atomically.
  if p_completed then
    update public.deposits
       set status = 'paid', paid_at = now(),
           webhook_payload = coalesce(p_payload, webhook_payload)
     where id = v_id and status = 'pending';
    if found then
      insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
      select user_id, 'deposit', 'credit', amount_usdt, 'deposits', id, 'Deposit via ALATPay (NGN)'
        from public.deposits where id = v_id;
    end if;
  end if;

  select * into row from public.deposits where id = v_id;
  return row;
end $$;

revoke all on function public._settle_alatpay(uuid, text, numeric, boolean, jsonb) from public, authenticated;

-- Client entry point: the signed-in user records their own ALATPay payment.
create or replace function public.record_alatpay_deposit(
  transaction_id text,
  amount_ngn      numeric,
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
  if amount_ngn is null or amount_ngn <= 0 then raise exception 'amount must be > 0'; end if;
  return public._settle_alatpay(me, transaction_id, amount_ngn, coalesce(completed, true), payload);
end $$;

grant execute on function public.record_alatpay_deposit(text, numeric, boolean, jsonb) to authenticated;

-- Service entry point for the webhook (when its URL is configured later).
-- The user is taken from the callback metadata (we send it the user id).
create or replace function public.settle_alatpay_webhook(
  user_id        uuid,
  transaction_id text,
  amount_ngn     numeric,
  payload        jsonb default null
)
returns public.deposits
language plpgsql security definer set search_path = public
as $$
begin
  if user_id is null or transaction_id is null then
    raise exception 'user_id and transaction_id required';
  end if;
  return public._settle_alatpay(user_id, transaction_id, amount_ngn, true, payload);
end $$;

revoke all on function public.settle_alatpay_webhook(uuid, text, numeric, jsonb) from public, authenticated;
grant execute on function public.settle_alatpay_webhook(uuid, text, numeric, jsonb) to service_role;
