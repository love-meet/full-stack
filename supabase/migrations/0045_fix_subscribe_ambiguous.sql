-- Fix: subscribe() raised "column reference \"plan_id\" is ambiguous" because
-- the function parameter `plan_id` collides with user_subscriptions.plan_id in
-- the renewal-stacking lookup. Qualify the column with its table name. Keeps
-- the parameter named `plan_id` so the PostgREST call signature is unchanged.

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

  select * into pl from public.subscription_plans p where p.id = subscribe.plan_id and p.active;
  if pl.id is null then raise exception 'plan not found'; end if;
  if pl.coming_soon then raise exception 'this plan is coming soon'; end if;

  total := pl.price_usdt * n;

  select coalesce(balance_usdt, 0) into balance from public.wallets where user_id = me;
  if balance is null or balance < total then
    raise exception 'insufficient balance';
  end if;

  -- If renewing the same plan before it lapses, stack on top of the time left.
  select us.expires_at into base_at
    from public.user_subscriptions us
   where us.user_id = me and us.status = 'active'
     and us.plan_id = pl.id and us.expires_at > now()
   order by us.expires_at desc limit 1;
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
