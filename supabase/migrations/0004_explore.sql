-- M4 — explore: text-post categories.
-- Run after 0003_profile_extensions.sql.

-- =========================================================================
-- profiles.age_18_confirmed — persists the one-time Naughty gate decision.
-- =========================================================================
alter table public.profiles
  add column if not exists age_18_confirmed bool not null default false;

-- =========================================================================
-- groups — the small fixed set of category rooms.
-- =========================================================================
-- `requires_age_gate` is true for Naughty; the client uses it (plus
-- profiles.age_18_confirmed) to decide whether to show the 18+ modal.

create table if not exists public.groups (
  id                 uuid primary key default gen_random_uuid(),
  slug               text unique not null,
  name               text not null,
  description        text,
  kind               text not null check (kind in ('pickup_lines','naughty','advice')),
  requires_age_gate  bool not null default false,
  sort_order         int  not null default 0,
  created_at         timestamptz not null default now()
);

insert into public.groups (slug, name, description, kind, requires_age_gate, sort_order) values
  ('pickup',  'Pickup lines',         'Drop a line. Get reactions.',         'pickup_lines', false, 1),
  ('naughty', 'Naughty 18+',          'Explicit. For adults only.',          'naughty',      true,  2),
  ('advice',  'Relationship advice',  'Ask. Listen. Help someone out.',      'advice',       false, 3)
on conflict (slug) do nothing;

-- =========================================================================
-- group_posts — text-only posts within a group.
-- =========================================================================
create table if not exists public.group_posts (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id)   on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (length(trim(body)) > 0 and length(body) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists group_posts_group_created_idx
  on public.group_posts (group_id, created_at desc);

-- =========================================================================
-- group_post_likes / group_post_comments
-- =========================================================================
create table if not exists public.group_post_likes (
  post_id    uuid not null references public.group_posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.group_post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.group_posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id)    on delete cascade,
  body       text not null check (length(trim(body)) > 0 and length(body) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists group_post_comments_post_created_idx
  on public.group_post_comments (post_id, created_at desc);

-- =========================================================================
-- group_posts_with_counts — single-query feed read per group.
-- =========================================================================
create or replace view public.group_posts_with_counts as
select
  p.id,
  p.group_id,
  g.slug         as group_slug,
  p.author_id,
  p.body,
  p.created_at,
  coalesce(l.like_count, 0)    as like_count,
  coalesce(c.comment_count, 0) as comment_count,
  exists (
    select 1 from public.group_post_likes
    where post_id = p.id and user_id = auth.uid()
  ) as liked_by_me,
  pr.handle        as author_handle,
  pr.display_name  as author_display_name,
  pr.avatar_url    as author_avatar_url
from public.group_posts p
join public.groups g on g.id = p.group_id
left join lateral (
  select count(*) as like_count from public.group_post_likes where post_id = p.id
) l on true
left join lateral (
  select count(*) as comment_count from public.group_post_comments where post_id = p.id
) c on true
left join public.profiles pr on pr.id = p.author_id;

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.groups              enable row level security;
alter table public.group_posts         enable row level security;
alter table public.group_post_likes    enable row level security;
alter table public.group_post_comments enable row level security;

-- Anyone signed in can read groups/posts/likes/comments.
drop policy if exists "groups_select_auth" on public.groups;
create policy "groups_select_auth" on public.groups for select to authenticated using (true);

drop policy if exists "gposts_select_auth" on public.group_posts;
create policy "gposts_select_auth" on public.group_posts for select to authenticated using (true);

drop policy if exists "glikes_select_auth" on public.group_post_likes;
create policy "glikes_select_auth" on public.group_post_likes for select to authenticated using (true);

drop policy if exists "gcomments_select_auth" on public.group_post_comments;
create policy "gcomments_select_auth" on public.group_post_comments for select to authenticated using (true);

-- Insert own content only.
drop policy if exists "gposts_insert_own" on public.group_posts;
create policy "gposts_insert_own" on public.group_posts
  for insert to authenticated with check (auth.uid() = author_id);

drop policy if exists "glikes_insert_own" on public.group_post_likes;
create policy "glikes_insert_own" on public.group_post_likes
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "gcomments_insert_own" on public.group_post_comments;
create policy "gcomments_insert_own" on public.group_post_comments
  for insert to authenticated with check (auth.uid() = author_id);

-- Delete own content only.
drop policy if exists "gposts_delete_own" on public.group_posts;
create policy "gposts_delete_own" on public.group_posts
  for delete to authenticated using (auth.uid() = author_id);

drop policy if exists "glikes_delete_own" on public.group_post_likes;
create policy "glikes_delete_own" on public.group_post_likes
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "gcomments_delete_own" on public.group_post_comments;
create policy "gcomments_delete_own" on public.group_post_comments
  for delete to authenticated using (auth.uid() = author_id);

-- =========================================================================
-- Realtime publication
-- =========================================================================
alter publication supabase_realtime add table public.group_posts;
alter publication supabase_realtime add table public.group_post_likes;
alter publication supabase_realtime add table public.group_post_comments;
