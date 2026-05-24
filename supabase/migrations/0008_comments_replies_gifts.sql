-- M3+ — threaded comment replies, comment likes, gift sends on posts.
-- Run after 0007_post_settings.sql.

-- =========================================================================
-- post_comments — add parent_id for 1-level reply threading.
-- =========================================================================
alter table public.post_comments
  add column if not exists parent_id uuid
    references public.post_comments(id) on delete cascade;

create index if not exists post_comments_parent_idx
  on public.post_comments (parent_id, created_at);

-- =========================================================================
-- post_comment_likes — heart per comment, optimistic UI in the client.
-- =========================================================================
create table if not exists public.post_comment_likes (
  comment_id  uuid not null references public.post_comments(id) on delete cascade,
  user_id     uuid not null references public.profiles(id)      on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists post_comment_likes_user_idx
  on public.post_comment_likes (user_id);

-- =========================================================================
-- post_gifts — record of a gift sent on a post.
-- =========================================================================
-- The gift catalogue lives in client code for now (no admin yet). We store
-- the gift_id (catalogue slug) + the human-facing name + the cost in cents
-- denominated in USDT (matches our ledger plan). A future M7 wallet pass
-- will atomically debit the sender / credit the recipient via an RPC.

-- Status lifecycle mirrors the old Mongo Gift (pending → accepted/rejected).
-- The balance debit/credit dance lands with M7 wallet via a respond_gift RPC.
create table if not exists public.post_gifts (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts(id)    on delete cascade,
  sender_id     uuid not null references public.profiles(id) on delete cascade,
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  gift_id       text not null,                  -- catalogue id (e.g. '456720' from flowers.js)
  gift_name     text not null,                  -- denormalized name at time of send
  gift_image    text,                           -- denormalized cdn url at time of send
  amount_cents  int  not null check (amount_cents >= 0),  -- USDT cents
  status        text not null default 'pending'
                check (status in ('pending','accepted','rejected','failed')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz
);

create index if not exists post_gifts_post_idx      on public.post_gifts (post_id, created_at desc);
create index if not exists post_gifts_recipient_idx on public.post_gifts (recipient_id, created_at desc);

-- =========================================================================
-- post_comments_with_meta — single-query reads for the CommentSheet.
-- =========================================================================
-- For each comment: like count, whether *I* liked it, reply count, and the
-- author's display slice. Replies are fetched via WHERE parent_id IS NOT
-- NULL filter on the same view.
create or replace view public.post_comments_with_meta as
select
  c.id,
  c.post_id,
  c.parent_id,
  c.author_id,
  c.body,
  c.created_at,
  coalesce(l.like_count, 0)  as like_count,
  exists (
    select 1 from public.post_comment_likes
    where comment_id = c.id and user_id = auth.uid()
  ) as liked_by_me,
  coalesce(r.reply_count, 0) as reply_count,
  pr.handle        as author_handle,
  pr.display_name  as author_display_name,
  pr.avatar_url    as author_avatar_url,
  pr.gender        as author_gender
from public.post_comments c
left join lateral (
  select count(*) as like_count from public.post_comment_likes where comment_id = c.id
) l on true
left join lateral (
  select count(*) as reply_count from public.post_comments where parent_id = c.id
) r on true
left join public.profiles pr on pr.id = c.author_id;

-- =========================================================================
-- posts_with_counts — rebuild to surface gift_count.
-- =========================================================================
-- CREATE OR REPLACE VIEW would refuse to reorder columns; drop first.
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
  pr.handle        as author_handle,
  pr.display_name  as author_display_name,
  pr.avatar_url    as author_avatar_url,
  pr.gender        as author_gender
from public.posts p
left join lateral (
  select count(*) as like_count from public.post_likes where post_id = p.id
) l on true
left join lateral (
  -- Only count root-level comments (replies aren't visible from the feed card).
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
alter table public.post_comment_likes enable row level security;
alter table public.post_gifts         enable row level security;

-- post_comment_likes
drop policy if exists "pcl_select_auth" on public.post_comment_likes;
create policy "pcl_select_auth" on public.post_comment_likes
  for select to authenticated using (true);

drop policy if exists "pcl_insert_own" on public.post_comment_likes;
create policy "pcl_insert_own" on public.post_comment_likes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "pcl_delete_own" on public.post_comment_likes;
create policy "pcl_delete_own" on public.post_comment_likes
  for delete to authenticated using (user_id = auth.uid());

-- post_gifts
drop policy if exists "pgifts_select_auth" on public.post_gifts;
create policy "pgifts_select_auth" on public.post_gifts
  for select to authenticated using (true);

drop policy if exists "pgifts_insert_own_send" on public.post_gifts;
create policy "pgifts_insert_own_send" on public.post_gifts
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_id <> recipient_id
    -- Recipient must be the author of the post we're attaching the gift to.
    and exists (
      select 1 from public.posts p
       where p.id = post_id and p.author_id = recipient_id
    )
  );

-- (Gifts are not user-deletable — they're records of a transaction.)

-- =========================================================================
-- Realtime
-- =========================================================================
alter publication supabase_realtime add table public.post_comment_likes;
alter publication supabase_realtime add table public.post_gifts;
