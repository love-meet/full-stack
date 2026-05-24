-- Rebuild posts_with_counts so `comment_count` totals roots + replies.
-- Earlier (0008) I filtered to root comments only, but the UX expects
-- "2 comments + 7 replies" to show as 9 on the post card.
-- Run after 0009_post_actions.sql.

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
  -- ALL comments (roots + replies) — was filtered to root only before.
  select count(*) as comment_count from public.post_comments where post_id = p.id
) c on true
left join lateral (
  select count(*) as gift_count from public.post_gifts where post_id = p.id
) g on true
left join public.profiles pr on pr.id = p.author_id;
