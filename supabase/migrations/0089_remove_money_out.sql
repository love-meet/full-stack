-- =========================================================================
-- 0089 — Phase 0: remove every path that can move real money out of the app.
--
-- Append-only: this migration drops forward. It does not edit 0022, 0027,
-- 0031-0035, 0049 or 0051 — it undoes what they created.
--
-- What goes:
--   * payouts            (0034) — payout_accounts, the cooldown trigger
--   * withdraw rules     (0027, 0049) — my_withdrawable, request_withdrawal,
--                        has_active_subscription (the withdraw gate)
--   * withdrawals        (0019) — withdrawal_requests + its admin RPCs
--   * earnings summary   (0022) — my_earnings_summary
--   * fx                 (0031, 0032, 0033) — fx_rates; the `fx-rates` Edge
--                        Function is deleted separately
--   * affiliate earnings (0035, 0051) — my_affiliate_summary, the 5% bonus
--   * crypto             — the TRC-20 destination column (with its table)
--   * ledger kinds       — withdrawal, tip_sent, tip_received, referral_bonus
--
-- What deliberately stays, and why:
--   * alatpay-webhook and its RPCs — it becomes the credit-purchase rail.
--   * ledger kind 'deposit' — _settle_alatpay() still writes it. See step 8.
--   * payment_provider value 'ccpayment' — inert. See step 9.
--   * profiles.referred_by + apply_referral() — attribution only, now with no
--     earnings attached, so invite links keep working. Say so if this should
--     go too; dropping the column is a one-line follow-up.
--   * The ledger itself. apply_coins / grant_purchased_coins (0088) are
--     untouched; the credit migration reworks them into the credit primitives.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Views that expose earnings / affiliate figures.
-- -------------------------------------------------------------------------
drop view if exists public.my_earnings_summary;
drop view if exists public.my_affiliate_summary;

-- -------------------------------------------------------------------------
-- 2. Withdrawal + payout functions. Dropped before the tables they read.
-- -------------------------------------------------------------------------
drop function if exists public.my_withdrawable();
drop function if exists public.request_withdrawal(numeric, text);
drop function if exists public.request_withdrawal(numeric, numeric, text);
drop function if exists public.approve_withdrawal(uuid);
drop function if exists public.mark_withdrawal_sent(uuid, text);
drop function if exists public.reject_withdrawal(uuid, text);
drop function if exists public.has_active_subscription(uuid);

-- -------------------------------------------------------------------------
-- 3. Payout + withdrawal + fx tables.
--
-- admin_dashboard is dropped FIRST. It selects from withdrawal_requests and
-- deposits, so dropping the tables while the view still exists fails with
-- "cannot drop table ... because other objects depend on it". `if exists`
-- does not help — the dependency is real, not a missing-object problem. The
-- view is re-created without the payout columns in step 4.
-- -------------------------------------------------------------------------
drop view if exists public.admin_dashboard;

drop trigger if exists payout_accounts_cooldown on public.payout_accounts;
drop function if exists public.tg_payout_cooldown();

drop table if exists public.payout_accounts;
drop table if exists public.withdrawal_requests;
drop table if exists public.fx_rates;

drop type if exists public.withdrawal_status;

-- -------------------------------------------------------------------------
-- 4. Admin dashboard — rebuilt without pending_payouts (the table went in
--    step 3) and without pending_deposits.
--
--    The first draft kept pending_deposits, reasoning that ALATPay still
--    runs. Wrong twice over: the deposits table does not exist on the live
--    database at all — dropped by hand long before this migration — so the
--    view failed to create with "relation public.deposits does not exist";
--    and 0096 removes the USD deposit rail entirely anyway. The admin
--    console no longer reads the column either.
-- -------------------------------------------------------------------------
create view public.admin_dashboard as
select
  (select count(*) from public.post_reports where status = 'open')                 as open_reports,
  (select count(*) from public.user_bans where lifted_at is null
     and (expires_at is null or expires_at > now()))                               as active_bans,
  (select count(*) from public.support_tickets where status = 'open')              as open_tickets,
  (select count(*) from public.profiles where role in ('admin','super_admin'))     as admin_count,
  (select count(*) from public.profiles where onboarded_at is not null
     and deleted_at is null)                                                       as user_count;

alter view public.admin_dashboard set (security_invoker = on);
grant select on public.admin_dashboard to authenticated;

-- -------------------------------------------------------------------------
-- 5. subscribe() is NOT rewritten here.
--
-- The first draft re-created it minus the affiliate 5% credit. That fails on
-- any database where the subscription tables are absent — the live one, where
-- they were dropped by hand — because the function's own signature,
-- "returns public.user_subscriptions", is resolved at creation time.
--
-- It is also pointless work: 0096 removes subscriptions wholesale, so the
-- affiliate credit disappears with the function itself a few migrations
-- later. Nothing in 0089..0097 can call it in between.
-- -------------------------------------------------------------------------

-- -------------------------------------------------------------------------
-- 6. apply_referral() — attribution only. Replaces the 0051 definition,
--    whose notification promised the referrer 5% for life.
-- -------------------------------------------------------------------------
create or replace function public.apply_referral(code text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  prefix text;
  ref_id uuid;
  current_ref uuid;
  updated int;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select referred_by into current_ref from public.profiles where id = me;
  if current_ref is not null then return; end if;          -- already referred

  prefix := lower(regexp_replace(coalesce(code, ''), '^LM-', '', 'i'));
  if length(prefix) < 6 then return; end if;
  prefix := left(prefix, 6);

  select id into ref_id
    from public.profiles
   where left(id::text, 6) = prefix and id <> me
   limit 1;
  if ref_id is null then return; end if;

  update public.profiles set referred_by = ref_id
   where id = me and referred_by is null;
  get diagnostics updated = row_count;

  if updated > 0 then
    insert into public.notifications (user_id, actor_id, type, body)
         values (ref_id, me, 'follow',
                 'Someone you invited just joined Love meet 🎉');
  end if;
end $$;

grant execute on function public.apply_referral(text) to authenticated;

-- -------------------------------------------------------------------------
-- 7. Orphaned notification triggers. The triggers themselves died with
--    withdrawal_requests in step 3; these are the functions they called.
-- -------------------------------------------------------------------------
drop function if exists public.tg_notify_withdrawal_new();
drop function if exists public.tg_notify_withdrawal_status();

-- -------------------------------------------------------------------------
-- 8. Ledger kinds. Postgres can't remove a value from an enum in place, so
--    the type is rebuilt. Existing rows in a dropped kind become
--    'adjustment' with their original kind preserved in the note — amount
--    and direction are untouched, so every balance stays exactly as it was.
--
--    'deposit' SURVIVES this migration on purpose. _settle_alatpay() (0033)
--    still writes it, and ALATPay is the rail §2 keeps — it becomes the
--    credit-purchase path. The migration that adds spend_daily_message_credit()
--    and grant_signup_credits() is what reworks _settle_alatpay onto the
--    credit primitives; 'deposit' comes out of the enum there, not here.
--    Dropping it now would break every live payment.
--
--    my_transactions selects ledger_entries.kind, so it is dropped and
--    rebuilt around the column retype.
-- -------------------------------------------------------------------------
do $do$
begin
  -- The USD ledger is absent on databases where it was removed by hand
  -- (including production). Nothing to rebuild there; 0096 tidies the type
  -- away if it lingers without its table.
  if to_regclass('public.ledger_entries') is null then
    return;
  end if;

  execute $q$update public.ledger_entries
                set note = concat('[', kind::text, '] ', coalesce(note, ''))
              where kind in ('withdrawal','tip_sent','tip_received','referral_bonus')$q$;

  execute 'drop view if exists public.my_transactions';
  execute 'alter type public.ledger_kind rename to ledger_kind_old';
  execute $q$create type public.ledger_kind as enum ('gift_sent','gift_received','deposit','adjustment')$q$;
  execute $q$alter table public.ledger_entries
               alter column kind type public.ledger_kind
               using (case when kind::text in ('gift_sent','gift_received','deposit')
                           then kind::text else 'adjustment' end)::public.ledger_kind$q$;
  execute 'drop type public.ledger_kind_old';

  execute $q$create view public.my_transactions as
              select le.id, le.user_id, le.kind, le.direction, le.amount_usdt,
                     le.ref_table, le.ref_id, le.note, le.created_at,
                     pg.status as gift_status
                from public.ledger_entries le
                left join public.post_gifts pg
                  on le.ref_table = 'post_gifts' and le.ref_id = pg.id
               where le.user_id = auth.uid()$q$;

  execute 'grant select on public.my_transactions to authenticated';
end $do$;

-- -------------------------------------------------------------------------
-- 9. Crypto rail.
--
-- The TRC-20 destination column lived on withdrawal_requests, dropped in
-- step 3. The 'ccpayment' value stays in public.payment_provider: unlike
-- ledger_kind it is a parameter type of create_deposit(), so rebuilding the
-- enum would force a cascade through the deposit RPCs for no gain. Nothing
-- can produce a 'ccpayment' deposit any more — the webhook Edge Function is
-- deleted and the client union no longer offers the value — so it is inert,
-- and historical rows keep reading correctly.
-- -------------------------------------------------------------------------
