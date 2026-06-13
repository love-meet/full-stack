-- M3 — feed: posts, likes, comments, counts view, RLS.
--
-- Run after 0001_profiles.sql.
--
-- Also do this once in the Supabase dashboard:
--   Storage → New bucket → name: `post_media`, public: NO.
--   Then create the two policies in the "Policies" tab using the snippets at
--   the bottom of this file (Supabase doesn't let us declare bucket policies
--   in plain SQL the same way as tables; the policy DDL works but the bucket
--   row itself must exist first).

-- =========================================================================
-- posts
-- =========================================================================
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles(id) on delete cascade,
  kind          text not null check (kind in ('image','short_video')),
  media_url     text not null,
  media_aspect  numeric,                 -- width / height; the UI uses it for layout
  caption       text,
  created_at    timestamptz not null default now()
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_author_idx     on public.posts (author_id, created_at desc);

-- =========================================================================
-- post_likes
-- =========================================================================
create table if not exists public.post_likes (
  post_id    uuid not null references public.posts(id)    on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_user_idx on public.post_likes (user_id);

-- =========================================================================
-- post_comments
-- =========================================================================
create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id)    on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at desc);

-- =========================================================================
-- posts_with_counts — single-query feed read.
-- =========================================================================
-- Per-row counts via lateral counts. Cheap with the indexes above.
-- `liked_by_me` lets the UI render the heart filled without a second query.

create or replace view public.posts_with_counts as
select
  p.id,
  p.author_id,
  p.kind,
  p.media_url,
  p.media_aspect,
  p.caption,
  p.created_at,
  coalesce(l.like_count, 0)    as like_count,
  coalesce(c.comment_count, 0) as comment_count,
  exists (
    select 1 from public.post_likes
    where post_id = p.id and user_id = auth.uid()
  ) as liked_by_me,
  -- Surface a small slice of author info so the feed doesn't need a join.
  pr.handle        as author_handle,
  pr.display_name  as author_display_name,
  pr.avatar_url    as author_avatar_url
from public.posts p
left join lateral (
  select count(*) as like_count from public.post_likes where post_id = p.id
) l on true
left join lateral (
  select count(*) as comment_count from public.post_comments where post_id = p.id
) c on true
left join public.profiles pr on pr.id = p.author_id;

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.posts         enable row level security;
alter table public.post_likes    enable row level security;
alter table public.post_comments enable row level security;

-- Anyone signed in can read posts/likes/comments.
drop policy if exists "posts_select_auth"    on public.posts;
create policy "posts_select_auth"    on public.posts    for select to authenticated using (true);

drop policy if exists "likes_select_auth"    on public.post_likes;
create policy "likes_select_auth"    on public.post_likes    for select to authenticated using (true);

drop policy if exists "comments_select_auth" on public.post_comments;
create policy "comments_select_auth" on public.post_comments for select to authenticated using (true);

-- A user can only create their own content.
drop policy if exists "posts_insert_own"    on public.posts;
create policy "posts_insert_own"    on public.posts    for insert to authenticated with check (auth.uid() = author_id);

drop policy if exists "likes_insert_own"    on public.post_likes;
create policy "likes_insert_own"    on public.post_likes    for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "comments_insert_own" on public.post_comments;
create policy "comments_insert_own" on public.post_comments for insert to authenticated with check (auth.uid() = author_id);

-- A user can only delete their own content.
drop policy if exists "posts_delete_own"    on public.posts;
create policy "posts_delete_own"    on public.posts    for delete to authenticated using (auth.uid() = author_id);

drop policy if exists "likes_delete_own"    on public.post_likes;
create policy "likes_delete_own"    on public.post_likes    for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "comments_delete_own" on public.post_comments;
create policy "comments_delete_own" on public.post_comments for delete to authenticated using (auth.uid() = author_id);

-- =========================================================================
-- Realtime
-- =========================================================================
-- Add the three tables to the realtime publication so the client can listen
-- for INSERT/DELETE events and update the cached counts live.

alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.post_likes;
alter publication supabase_realtime add table public.post_comments;

-- =========================================================================
-- Storage policies — paste these AFTER creating the `post_media` bucket.
-- (Supabase dashboard: Storage → New bucket → name `post_media`, public off.)
-- =========================================================================
--
--  -- Anyone signed in can READ post media.
--  create policy "post_media_read_auth"
--    on storage.objects for select to authenticated
--    using (bucket_id = 'post_media');
--
--  -- Owners can INSERT into their own folder: post_media/<user_id>/<filename>.
--  create policy "post_media_insert_own"
--    on storage.objects for insert to authenticated
--    with check (
--      bucket_id = 'post_media'
--      and (storage.foldername(name))[1] = auth.uid()::text
--    );
--
--  -- Owners can DELETE their own files.
--  create policy "post_media_delete_own"
--    on storage.objects for delete to authenticated
--    using (
--      bucket_id = 'post_media'
--      and (storage.foldername(name))[1] = auth.uid()::text
--    );
