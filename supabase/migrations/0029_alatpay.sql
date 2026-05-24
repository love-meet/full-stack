-- ALATPay as the deposit rail (phase 1).
--
-- Add-funds now goes exclusively through ALATPay's hosted popup
-- (react-alatpay → web.alatpay.ng). ALATPay charges in NGN; for this phase
-- we keep the USDT wallet/ledger and credit the USDT equivalent at a fixed
-- rate locked when the deposit row is created (deposits.amount_usdt). The
-- full NGN-wallet switch is a later phase (it must move withdrawals,
-- earnings and subscription prices together to avoid mixing currencies).
--
-- Confirmation is server-side only: a Supabase Edge Function requeries
-- apibox.alatpay.ng, checks status = 'completed', then calls the
-- service-role function below. Idempotent: a deposit credits at most once.

-- 1. New provider value.a
alter type public.payment_provider add value if not exists 'alatpay';

-- 2. A transaction reference is used at most once across deposits, so a
--    replayed webhook / double verify can never credit twice.
create unique index if not exists deposits_provider_ref_uniq
  on public.deposits (provider, provider_ref)
  where provider_ref is not null;

-- 3. Service-role credit. Unlike mark_deposit_paid (admin-gated, for the
--    console), this is meant to be called ONLY by the trusted Edge
--    Functions using the service-role key — it performs no auth.uid()
--    check, so it is NOT granted to `authenticated`. It flips a single
--    PENDING deposit to paid and writes the matching ledger credit. The
--    `where status = 'pending'` guard makes repeat calls no-ops.
create or replace function public.credit_alatpay_deposit(
  deposit_id     uuid,
  transaction_id text,
  ngn_paid       numeric default null,
  payload        jsonb   default null
)
returns public.deposits
language plpgsql security definer set search_path = public
as $$
declare
  row public.deposits;
begin
  update public.deposits
     set status          = 'paid',
         paid_at         = now(),
         provider_ref    = coalesce(transaction_id, provider_ref),
         amount_local    = coalesce(ngn_paid, amount_local),
         webhook_payload = coalesce(payload, webhook_payload)
   where id = deposit_id
     and provider = 'alatpay'
     and status = 'pending'
  returning * into row;

  -- Already credited (or not found) → no-op, return whatever exists.
  if row.id is null then
    select * into row from public.deposits where id = deposit_id;
    return row;
  end if;

  insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
       values (row.user_id, 'deposit', 'credit', row.amount_usdt, 'deposits', row.id,
               concat('Deposit via ALATPay (', coalesce(row.currency_local, 'NGN'), ')'));

  return row;
end $$;

-- Lock it down: revoke the default public/authenticated execute, grant only
-- to the service role the Edge Functions authenticate with.
revoke all on function public.credit_alatpay_deposit(uuid, text, numeric, jsonb) from public, authenticated;
grant execute on function public.credit_alatpay_deposit(uuid, text, numeric, jsonb) to service_role;
