-- In-app notifications.
--
-- Anything that happens TO a user creates a notification row: likes,
-- comments, replies, gifts received, and a welcome on first onboarding.
-- Triggers (SECURITY DEFINER) write the rows; the user reads their own and
-- marks them read via RPC. Realtime drives the unread badge live.

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,  -- recipient
  actor_id    uuid references public.profiles(id) on delete set null,          -- who triggered it
  type        text not null,        -- 'like' | 'comment' | 'reply' | 'gift' | 'welcome'
  post_id     uuid references public.posts(id) on delete cascade,
  comment_id  uuid references public.post_comments(id) on delete cascade,
  body        text,                 -- snippet (comment text, gift name, …)
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_read_own" on public.notifications;
create policy "notifications_read_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

-- No client inserts (triggers only); allow owners to update read_at.
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- Helper to insert a notification (skips self-notifications).
-- =========================================================================
create or replace function public.tg_notify(
  p_user uuid, p_actor uuid, p_type text, p_post uuid, p_comment uuid, p_body text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = p_actor then return; end if;  -- don't notify yourself
  insert into public.notifications (user_id, actor_id, type, post_id, comment_id, body)
       values (p_user, p_actor, p_type, p_post, p_comment, p_body);
end $$;

-- ----- Likes → notify the post author -----
create or replace function public.tg_notify_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare author uuid;
begin
  select author_id into author from public.posts where id = new.post_id;
  perform public.tg_notify(author, new.user_id, 'like', new.post_id, null, null);
  return new;
end $$;
drop trigger if exists notify_on_like on public.post_likes;
create trigger notify_on_like after insert on public.post_likes
  for each row execute function public.tg_notify_like();

-- ----- Comments / replies -----
-- Top-level comment → notify post author. Reply → notify the parent
-- comment's author.
create or replace function public.tg_notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare author uuid; parent_author uuid; snippet text;
begin
  snippet := substring(new.body for 120);
  if new.parent_id is null then
    select author_id into author from public.posts where id = new.post_id;
    perform public.tg_notify(author, new.author_id, 'comment', new.post_id, new.id, snippet);
  else
    select author_id into parent_author from public.post_comments where id = new.parent_id;
    perform public.tg_notify(parent_author, new.author_id, 'reply', new.post_id, new.id, snippet);
  end if;
  return new;
end $$;
drop trigger if exists notify_on_comment on public.post_comments;
create trigger notify_on_comment after insert on public.post_comments
  for each row execute function public.tg_notify_comment();

-- ----- Gifts → notify the recipient -----
create or replace function public.tg_notify_gift()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.tg_notify(new.recipient_id, new.sender_id, 'gift', new.post_id, null, new.gift_name);
  return new;
end $$;
drop trigger if exists notify_on_gift on public.post_gifts;
create trigger notify_on_gift after insert on public.post_gifts
  for each row execute function public.tg_notify_gift();

-- ----- Welcome → on first onboarding -----
create or replace function public.tg_notify_welcome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.onboarded_at is not null and old.onboarded_at is null then
    insert into public.notifications (user_id, type, body)
         values (new.id, 'welcome', 'Welcome to Love meet! 💕 Complete your profile and start connecting.');
  end if;
  return new;
end $$;
drop trigger if exists notify_on_welcome on public.profiles;
create trigger notify_on_welcome after update of onboarded_at on public.profiles
  for each row execute function public.tg_notify_welcome();

-- =========================================================================
-- RPCs
-- =========================================================================
create or replace function public.unread_notification_count()
returns int language sql security definer stable set search_path = public as $$
  select count(*)::int from public.notifications
   where user_id = auth.uid() and read_at is null;
$$;
grant execute on function public.unread_notification_count() to authenticated;

create or replace function public.mark_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null;
$$;
grant execute on function public.mark_notifications_read() to authenticated;

-- =========================================================================
-- View: notifications joined with the actor's profile slice (for the UI).
-- =========================================================================
create or replace view public.notifications_with_actor as
select
  n.id, n.user_id, n.actor_id, n.type, n.post_id, n.comment_id, n.body, n.read_at, n.created_at,
  pr.handle       as actor_handle,
  pr.display_name as actor_display_name,
  pr.avatar_url   as actor_avatar_url
from public.notifications n
left join public.profiles pr on pr.id = n.actor_id
where n.user_id = auth.uid();

grant select on public.notifications_with_actor to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
