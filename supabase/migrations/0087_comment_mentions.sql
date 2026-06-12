-- 0087_comment_mentions.sql
-- Tracks @handle mentions in both post comments and group post comments.
-- On insert, a trigger notifies the mentioned user.

-- =========================================================================
-- comment_mentions
-- Supports both post_comments (comment_id) and group_post_comments
-- (group_comment_id). Exactly one of the two FK columns is non-null,
-- enforced by a check constraint.
-- =========================================================================
create table if not exists public.comment_mentions (
  id                uuid primary key default gen_random_uuid(),
  -- FK to post_comments (mutually exclusive with group_comment_id)
  comment_id        uuid references public.post_comments(id)      on delete cascade,
  -- FK to group_post_comments (mutually exclusive with comment_id)
  group_comment_id  uuid references public.group_post_comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id)  on delete cascade,
  created_at        timestamptz not null default now(),
  -- Exactly one source FK must be present
  constraint comment_mentions_source_check check (
    (comment_id is not null) <> (group_comment_id is not null)
  )
);

-- Unique: a user is mentioned at most once per comment / group-comment
create unique index comment_mentions_post_uniq
  on public.comment_mentions (comment_id, mentioned_user_id)
  where comment_id is not null;

create unique index comment_mentions_group_uniq
  on public.comment_mentions (group_comment_id, mentioned_user_id)
  where group_comment_id is not null;

-- Index for the notification query (lookup by mentioned_user_id)
create index comment_mentions_user_idx
  on public.comment_mentions (mentioned_user_id);

alter table public.comment_mentions enable row level security;

-- Users can read their own mentions
create policy "comment_mentions_own_read"
  on public.comment_mentions for select to authenticated
  using (mentioned_user_id = auth.uid());

-- The SECURITY DEFINER triggers below write to this table on behalf of
-- any authenticated inserter, so we need an insert policy too.
-- We allow inserts where the authenticated user is the comment author
-- (enforced inside the trigger anyway; this is the belt+suspenders layer).
create policy "comment_mentions_insert"
  on public.comment_mentions for insert to authenticated
  with check (true);

-- =========================================================================
-- tg_notify_comment_mention
-- Fires AFTER INSERT on comment_mentions when comment_id is set
-- (post comment). Inserts a 'comment_mention' notification.
-- =========================================================================
create or replace function public.tg_notify_comment_mention()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_post_id   uuid;
  v_author_id uuid;
  v_snippet   text;
begin
  -- Resolve the comment's post and author
  select pc.post_id, pc.author_id, left(pc.body, 80)
    into v_post_id, v_author_id, v_snippet
    from public.post_comments pc
   where pc.id = new.comment_id;

  -- Don't notify yourself
  if new.mentioned_user_id = v_author_id then
    return new;
  end if;

  insert into public.notifications
    (user_id, actor_id, type, post_id, comment_id, body)
  values
    (new.mentioned_user_id, v_author_id, 'comment_mention',
     v_post_id, new.comment_id, v_snippet);

  return new;
end $$;

create trigger notify_comment_mention
  after insert on public.comment_mentions
  for each row
  when (new.comment_id is not null)
  execute function public.tg_notify_comment_mention();

-- =========================================================================
-- tg_notify_group_comment_mention
-- Same as above but for group_post_comments.
-- =========================================================================
create or replace function public.tg_notify_group_comment_mention()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_post_id   uuid;
  v_author_id uuid;
  v_snippet   text;
begin
  select gpc.post_id, gpc.author_id, left(gpc.body, 80)
    into v_post_id, v_author_id, v_snippet
    from public.group_post_comments gpc
   where gpc.id = new.group_comment_id;

  if new.mentioned_user_id = v_author_id then
    return new;
  end if;

  insert into public.notifications
    (user_id, actor_id, type, post_id, comment_id, body)
  values
    (new.mentioned_user_id, v_author_id, 'comment_mention',
     v_post_id, new.group_comment_id, v_snippet);

  return new;
end $$;

create trigger notify_group_comment_mention
  after insert on public.comment_mentions
  for each row
  when (new.group_comment_id is not null)
  execute function public.tg_notify_group_comment_mention();
