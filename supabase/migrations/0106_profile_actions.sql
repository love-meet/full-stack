-- 0106_profile_actions.sql
--
-- Comment / Save / Gift, targeted at a profile instead of a post.
--
-- The feed is people (§5) and §1 removed the post feed, so the existing
-- post_comments / post_bookmarks / post_gifts tables have nothing to point at
-- from a feed card — every one of them is keyed to public.posts(id). Rather
-- than bring posts back, profiles get their own targets. Same three actions,
-- same shapes, a profile on the other end.
--
-- Nothing here touches credits. Gifts stay cosmetic (§ Victor, 19 Sep: "make
-- them free and purely cosmetic … they must NOT grant credits to the
-- recipient"), comments and saves were never priced. The one new cost in the
-- app is still the daily messaging charge.
--
-- Blocks are honoured in both directions everywhere, matching the feed.
-- ==========================================================================

-- =========================================================================
-- profile_comments — what people say on someone's profile.
-- =========================================================================
-- parent_id gives one level of replies, exactly like post_comments. Deeper
-- threading was never used there and is not worth the read cost here.
create table if not exists public.profile_comments (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,  -- whose profile
  author_id  uuid not null references public.profiles(id) on delete cascade,  -- who wrote it
  parent_id  uuid references public.profile_comments(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists profile_comments_profile_idx
  on public.profile_comments (profile_id, created_at desc) where deleted_at is null;
create index if not exists profile_comments_parent_idx
  on public.profile_comments (parent_id, created_at) where deleted_at is null;
create index if not exists profile_comments_author_idx
  on public.profile_comments (author_id);

alter table public.profile_comments enable row level security;

-- Readable by anyone signed in, subject to blocks. Writes go through the RPC
-- only, so rate limiting and the notification can't be bypassed.
drop policy if exists "profile_comments_select" on public.profile_comments;
create policy "profile_comments_select" on public.profile_comments
  for select to authenticated using (
    deleted_at is null
    and not exists (
      select 1 from public.user_blocks ub
       where (ub.blocker_id = auth.uid() and ub.blocked_id = author_id)
          or (ub.blocker_id = author_id and ub.blocked_id = auth.uid())
    )
  );

drop policy if exists "profile_comments_insert_none" on public.profile_comments;
create policy "profile_comments_insert_none" on public.profile_comments
  for insert to authenticated with check (false);

-- =========================================================================
-- profile_comment_likes
-- =========================================================================
create table if not exists public.profile_comment_likes (
  comment_id uuid not null references public.profile_comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id)         on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists profile_comment_likes_user_idx
  on public.profile_comment_likes (user_id);

alter table public.profile_comment_likes enable row level security;

drop policy if exists "profile_comment_likes_select" on public.profile_comment_likes;
create policy "profile_comment_likes_select" on public.profile_comment_likes
  for select to authenticated using (true);

drop policy if exists "profile_comment_likes_write_own" on public.profile_comment_likes;
create policy "profile_comment_likes_write_own" on public.profile_comment_likes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- profile_bookmarks — "Save"
-- =========================================================================
-- Private: only the person who saved can see the row, the saved person is
-- never told. A save that notified would be a like with extra steps.
create table if not exists public.profile_bookmarks (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, profile_id),
  check (user_id <> profile_id)
);

create index if not exists profile_bookmarks_user_created_idx
  on public.profile_bookmarks (user_id, created_at desc);

alter table public.profile_bookmarks enable row level security;

drop policy if exists "profile_bookmarks_own" on public.profile_bookmarks;
create policy "profile_bookmarks_own" on public.profile_bookmarks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- profile_gifts — a cosmetic gift sent to a person.
-- =========================================================================
-- Deliberately no amount column at all. post_gifts still carries
-- amount_cents from when gifts were priced; this table never had a price, so
-- there is nothing to zero out and no column a future change could start
-- filling in. Status is 'sent' or 'rejected' — there is no escrow to accept.
create table if not exists public.profile_gifts (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  gift_id      text not null,
  gift_name    text not null,
  gift_image   text,
  status       text not null default 'sent' check (status in ('sent', 'rejected')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> recipient_id)
);

create index if not exists profile_gifts_recipient_idx
  on public.profile_gifts (recipient_id, created_at desc);
create index if not exists profile_gifts_sender_idx
  on public.profile_gifts (sender_id, created_at desc);

alter table public.profile_gifts enable row level security;

drop policy if exists "profile_gifts_select_involved" on public.profile_gifts;
create policy "profile_gifts_select_involved" on public.profile_gifts
  for select to authenticated using (auth.uid() in (sender_id, recipient_id));

drop policy if exists "profile_gifts_insert_none" on public.profile_gifts;
create policy "profile_gifts_insert_none" on public.profile_gifts
  for insert to authenticated with check (false);

-- =========================================================================
-- add_profile_comment(profile, body, parent)
-- =========================================================================
create or replace function public.add_profile_comment(
  p_profile_id uuid,
  p_body       text,
  p_parent_id  uuid default null
) returns public.profile_comments
language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  row public.profile_comments;
begin
  if me is null then raise exception 'not authenticated'; end if;

  if not exists (select 1 from public.profiles p
                  where p.id = p_profile_id and p.deleted_at is null
                    and coalesce(p.is_bot, false) = false) then
    raise exception 'no such profile';
  end if;

  -- A block in either direction means neither can write on the other.
  if exists (select 1 from public.user_blocks ub
              where (ub.blocker_id = me and ub.blocked_id = p_profile_id)
                 or (ub.blocker_id = p_profile_id and ub.blocked_id = me)) then
    raise exception 'blocked';
  end if;

  -- A reply must belong to the same profile, or threads could be stitched
  -- across people.
  if p_parent_id is not null
     and not exists (select 1 from public.profile_comments c
                      where c.id = p_parent_id and c.profile_id = p_profile_id
                        and c.parent_id is null) then
    raise exception 'no such parent comment';
  end if;

  insert into public.profile_comments (profile_id, author_id, parent_id, body)
       values (p_profile_id, me, p_parent_id, btrim(p_body))
    returning * into row;

  -- Don't notify yourself for writing on your own profile.
  if p_profile_id <> me then
    insert into public.notifications (user_id, actor_id, type, body)
         values (p_profile_id, me, 'profile_comment', left(btrim(p_body), 140));
  end if;

  return row;
end $$;

grant execute on function public.add_profile_comment(uuid, text, uuid) to authenticated;

-- =========================================================================
-- delete_profile_comment(comment)
-- =========================================================================
-- The author can delete their own comment; so can the profile's owner, since
-- it is their wall. Soft delete so replies keep their anchor.
create or replace function public.delete_profile_comment(p_comment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  update public.profile_comments
     set deleted_at = now()
   where id = p_comment_id
     and deleted_at is null
     and (author_id = me or profile_id = me);

  if not found then raise exception 'not yours to delete'; end if;
end $$;

grant execute on function public.delete_profile_comment(uuid) to authenticated;

-- =========================================================================
-- toggle_profile_comment_like(comment) → liked?
-- =========================================================================
create or replace function public.toggle_profile_comment_like(p_comment_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  delete from public.profile_comment_likes
   where comment_id = p_comment_id and user_id = me;
  if found then return false; end if;

  insert into public.profile_comment_likes (comment_id, user_id)
       values (p_comment_id, me);
  return true;
end $$;

grant execute on function public.toggle_profile_comment_like(uuid) to authenticated;

-- =========================================================================
-- get_profile_comments(profile, limit, before) — a page for the sheet.
-- =========================================================================
-- Top-level comments only, newest first, each with its author slice, like
-- count, whether I liked it, and how many replies it has. Replies are fetched
-- by passing the parent to get_profile_comment_replies().
create or replace function public.get_profile_comments(
  p_profile_id uuid,
  p_limit      int  default 30,
  p_before     timestamptz default null
) returns table (
  id            uuid,
  author_id     uuid,
  handle        text,
  display_name  text,
  avatar_url    text,
  body          text,
  created_at    timestamptz,
  like_count    int,
  liked_by_me   boolean,
  reply_count   int,
  can_delete    boolean
)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  return query
    select c.id, c.author_id, a.handle, a.display_name, a.avatar_url,
           c.body, c.created_at,
           (select count(*)::int from public.profile_comment_likes l where l.comment_id = c.id),
           exists (select 1 from public.profile_comment_likes l
                    where l.comment_id = c.id and l.user_id = me),
           (select count(*)::int from public.profile_comments r
             where r.parent_id = c.id and r.deleted_at is null),
           (c.author_id = me or c.profile_id = me)
      from public.profile_comments c
      join public.profiles a on a.id = c.author_id
     where c.profile_id = p_profile_id
       and c.parent_id is null
       and c.deleted_at is null
       and (p_before is null or c.created_at < p_before)
       and not exists (
             select 1 from public.user_blocks ub
              where (ub.blocker_id = me and ub.blocked_id = c.author_id)
                 or (ub.blocker_id = c.author_id and ub.blocked_id = me)
           )
     order by c.created_at desc
     limit least(greatest(p_limit, 1), 100);
end $$;

grant execute on function public.get_profile_comments(uuid, int, timestamptz) to authenticated;

-- =========================================================================
-- get_profile_comment_replies(parent)
-- =========================================================================
create or replace function public.get_profile_comment_replies(p_parent_id uuid)
returns table (
  id           uuid,
  author_id    uuid,
  handle       text,
  display_name text,
  avatar_url   text,
  body         text,
  created_at   timestamptz,
  like_count   int,
  liked_by_me  boolean,
  can_delete   boolean
)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  return query
    select c.id, c.author_id, a.handle, a.display_name, a.avatar_url,
           c.body, c.created_at,
           (select count(*)::int from public.profile_comment_likes l where l.comment_id = c.id),
           exists (select 1 from public.profile_comment_likes l
                    where l.comment_id = c.id and l.user_id = me),
           (c.author_id = me or c.profile_id = me)
      from public.profile_comments c
      join public.profiles a on a.id = c.author_id
     where c.parent_id = p_parent_id
       and c.deleted_at is null
       and not exists (
             select 1 from public.user_blocks ub
              where (ub.blocker_id = me and ub.blocked_id = c.author_id)
                 or (ub.blocker_id = c.author_id and ub.blocked_id = me)
           )
     order by c.created_at asc;
end $$;

grant execute on function public.get_profile_comment_replies(uuid) to authenticated;

-- =========================================================================
-- toggle_profile_bookmark(profile) → saved?
-- =========================================================================
create or replace function public.toggle_profile_bookmark(p_profile_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_profile_id = me then raise exception 'you cannot save yourself'; end if;

  delete from public.profile_bookmarks
   where user_id = me and profile_id = p_profile_id;
  if found then return false; end if;

  insert into public.profile_bookmarks (user_id, profile_id)
       values (me, p_profile_id);
  return true;
end $$;

grant execute on function public.toggle_profile_bookmark(uuid) to authenticated;

-- =========================================================================
-- get_saved_profiles() — the Saved list.
-- =========================================================================
create or replace function public.get_saved_profiles()
returns table (
  id           uuid,
  handle       text,
  display_name text,
  avatar_url   text,
  gender       text,
  region       text,
  country_name text,
  city         text,
  language     text,
  dob          date,
  gallery_urls text[],
  saved_at     timestamptz
)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  return query
    select pr.id, pr.handle, pr.display_name, pr.avatar_url, pr.gender::text,
           pr.region, pr.country_name, pr.city, pr.language, pr.dob,
           coalesce(pr.gallery_urls, '{}'::text[]), b.created_at
      from public.profile_bookmarks b
      join public.profiles pr on pr.id = b.profile_id
     where b.user_id = me
       and pr.deleted_at is null
       and not exists (
             select 1 from public.user_blocks ub
              where (ub.blocker_id = me and ub.blocked_id = pr.id)
                 or (ub.blocker_id = pr.id and ub.blocked_id = me)
           )
     order by b.created_at desc;
end $$;

grant execute on function public.get_saved_profiles() to authenticated;

-- =========================================================================
-- send_profile_gift(profile, gift…)
-- =========================================================================
-- Free and cosmetic. No debit, no credit, no escrow — the gift is a picture
-- with a name on it and a notification. Crediting the recipient is what would
-- let two accounts gift each other free messaging for ever, so it is absent
-- here by construction rather than by policy.
create or replace function public.send_profile_gift(
  p_profile_id uuid,
  p_gift_id    text,
  p_gift_name  text,
  p_gift_image text default null
) returns public.profile_gifts
language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  row public.profile_gifts;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_profile_id = me then raise exception 'you cannot gift yourself'; end if;

  if not exists (select 1 from public.profiles p
                  where p.id = p_profile_id and p.deleted_at is null
                    and coalesce(p.is_bot, false) = false) then
    raise exception 'no such profile';
  end if;

  if exists (select 1 from public.user_blocks ub
              where (ub.blocker_id = me and ub.blocked_id = p_profile_id)
                 or (ub.blocker_id = p_profile_id and ub.blocked_id = me)) then
    raise exception 'blocked';
  end if;

  insert into public.profile_gifts (sender_id, recipient_id, gift_id, gift_name, gift_image)
       values (me, p_profile_id, p_gift_id, p_gift_name, p_gift_image)
    returning * into row;

  insert into public.notifications (user_id, actor_id, type, body)
       values (p_profile_id, me, 'profile_gift', p_gift_name);

  return row;
end $$;

grant execute on function public.send_profile_gift(uuid, text, text, text) to authenticated;

-- =========================================================================
-- profile_action_state(ids) — one round-trip for a page of feed cards.
-- =========================================================================
-- The rail on each card needs four numbers and two booleans per person. Asked
-- one profile at a time that is twenty requests per feed page, so it takes the
-- whole page's ids at once.
create or replace function public.profile_action_state(p_ids uuid[])
returns table (
  profile_id    uuid,
  comment_count int,
  gift_count    int,
  like_count    int,
  saved_by_me   boolean,
  liked_by_me   boolean,
  gifted_by_me  boolean
)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  return query
    select t.id,
           (select count(*)::int from public.profile_comments c
             where c.profile_id = t.id and c.deleted_at is null),
           (select count(*)::int from public.profile_gifts g
             where g.recipient_id = t.id and g.status = 'sent'),
           -- "Likes" on a person are gallery interests — the same signal the
           -- Interested tab and matching run on, not a second parallel one.
           (select count(*)::int from public.gallery_interests gi
             where gi.target_id = t.id and gi.decision = 'interested'),
           exists (select 1 from public.profile_bookmarks b
                    where b.user_id = me and b.profile_id = t.id),
           exists (select 1 from public.gallery_interests gi
                    where gi.user_id = me and gi.target_id = t.id
                      and gi.decision = 'interested'),
           exists (select 1 from public.profile_gifts g
                    where g.sender_id = me and g.recipient_id = t.id)
      from unnest(p_ids) as t(id);
end $$;

grant execute on function public.profile_action_state(uuid[]) to authenticated;
