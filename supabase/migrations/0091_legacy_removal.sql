-- 0091 — Legacy Fiat Removal & Premium Model Reframe.
--
-- Drops the old fiat wallet, deposits, withdrawal requests, and legacy 
-- subscription plans schemas. 
--
-- Safely transitions the has_active_subscription helper to point to the new
-- premium fields on profiles so we don't break chat gates or feed ranking.

-- 1. Add premium fields to profiles
alter table public.profiles
  add column if not exists is_premium boolean not null default false,
  add column if not exists premium_expires_at timestamptz;

-- 2. Redirect has_active_subscription to use the new fields
--    (this prevents breaking chat_gates, follows privacy, and feed ranking)
create or replace function public.has_active_subscription(uid uuid default auth.uid())
returns boolean
language sql security definer set search_path = public
as $$
  select coalesce(is_premium, false)
    from public.profiles
   where id = uid
     and (premium_expires_at is null or premium_expires_at > now());
$$;

-- 3. Drop dependent views and functions first
drop view if exists public.my_affiliate_summary cascade;
drop view if exists public.my_transactions cascade;

drop trigger if exists launch_bonus_on_signup on public.profiles cascade;
drop function if exists public.tg_launch_bonus() cascade;
drop function if exists public.subscribe(text) cascade;
drop function if exists public.apply_referral(text) cascade;
drop function if exists public.request_withdrawal(numeric, text, text) cascade;

-- 4. Drop the legacy money schemas
drop table if exists public.withdrawal_requests cascade;
drop table if exists public.deposits cascade;
drop table if exists public.user_subscriptions cascade;
drop table if exists public.subscription_plans cascade;
drop table if exists public.fx_rates cascade;
drop table if exists public.ledger_entries cascade;
drop table if exists public.wallets cascade;

-- 5. Drop affiliate referral column
alter table public.profiles 
  drop column if exists referred_by cascade;

-- 6. Drop unused enums
drop type if exists public.payment_provider cascade;
drop type if exists public.deposit_status cascade;
drop type if exists public.withdrawal_status cascade;
drop type if exists public.subscription_status cascade;
drop type if exists public.ledger_kind cascade;
drop type if exists public.ledger_direction cascade;
