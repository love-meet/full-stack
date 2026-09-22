-- 0107_friends_are_mutual_follows.sql
--
-- A friend is someone who follows you back.
--
-- 0105 defined a friend as a mutual *match* — both people marked Interested in
-- the gallery. That is a dating signal, and it is the one the Interested tab
-- already reports. A friend is the social signal: you follow each other. The
-- two are different relationships and the Friends tab wants the second one.
--
-- public.follows has existed since 0052 with the right shape already — one row
-- per direction — so "mutual" is just both rows being present. Nothing needs
-- backfilling and no existing follow is disturbed.
--
-- Also adds friends_posts(): what those people have posted. The Friends tab
-- shows their posts, not a directory of faces.
-- ==========================================================================

-- =========================================================================
-- get_my_friends() — mutual follows.
-- =========================================================================
-- Same return shape as 0105 so the client keeps working; `matched_at` becomes
-- "since when have we followed each other", which is the later of the two
-- follow rows.
create or replace function public.get_my_friends()
returns table (
  id              uuid,
  handle          text,
  display_name    text,
  avatar_url      text,
  gender          text,
  region          text,
  country_name    text,
  city            text,
  language        text,
  dob             date,
  gallery_urls    text[],
  matched_at      timestamptz,
  conversation_id uuid
)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  return query
    select pr.id, pr.handle, pr.display_name, pr.avatar_url,
           pr.gender::text, pr.region, pr.country_name, pr.city,
           pr.language, pr.dob, coalesce(pr.gallery_urls, '{}'::text[]),
           greatest(mine.created_at, theirs.created_at),
           -- The DM if one already exists, so the tile can jump straight in.
           -- There is no is_group flag on conversations: a DM is simply a
           -- conversation whose membership is exactly the two of us.
           (select m1.conversation_id
              from public.conversation_members m1
              join public.conversation_members m2
                on m2.conversation_id = m1.conversation_id and m2.user_id = pr.id
             where m1.user_id = me
               and (select count(*) from public.conversation_members m3
                     where m3.conversation_id = m1.conversation_id) = 2
             limit 1)
      from public.follows mine
      join public.follows theirs
        on theirs.follower_id = mine.following_id
       and theirs.following_id = mine.follower_id
      join public.profiles pr on pr.id = mine.following_id
     where mine.follower_id = me
       and pr.deleted_at is null
       -- Bots are out of every people surface (Victor, 20 Sep).
       and coalesce(pr.is_bot, false) = false
       and not exists (
             select 1 from public.user_blocks ub
              where (ub.blocker_id = me and ub.blocked_id = pr.id)
                 or (ub.blocker_id = pr.id and ub.blocked_id = me)
           )
     order by greatest(mine.created_at, theirs.created_at) desc;
end $$;

grant execute on function public.get_my_friends() to authenticated;

-- =========================================================================
-- friends_posts(limit, offset) — what your friends posted.
-- =========================================================================
-- Deliberately NOT a return to the public post feed that §1 removed. This is
-- scoped to people who follow you back and who you follow: no strangers, no
-- ranking, no discovery. Newest first.
create or replace function public.friends_posts(p_limit int default 10, p_offset int default 0)
returns setof public.posts_with_counts
language sql stable security definer set search_path = public
as $$
  select pwc.*
    from public.posts_with_counts pwc
    join public.profiles a on a.id = pwc.author_id
   where a.deleted_at is null
     and coalesce(a.is_bot, false) = false
     and exists (
           select 1
             from public.follows mine
             join public.follows theirs
               on theirs.follower_id = mine.following_id
              and theirs.following_id = mine.follower_id
            where mine.follower_id = auth.uid()
              and mine.following_id = pwc.author_id
         )
     and not exists (
           select 1 from public.user_blocks ub
            where (ub.blocker_id = auth.uid() and ub.blocked_id = pwc.author_id)
               or (ub.blocker_id = pwc.author_id and ub.blocked_id = auth.uid())
         )
   order by pwc.created_at desc
   limit greatest(1, p_limit) offset greatest(0, p_offset);
$$;

grant execute on function public.friends_posts(int, int) to authenticated;

-- =========================================================================
-- profile_action_state(ids) — now also reports the follow edge.
-- =========================================================================
-- The card's follow badge needs to know whether you already follow them, and
-- it has to arrive with everything else: asking separately would leave a "+"
-- sitting on people you already follow until a second request landed.
--
-- Dropped first because the return type gains a column, and `create or
-- replace` cannot change a function's OUT parameters.
drop function if exists public.profile_action_state(uuid[]);

create function public.profile_action_state(p_ids uuid[])
returns table (
  profile_id     uuid,
  comment_count  int,
  gift_count     int,
  like_count     int,
  saved_by_me    boolean,
  liked_by_me    boolean,
  gifted_by_me   boolean,
  followed_by_me boolean,
  follows_me     boolean
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
                    where g.sender_id = me and g.recipient_id = t.id),
           exists (select 1 from public.follows f
                    where f.follower_id = me and f.following_id = t.id),
           exists (select 1 from public.follows f
                    where f.follower_id = t.id and f.following_id = me)
      from unnest(p_ids) as t(id);
end $$;

grant execute on function public.profile_action_state(uuid[]) to authenticated;
