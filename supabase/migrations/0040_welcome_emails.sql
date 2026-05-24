-- Romantic welcome emails at two moments:
--   1. Signup (profile row created via tg_handle_new_user on auth.users) →
--      'welcome_signup' — a flirty "glad you said yes" hello.
--   2. Onboarding finished (onboarded_at set) → 'welcome' — "your profile's
--      live, now go make the first move."
-- Both flow through notifications → bell + email (the love-themed copy lives
-- in the body so the in-app and email text match).
--
-- Note: Telegram sign-ups without an email address simply won't get the
-- email (nothing to send to); the in-app welcome still appears.

-- 1) Signup welcome — fires once when the profile is first created.
create or replace function public.tg_notify_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, body)
  values (new.id, 'welcome_signup',
          'You said yes 💘 Welcome to Love meet — the boldest swipe you''ll make today. Someone out there is hoping you show up. Let''s set up your profile and go find them.');
  return new;
end $$;
drop trigger if exists notify_on_signup on public.profiles;
create trigger notify_on_signup after insert on public.profiles
  for each row execute function public.tg_notify_signup();

-- 2) Onboarding welcome — romantic refresh of the 0036 copy.
create or replace function public.tg_notify_welcome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.onboarded_at is not null and old.onboarded_at is null then
    insert into public.notifications (user_id, type, body)
    values (new.id, 'welcome',
            'Your profile is live and looking lovely 💕 The right person could be one hello away — so don''t be shy. Make the first move; fortune favours the bold (and the charming).');
  end if;
  return new;
end $$;
-- trigger already exists from 0036 (notify_on_welcome); the function above
-- replaces its body. Recreate defensively in case order differs.
drop trigger if exists notify_on_welcome on public.profiles;
create trigger notify_on_welcome after update of onboarded_at on public.profiles
  for each row execute function public.tg_notify_welcome();
