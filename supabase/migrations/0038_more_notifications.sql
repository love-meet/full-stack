-- More notification events → in-app bell + email (via the notifications
-- webhook + notify-email). Everything funnels through public.notifications,
-- so each new event automatically gets both channels and the shared template.
--
-- Added: deposit succeeded, withdrawal requested / sent / rejected,
-- password changed, and a "your chat went unanswered for 1 min" reminder.

-- ===== Deposits → notify on success =====
create or replace function public.tg_notify_deposit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and (old.status is distinct from 'paid') then
    insert into public.notifications (user_id, type, body)
    values (new.user_id, 'deposit', concat('Your deposit of $', round(new.amount_usdt, 2), ' was received.'));
  end if;
  return new;
end $$;
drop trigger if exists notify_on_deposit on public.deposits;
create trigger notify_on_deposit after update of status on public.deposits
  for each row execute function public.tg_notify_deposit();

-- ===== Withdrawals → requested / sent / rejected =====
create or replace function public.tg_notify_withdrawal_new()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, body)
  values (new.user_id, 'withdrawal',
          concat('Your withdrawal request of $', round(new.amount_usdt, 2), ' is being reviewed.'));
  return new;
end $$;
drop trigger if exists notify_on_withdrawal_new on public.withdrawal_requests;
create trigger notify_on_withdrawal_new after insert on public.withdrawal_requests
  for each row execute function public.tg_notify_withdrawal_new();

create or replace function public.tg_notify_withdrawal_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'sent' and old.status is distinct from 'sent' then
    insert into public.notifications (user_id, type, body)
    values (new.user_id, 'withdrawal_sent',
            concat('Your withdrawal of $', round(new.amount_usdt, 2), ' has been sent. 🎉'));
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    insert into public.notifications (user_id, type, body)
    values (new.user_id, 'withdrawal_rejected',
            concat('Your withdrawal was rejected and refunded',
                   case when new.reject_reason is not null then concat(': ', new.reject_reason) else '.' end));
  end if;
  return new;
end $$;
drop trigger if exists notify_on_withdrawal_status on public.withdrawal_requests;
create trigger notify_on_withdrawal_status after update of status on public.withdrawal_requests
  for each row execute function public.tg_notify_withdrawal_status();

-- ===== Password change (client calls this after updating the password) =====
create or replace function public.notify_password_changed()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  insert into public.notifications (user_id, type, body)
  values (me, 'password_changed', 'Your password was just changed. If this wasn''t you, contact support immediately.');
end $$;
grant execute on function public.notify_password_changed() to authenticated;

-- ===== Chat unread reminder (sent a message, unanswered for 1 minute) =====
alter table public.conversation_members
  add column if not exists reminded_at timestamptz;

create or replace function public.send_chat_reminders()
returns void language plpgsql security definer set search_path = public as $$
begin
  with cand as (
    select cm.conversation_id, cm.user_id as recipient, m.sender_id, m.created_at
      from public.conversation_members cm
      join lateral (
        select sender_id, created_at
          from public.messages mm
         where mm.conversation_id = cm.conversation_id
           and mm.sender_id <> cm.user_id
           and mm.deleted_at is null
         order by created_at desc
         limit 1
      ) m on true
     where m.created_at < now() - interval '1 minute'
       and m.created_at > coalesce(cm.last_read_at, 'epoch'::timestamptz)
       and (cm.reminded_at is null or cm.reminded_at < m.created_at)
  ), inserted as (
    insert into public.notifications (user_id, actor_id, type, body)
    select recipient, sender_id, 'chat_reminder', 'You have an unread message waiting for a reply.'
      from cand
    returning 1
  )
  update public.conversation_members cm
     set reminded_at = now()
    from cand
   where cm.conversation_id = cand.conversation_id and cm.user_id = cand.recipient;
end $$;

-- Schedule it every minute via pg_cron (if available). Enable the extension
-- in Dashboard → Database → Extensions ("pg_cron") if this is skipped.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('chat-unread-reminders')
      where exists (select 1 from cron.job where jobname = 'chat-unread-reminders');
    perform cron.schedule('chat-unread-reminders', '* * * * *', $cron$ select public.send_chat_reminders() $cron$);
  end if;
end $$;
