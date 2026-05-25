-- Server-side "is this user online right now?" signal.
--
-- Realtime presence is client-only, so the notify-email Edge Function can't
-- see it. We keep a lightweight heartbeat: the app calls touch_last_seen()
-- every ~25s while the tab is alive. notify-email then treats a recipient as
-- OFFLINE when last_seen_at is null or older than ~60s, and only in that case
-- emails them a chat message (online users get an in-app sound + browser
-- notification instead).

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;

grant execute on function public.touch_last_seen() to authenticated;
