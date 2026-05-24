-- Fix: Telegram sign-ups were getting emailed at their synthetic
-- tg_<id>@telegram.lovemeet.invalid address instead of a Telegram alert.
--
-- Root cause: their notification channel wasn't set to Telegram-on / email-off
-- (either the 0041 defaults weren't live, or the profile pre-existed). This
-- re-asserts the new-user defaults AND repairs every existing Telegram-only
-- user whose channel is still mis-set. (The notify-email function also now
-- refuses to mail any *.invalid address as a belt-and-braces guard.)

-- 1) Re-assert the signup-method channel defaults (idempotent).
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

-- 2) Repair existing Telegram-only users (synthetic email = can't receive
--    mail): turn Telegram alerts ON and email OFF.
update public.profiles p
   set telegram_notifications = true,
       email_notifications    = false
  from auth.users u
 where u.id = p.id
   and p.telegram_user_id is not null
   and u.email ilike '%@telegram.lovemeet.invalid'
   and (p.telegram_notifications is distinct from true
        or p.email_notifications is distinct from false);
