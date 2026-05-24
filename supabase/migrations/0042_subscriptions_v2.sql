-- Subscriptions v2 — the launch model.
--
--   * Free is the default for everyone (= simply no active row here).
--   * Exactly TWO paid plans, both billed monthly but payable for several
--     months up front:
--       - 'sweetheart' ($2/mo)  — the everyday romance plan. ACTIVE.
--       - 'soulmate'   ($10/mo) — for serious seekers; adds nationality +
--                                 face verification. COMING SOON (locked).
--   * A month after the last paid period ends we auto-downgrade the user to
--     Free and notify them (expire_subscriptions, scheduled daily via pg_cron).
--
-- Prices are stored in USD (the wallet's base currency) and shown to the user
-- in their local currency by the client. duration_days = 30 (one month); the
-- subscribe() RPC multiplies by the number of months purchased.

-- ---------------------------------------------------------------------------
-- 1) Schema: a "coming soon" flag so a plan can be shown but not purchasable.
-- ---------------------------------------------------------------------------
alter table public.subscription_plans
  add column if not exists coming_soon boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2) Retire the old SKUs and seed the two launch plans. We keep the old rows
--    (subscriptions may still reference them) but mark them inactive so they
--    never appear in the picker.
-- ---------------------------------------------------------------------------
update public.subscription_plans
   set active = false
 where id in ('lite_30', 'pro_90', 'premium_365');

insert into public.subscription_plans (id, name, description, duration_days, price_usdt, features, active, coming_soon, sort_order)
values
  ('sweetheart', 'Sweetheart',
   'Be seen, be heard, be unmissable. Everything you need to shine and connect.',
   30, 2.00,
   '[
     "Boosted visibility — recommended to people who match your vibe, location & closeness",
     "Create your own groups",
     "Start threads inside groups",
     "Create & host any game",
     "Unlimited posts (Free is 3 a week)",
     "Choose exactly who can message you",
     "10 chat settings & toggles",
     "8 privacy settings & toggles",
     "Get recommended to people who already like you",
     "No ads",
     "Blue verified tick on your profile everywhere"
   ]'::jsonb,
   true, false, 1),
  ('soulmate', 'Soulmate',
   'For those who mean it. Everything in Sweetheart, plus verified nationality and face — so serious hearts find each other.',
   30, 10.00,
   '[
     "Everything in Sweetheart",
     "Nationality verification",
     "Face verification",
     "Top priority with the most genuine, verified matches"
   ]'::jsonb,
   true, true, 2)
on conflict (id) do update set
  name        = excluded.name,
  description = excluded.description,
  duration_days = excluded.duration_days,
  price_usdt  = excluded.price_usdt,
  features    = excluded.features,
  active      = excluded.active,
  coming_soon = excluded.coming_soon,
  sort_order  = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 3) subscribe(plan_id, months) — pay from the wallet for N months at once.
--    Replaces the single-arg version from 0035. Rejects "coming soon" plans.
--    Keeps the affiliate 5%-for-life payout (now on the full amount paid).
-- ---------------------------------------------------------------------------
drop function if exists public.subscribe(text);

create or replace function public.subscribe(plan_id text, months int default 1)
returns public.user_subscriptions
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  pl public.subscription_plans;
  n  int := greatest(1, coalesce(months, 1));
  total numeric;
  balance numeric;
  base_at timestamptz;
  row public.user_subscriptions;
  my_ref uuid;
  bonus numeric;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select * into pl from public.subscription_plans where id = plan_id and active;
  if pl.id is null then raise exception 'plan not found'; end if;
  if pl.coming_soon then raise exception 'this plan is coming soon'; end if;

  total := pl.price_usdt * n;

  select coalesce(balance_usdt, 0) into balance from public.wallets where user_id = me;
  if balance is null or balance < total then
    raise exception 'insufficient balance';
  end if;

  -- If renewing the same plan before it lapses, stack on top of the time left.
  select expires_at into base_at
    from public.user_subscriptions
   where user_id = me and status = 'active' and plan_id = pl.id and expires_at > now()
   order by expires_at desc limit 1;
  base_at := greatest(coalesce(base_at, now()), now());

  -- Only one active row per user — retire any current one first.
  update public.user_subscriptions
     set status = 'cancelled'
   where user_id = me and status = 'active';

  insert into public.user_subscriptions (user_id, plan_id, expires_at)
       values (me, pl.id, base_at + (pl.duration_days * n || ' days')::interval)
    returning * into row;

  insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
       values (me, 'adjustment', 'debit', total, 'user_subscriptions', row.id,
               concat('Subscribed to ', pl.name, ' (', n, ' month', case when n = 1 then '' else 's' end, ')'));

  -- Affiliate: pay my referrer 5% of what I paid (lifetime).
  select referred_by into my_ref from public.profiles where id = me;
  if my_ref is not null then
    bonus := round(total * 0.05, 6);
    if bonus > 0 then
      insert into public.ledger_entries (user_id, kind, direction, amount_usdt, ref_table, ref_id, note)
           values (my_ref, 'referral_bonus', 'credit', bonus, 'user_subscriptions', row.id,
                   concat('Affiliate 5% — a referral subscribed to ', pl.name));
    end if;
  end if;

  return row;
end $$;

grant execute on function public.subscribe(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Auto-downgrade: a month after the paid period ends, flip to 'expired'
--    (which removes the active row → user is back on Free) and notify them.
-- ---------------------------------------------------------------------------
create or replace function public.expire_subscriptions()
returns void language plpgsql security definer set search_path = public as $$
begin
  with expired as (
    update public.user_subscriptions s
       set status = 'expired'
     where s.status = 'active' and s.expires_at < now()
    returning s.user_id, s.plan_id
  )
  insert into public.notifications (user_id, type, body)
  select e.user_id, 'subscription_expired',
         concat('Your ', coalesce(pl.name, 'premium'),
                ' plan has ended — you''re back on the Free plan. '
                'Resubscribe anytime to keep your perks. 💕')
    from expired e
    left join public.subscription_plans pl on pl.id = e.plan_id;
end $$;

grant execute on function public.expire_subscriptions() to authenticated;

-- Run it daily at 02:00 UTC via pg_cron (enable the extension in
-- Dashboard → Database → Extensions if this block is skipped).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('expire-subscriptions')
      where exists (select 1 from cron.job where jobname = 'expire-subscriptions');
    perform cron.schedule('expire-subscriptions', '0 2 * * *', $cron$ select public.expire_subscriptions() $cron$);
  end if;
end $$;
