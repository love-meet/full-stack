-- Affiliate program: refer someone and earn 5% of everything they ever
-- spend on subscriptions — for life.
--
--   - profiles.referred_by links a user to their referrer (set once).
--   - apply_referral(code) resolves a "LM-XXXXXX" code to the referrer and
--     stamps referred_by on the new user (called after onboarding).
--   - subscribe() now pays the referrer a 5% referral_bonus on every
--     subscription their referee buys.

alter table public.profiles
  add column if not exists referred_by uuid references public.profiles(id) on delete set null;

create index if not exists profiles_referred_by_idx on public.profiles (referred_by);

-- =========================================================================
-- apply_referral — link the signed-in user to a referrer via their code.
-- The code is "LM-" + the first 6 hex chars of the referrer's id (see the
-- invite screen). Sets referred_by only if not already set, never self.
-- =========================================================================
create or replace function public.apply_referral(code text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  prefix text;
  ref_id uuid;
  current_ref uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select referred_by into current_ref from public.profiles where id = me;
  if current_ref is not null then return; end if;          -- already referred

  prefix := lower(regexp_replace(coalesce(code, ''), '^LM-', '', 'i'));
  if length(prefix) < 6 then return; end if;
  prefix := left(prefix, 6);

  -- Resolve the referrer by id prefix (unique enough for the code space).
  select id into ref_id
    from public.profiles
   where left(id::text, 6) = prefix and id <> me
   limit 1;
  if ref_id is null then return; end if;

  update public.profiles set referred_by = ref_id
   where id = me and referred_by is null;
end $$;

grant execute on function public.apply_referral(text) to authenticated;

-- =========================================================================
-- subscribe — same as 0019, plus the 5% affiliate payout to the referrer.
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
  my_ref uuid;
  bonus numeric;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select * into pl from public.subscription_plans where id = plan_id and active;
  if pl.id is null then raise exception 'plan not found'; end if;

  select coalesce(balance_usdt, 0) into balance from public.wallets where user_id = me;
  if balance is null or balance < pl.price_usdt then
    raise exception 'insufficient balance';
  end if;

  update public.user_subscriptions
     set status = 'cancelled'
   where user_id = me and status = 'active';

  insert into public.user_subscriptions (user_id, plan_id, expires_at)
       values (me, plan_id, now() + (pl.duration_days || ' days')::interval)
    returning * into row;

  insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
       values (me, 'adjustment', 'debit', pl.price_usdt, 'user_subscriptions', row.id,
               concat('Subscribed to ', pl.name));

  -- Affiliate: pay my referrer 5% of this subscription (lifetime).
  select referred_by into my_ref from public.profiles where id = me;
  if my_ref is not null then
    bonus := round(pl.price_usdt * 0.05, 6);
    if bonus > 0 then
      insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
           values (my_ref, 'referral_bonus', 'credit', bonus, 'user_subscriptions', row.id,
                   concat('Affiliate 5% — a referral subscribed to ', pl.name));
    end if;
  end if;

  return row;
end $$;

grant execute on function public.subscribe(text) to authenticated;

-- =========================================================================
-- my_affiliate_summary — referral count + lifetime affiliate earnings.
-- =========================================================================
create or replace view public.my_affiliate_summary as
select
  (select count(*) from public.profiles p where p.referred_by = auth.uid())::int as referral_count,
  coalesce((
    select sum(amount_usdt) from public.ledger_entries le
     where le.user_id = auth.uid() and le.direction = 'credit' and le.kind = 'referral_bonus'
  ), 0)::numeric(20, 6) as affiliate_earnings;

grant select on public.my_affiliate_summary to authenticated;
