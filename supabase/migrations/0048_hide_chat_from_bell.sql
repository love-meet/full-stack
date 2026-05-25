-- Chat messages are push-only (sound + browser notification + offline email).
-- They still get a notifications row to drive that pipeline, but they should
-- NOT show in the notifications bell list or count toward the unread badge.

create or replace function public.unread_notification_count()
returns int language sql security definer stable set search_path = public as $$
  select count(*)::int from public.notifications
   where user_id = auth.uid() and read_at is null
     and type <> 'chat_message';
$$;
