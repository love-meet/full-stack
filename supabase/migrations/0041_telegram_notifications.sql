-- Telegram notification channel (mirrors email) + channel defaults by signup
-- method + live-support routing.
--
--   * profiles.telegram_notifications — deliver via the Telegram bot.
--   * New users: Telegram sign-ups default to Telegram-on / email-off;
--     Google sign-ups default to email-on / Telegram-off.
--   * Support: a user's message notifies all admins; an admin's reply
--     notifies the ticket's user (delivered on whatever channel they have on).

-- 1) Preference column.
alter table public.profiles
  add column if not exists telegram_notifications boolean not null default false;

-- Backfill initial channel by how each existing user signed up.
update public.profiles
   set telegram_notifications = (telegram_user_id is not null),
       email_notifications    = (telegram_user_id is null);

-- 2) New-user defaults: pick the channel that matches the signup method.
create or replace function public.tg_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tg_id bigint := nullif((new.raw_user_meta_data ->> 'telegram_user_id'), '')::bigint;
  g_sub text   := nullif((new.raw_user_meta_data ->> 'google_sub'), '');
begin
  insert into public.profiles (id, telegram_user_id, google_sub, telegram_notifications, email_notifications)
  values (
    new.id, tg_id, g_sub,
    tg_id is not null,   -- telegram signup → telegram notifications on
    tg_id is null        -- non-telegram (google) → email notifications on
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- 3) Live-support message routing.
create or replace function public.tg_notify_support_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t public.support_tickets;
  snippet text := substring(new.body for 120);
begin
  select * into t from public.support_tickets where id = new.ticket_id;

  if new.is_admin then
    -- Admin replied → notify the ticket owner (their channel decides email/tg).
    perform public.tg_notify(t.user_id, new.sender_id, 'support_reply', null, null, snippet);
  else
    -- User messaged support → notify every admin (by email).
    insert into public.notifications (user_id, actor_id, type, body)
    select p.id, new.sender_id, 'support_user_msg', snippet
      from public.profiles p
     where p.role in ('admin', 'super_admin')
       and p.id <> new.sender_id;
  end if;
  return new;
end $$;
drop trigger if exists notify_on_support_message on public.support_messages;
create trigger notify_on_support_message after insert on public.support_messages
  for each row execute function public.tg_notify_support_message();
