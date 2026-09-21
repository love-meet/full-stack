-- =========================================================================
-- 0097 — the messaging day runs on Africa/Lagos, not UTC.
--
-- Victor, 19 Sep: "At midnight UTC someone chatting at 00:30 Lagos gets
-- charged twice inside ninety minutes."
--
-- He's right, and it's worse than it first sounds. Lagos is UTC+1, so the
-- UTC day flips at 01:00 local — right in the middle of the busiest hour for
-- a chat app. Someone messaging at 00:30 pays for "today", and pays again
-- thirty minutes later when UTC rolls over. Two charges, one evening, no
-- explanation the user could possibly work out.
--
-- Lagos has no daylight saving and has held UTC+1 since 1919, so this is a
-- stable boundary rather than one that drifts twice a year.
--
-- If the app goes international later this becomes a per-user timezone
-- (profiles.timezone, defaulting to Africa/Lagos) and the date expression
-- below is the only thing that changes.
-- =========================================================================

comment on column public.profiles.last_message_charge_on is
  'Date of the last messaging charge, in Africa/Lagos. One charge per user per local day; set only by spend_daily_message_credit().';

create or replace function public.spend_daily_message_credit()
returns table (balance int, charged boolean)
language plpgsql security definer set search_path = public
as $$
declare
  me      uuid := auth.uid();
  today   date := (now() at time zone 'Africa/Lagos')::date;
  cur     int;
  last_on date;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select p.coins, p.last_message_charge_on
    into cur, last_on
    from public.profiles p
   where p.id = me
     for update;

  if cur is null then raise exception 'profile not found'; end if;

  -- Already paid for today. Unlimited messages, all chats, no further cost.
  if last_on = today then
    return query select cur, false;
    return;
  end if;

  if cur < 100 then
    raise exception 'insufficient_credits';
  end if;

  update public.profiles set last_message_charge_on = today where id = me;
  cur := public.apply_coins(me, -100, 'message_day', null, null,
                            concat('Messaging — ', today::text));

  return query select cur, true;
end $$;

grant execute on function public.spend_daily_message_credit() to authenticated;
