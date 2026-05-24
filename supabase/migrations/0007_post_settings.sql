-- Post-side advanced settings (mirrors Instagram's Advanced Settings panel).
-- Run after 0006_chat.sql.

alter table public.posts
  add column if not exists hide_like_count   bool not null default false,
  add column if not exists comments_disabled bool not null default false,
  add column if not exists alt_text          text;

-- The feed reads from posts_with_counts. Rebuild the view to surface the
-- new columns so the UI can honor them.
-- Note: CREATE OR REPLACE VIEW only allows APPENDING columns at the end,
-- never reordering or inserting. Drop + recreate so the new columns can
-- sit next to the rest of the post fields they belong with.
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
  exists (
    select 1 from public.post_likes
    where post_id = p.id and user_id = auth.uid()
  ) as liked_by_me,
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
