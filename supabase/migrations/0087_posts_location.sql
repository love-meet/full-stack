-- Add location fields to posts table

alter table public.posts
add column if not exists location_label text,
add column if not exists location_lat numeric,
add column if not exists location_lon numeric;

-- Update posts_with_counts view to include location
drop view if exists public.posts_with_counts;

create or replace view public.posts_with_counts as
select
  p.id,
  p.author_id,
  p.kind,
  p.media_url,
  p.media_aspect,
  p.caption,
  p.created_at,
  p.location_label,
  p.location_lat,
  p.location_lon,
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
