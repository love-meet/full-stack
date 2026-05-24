-- M3+++ — backing tables for the PostCard ⋯ menu (6 actions per state).
-- Run after 0008_comments_replies_gifts.sql.

-- =========================================================================
-- profiles.is_verified — drives the cyan verified badge in PostCard
-- =========================================================================
alter table public.profiles
  add column if not exists is_verified bool not null default false;

-- =========================================================================
-- post_bookmarks — "Save" / "Unsave"
-- =========================================================================
create table if not exists public.post_bookmarks (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  post_id    uuid not null references public.posts(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists post_bookmarks_user_created_idx
  on public.post_bookmarks (user_id, created_at desc);

-- =========================================================================
-- user_blocks — full block; future feed/chat queries filter on this
-- =========================================================================
create table if not exists public.user_blocks (
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- =========================================================================
-- user_mutes — softer than block; "I don't want to see your posts"
-- =========================================================================
create table if not exists public.user_mutes (
  muter_id   uuid not null references public.profiles(id) on delete cascade,
  muted_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

-- =========================================================================
-- post_reports — Report this post
-- =========================================================================
create table if not exists public.post_reports (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts(id)    on delete cascade,
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  reason       text not null check (reason in ('spam','inappropriate','harassment','underage','illegal','other')),
  note         text,
  status       text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at   timestamptz not null default now()
);

create index if not exists post_reports_post_idx       on public.post_reports (post_id);
create index if not exists post_reports_reporter_idx   on public.post_reports (reporter_id);
create index if not exists post_reports_open_status_idx on public.post_reports (status) where status = 'open';

-- =========================================================================
-- Rebuild posts_with_counts to surface author_is_verified + bookmarked_by_me
-- =========================================================================
drop view if exists public.posts_with_counts;
create view public.posts_with_counts as
select
  p.id,
  p.author_id,
  p.kind,
  p.media_url,
  p.media_aspect,
  p.caption,
  p.created_at,
  p.hide_like_count,
  p.comments_disabled,
  p.alt_text,
  coalesce(l.like_count, 0)    as like_count,
  coalesce(c.comment_count, 0) as comment_count,
  coalesce(g.gift_count, 0)    as gift_count,
  exists (
    select 1 from public.post_likes
    where post_id = p.id and user_id = auth.uid()
  ) as liked_by_me,
  exists (
    select 1 from public.post_bookmarks
    where post_id = p.id and user_id = auth.uid()
  ) as bookmarked_by_me,
  pr.handle        as author_handle,
  pr.display_name  as author_display_name,
  pr.avatar_url    as author_avatar_url,
  pr.gender        as author_gender,
  pr.is_verified   as author_is_verified
from public.posts p
left join lateral (
  select count(*) as like_count from public.post_likes where post_id = p.id
) l on true
left join lateral (
  select count(*) as comment_count from public.post_comments
   where post_id = p.id and parent_id is null
) c on true
left join lateral (
  select count(*) as gift_count from public.post_gifts where post_id = p.id
) g on true
left join public.profiles pr on pr.id = p.author_id;

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.post_bookmarks enable row level security;
alter table public.user_blocks    enable row level security;
alter table public.user_mutes     enable row level security;
alter table public.post_reports   enable row level security;

-- post_bookmarks — see your own bookmarks; insert/delete your own
drop policy if exists "bookmarks_select_own" on public.post_bookmarks;
create policy "bookmarks_select_own" on public.post_bookmarks
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "bookmarks_insert_own" on public.post_bookmarks;
create policy "bookmarks_insert_own" on public.post_bookmarks
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "bookmarks_delete_own" on public.post_bookmarks;
create policy "bookmarks_delete_own" on public.post_bookmarks
  for delete to authenticated using (user_id = auth.uid());

-- user_blocks — see your own blocks; insert/delete your own
drop policy if exists "blocks_select_own" on public.user_blocks;
create policy "blocks_select_own" on public.user_blocks
  for select to authenticated using (blocker_id = auth.uid());

drop policy if exists "blocks_insert_own" on public.user_blocks;
create policy "blocks_insert_own" on public.user_blocks
  for insert to authenticated with check (blocker_id = auth.uid());

drop policy if exists "blocks_delete_own" on public.user_blocks;
create policy "blocks_delete_own" on public.user_blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- user_mutes — same shape as blocks
drop policy if exists "mutes_select_own" on public.user_mutes;
create policy "mutes_select_own" on public.user_mutes
  for select to authenticated using (muter_id = auth.uid());

drop policy if exists "mutes_insert_own" on public.user_mutes;
create policy "mutes_insert_own" on public.user_mutes
  for insert to authenticated with check (muter_id = auth.uid());

drop policy if exists "mutes_delete_own" on public.user_mutes;
create policy "mutes_delete_own" on public.user_mutes
  for delete to authenticated using (muter_id = auth.uid());

-- post_reports — reporter can SELECT/INSERT their own; admins resolve via M8
drop policy if exists "reports_select_own" on public.post_reports;
create policy "reports_select_own" on public.post_reports
  for select to authenticated using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists "reports_insert_own" on public.post_reports;
create policy "reports_insert_own" on public.post_reports
  for insert to authenticated with check (reporter_id = auth.uid());

drop policy if exists "reports_update_admin" on public.post_reports;
create policy "reports_update_admin" on public.post_reports
  for update to authenticated using (public.is_admin());

-- =========================================================================
-- Realtime (so bookmark toggle reflects across tabs)
-- =========================================================================
alter publication supabase_realtime add table public.post_bookmarks;
