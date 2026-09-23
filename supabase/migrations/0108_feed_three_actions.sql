-- 0108_feed_three_actions.sql
--
-- HS-LM-v1 §04 and §05 replace the feed and friends model.
--
-- THE FEED HAS THREE ACTIONS AND NOTHING ELSE: Interested, Reject, Gift.
-- No likes, no comments, no counts, no followers. "Nothing public to perform
-- for." Everything that made the card a social object comes out.
--
-- A FRIEND COMES FROM INTERESTED, NOT FROM A FOLLOW. §05: the list is
-- "everyone you said you were interested in, and everyone who said it about
-- you" — a union, not an intersection. §04 agrees: one person tapping
-- Interested puts each of them on the other's list and opens the chat. That
-- is deliberate. A mutual-only list would leave the app dead until two people
-- happened to choose each other, which §07 flags as the thing that decides
-- whether anyone comes back.
--
-- AND THE FEED NEVER REPEATS AN ANSWERED PROFILE. §04: "they never see a
-- profile they have already answered." Today the cursor wraps over every
-- eligible profile including ones already decided on.
--
-- Append-only: 0107 built friends on public.follows. That is superseded here
-- rather than reverted — the follows table keeps its rows, nothing is dropped,
-- and get_my_friends() simply stops reading it.
-- ==========================================================================

-- -------------------------------------------------------------------------
-- 1. A status line people set themselves (§05).
-- -------------------------------------------------------------------------
alter table public.profiles
  add column if not exists status_line text;

alter table public.profiles
  drop constraint if exists profiles_status_line_len;
alter table public.profiles
  add constraint profiles_status_line_len
  check (status_line is null or length(status_line) <= 80);

-- -------------------------------------------------------------------------
-- 2. The feed skips anyone you have already answered.
--
-- "Answered" means a gallery_interests row in either direction of decision —
-- Interested or Reject. Rejects are silent: the other person is never told,
-- so this is the only place the decision has any effect.
-- -------------------------------------------------------------------------
create or replace function public.feed_eligible_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select p.id
    from public.profiles p
   cross join (
     select id, gender, interested_in from public.profiles where id = auth.uid()
   ) me
   where p.id <> me.id
     and p.deleted_at is null
     and p.onboarded_at is not null
     and p.avatar_url is not null
     and btrim(p.avatar_url) <> ''
     and p.gender is not null
     and not public.is_bot_profile(p.is_bot, p.bot_kind)
     -- They are what I am looking for ...
     and p.gender = any(
       case when coalesce(array_length(me.interested_in, 1), 0) = 0
            then public.default_interested_in(me.gender)
            else me.interested_in end)
     -- ... and I am what they are looking for.
     and me.gender = any(
       case when coalesce(array_length(p.interested_in, 1), 0) = 0
            then public.default_interested_in(p.gender)
            else p.interested_in end)
     -- §04: never show a profile this viewer has already answered.
     and not exists (
       select 1 from public.gallery_interests gi
        where gi.user_id = me.id and gi.target_id = p.id
     )
     and not exists (
       select 1 from public.user_blocks b
        where (b.blocker_id = me.id and b.blocked_id = p.id)
           or (b.blocker_id = p.id  and b.blocked_id = me.id)
     );
$$;

grant execute on function public.feed_eligible_ids() to authenticated;

-- -------------------------------------------------------------------------
-- 3. get_my_friends() — from Interested, in both directions.
--
-- Replaces the mutual-follow version from 0107. `they_said_it` lets the UI
-- distinguish someone you chose from someone who chose you, which is the
-- difference between "you liked them" and "they liked you" in the list.
-- -------------------------------------------------------------------------
drop function if exists public.get_my_friends();

create function public.get_my_friends()
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
  status_line     text,
  last_seen_at    timestamptz,
  i_said_it       boolean,
  they_said_it    boolean,
  since           timestamptz,
  conversation_id uuid
)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  -- NOTE ON THE COLUMN NAMES BELOW.
  --
  -- Every name in this CTE is suffixed. A RETURNS TABLE declares its columns
  -- as OUT parameters, and inside the body those names outrank anything in
  -- the query — so a CTE column called `since` or `i_said_it` collides with
  -- the OUT parameter of the same name and Postgres raises 42702, "it could
  -- refer to either a PL/pgSQL variable or a table column", at call time
  -- rather than at create time. The function looks perfectly fine until
  -- someone opens their friends list.
  return query
  with edges as (
    -- People I said Interested about.
    select gi.target_id as other_id, true as mine_flag, false as theirs_flag,
           gi.created_at as at_
      from public.gallery_interests gi
     where gi.user_id = me and gi.decision = 'interested'
    union all
    -- People who said it about me.
    select gi.user_id as other_id, false, true, gi.created_at
      from public.gallery_interests gi
     where gi.target_id = me and gi.decision = 'interested'
  ),
  merged as (
    select e.other_id,
           bool_or(e.mine_flag)   as mine_any,
           bool_or(e.theirs_flag) as theirs_any,
           min(e.at_)             as first_at
      from edges e
     group by e.other_id
  )
  select pr.id, pr.handle, pr.display_name, pr.avatar_url, pr.gender::text,
         pr.region, pr.country_name, pr.city, pr.language, pr.dob,
         coalesce(pr.gallery_urls, '{}'::text[]),
         pr.status_line, pr.last_seen_at,
         m.mine_any, m.theirs_any, m.first_at,
         -- The existing DM, if there is one. Same shape start_dm uses to find
         -- it: a conversation with exactly the two of us in it. There is no
         -- is_group column — two members IS the definition of a DM here.
         --
         -- Every column is table-qualified for the same reason as the CTE
         -- above: `conversation_id` is one of this function's OUT parameters,
         -- so an unqualified `conversation_id = c.id` is ambiguous and fails
         -- at call time with 42702.
         (select c.id
            from public.conversations c
           where exists (select 1 from public.conversation_members cm1
                          where cm1.conversation_id = c.id and cm1.user_id = me)
             and exists (select 1 from public.conversation_members cm2
                          where cm2.conversation_id = c.id and cm2.user_id = pr.id)
             and (select count(*) from public.conversation_members cm3
                   where cm3.conversation_id = c.id) = 2
           limit 1)
    from merged m
    join public.profiles pr on pr.id = m.other_id
   where pr.deleted_at is null
     and coalesce(pr.is_bot, false) = false
     and not exists (
           select 1 from public.user_blocks ub
            where (ub.blocker_id = me and ub.blocked_id = pr.id)
               or (ub.blocker_id = pr.id and ub.blocked_id = me)
         )
   order by m.first_at desc;
end $$;

grant execute on function public.get_my_friends() to authenticated;

-- -------------------------------------------------------------------------
-- 4. remove_friend(other) — §07 lists this as missing and store-blocking.
--
-- "Interested is currently a one-way door. There is no way to undo it."
-- Clears the decision in BOTH directions: taking someone off your list must
-- also take you off theirs, or they keep a friend who has left. The profile
-- then becomes eligible for the feed again only if neither side has a row,
-- which is what makes this an undo rather than a block.
-- -------------------------------------------------------------------------
create or replace function public.remove_friend(p_other uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  delete from public.gallery_interests
   where (user_id = me and target_id = p_other)
      or (user_id = p_other and target_id = me);

  delete from public.matches
   where user_a = least(me, p_other) and user_b = greatest(me, p_other);
end $$;

grant execute on function public.remove_friend(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- 5. friends_posts() follows the new definition of a friend.
--
-- 0107 scoped it to mutual follows. With friendship now coming from
-- Interested in either direction, that join looks at a relationship nothing
-- creates any more, so the Friends tab would simply be empty for everybody.
-- Still friends-only: no discovery, no ranking, no strangers.
-- -------------------------------------------------------------------------
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
           select 1 from public.gallery_interests gi
            where gi.decision = 'interested'
              and ((gi.user_id = auth.uid()   and gi.target_id = pwc.author_id)
                or (gi.target_id = auth.uid() and gi.user_id   = pwc.author_id))
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

-- -------------------------------------------------------------------------
-- 6. set_status_line(text)
-- -------------------------------------------------------------------------
create or replace function public.set_status_line(p_text text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  val text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if me is null then raise exception 'not authenticated'; end if;
  if val is not null and length(val) > 80 then
    raise exception 'status too long';
  end if;
  update public.profiles set status_line = val where id = me;
  return val;
end $$;

grant execute on function public.set_status_line(text) to authenticated;
