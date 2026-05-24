-- Earnings summary for the profile-menu earnings card. Sums the credit-side
-- ledger entries that count as "earnings" (gifts/tips received + referral
-- bonuses) — distinct from the spendable wallet balance, which also includes
-- deposits and is reduced by spending.
--
-- The view inherits ledger_entries' RLS (user sees only their own rows); the
-- explicit auth.uid() filter double-guards and keeps the aggregate scoped.

create or replace view public.my_earnings_summary as
select
  coalesce(sum(amount_usdt) filter (
    where direction = 'credit'
      and kind in ('gift_received', 'tip_received', 'referral_bonus')
  ), 0)::numeric(20,6) as lifetime_earnings,
  coalesce(sum(amount_usdt) filter (
    where direction = 'credit'
      and kind in ('gift_received', 'tip_received', 'referral_bonus')
      and created_at > now() - interval '30 days'
  ), 0)::numeric(20,6) as earnings_30d
from public.ledger_entries
where user_id = auth.uid();

grant select on public.my_earnings_summary to authenticated;
