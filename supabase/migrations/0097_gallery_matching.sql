-- Gallery pivot, part 1: matching schema + gallery feed RPC.
--
-- Replaces the posts-based feed with a swipeable gallery-card feed and a
-- binary Interested/Pass decision, gated matching, and duplicate-view
-- prevention — per the 2026-07-25 product meeting. See project memory for
-- full context; summary of what this migration adds:
--
--   profiles.interested_in — which gender(s) a user wants to see. Empty
--     array (the default) means "no preference set — show everyone", so
--     existing users aren't suddenly filtered to nothing. New users set
--     this in onboarding's PreferencesStep going forward.
--
--   gallery_interests — one row per (viewer, target) Interested/Pass
--     decision. Upserted via record_gallery_decision() so a user can change
--     their mind. Both decisions permanently exclude that target from the
--     viewer's future feed (see get_gallery_feed) — Passed doesn't
--     resurface, matching the "no need to repeat, the pool is big enough"
--     call made in the meeting.
--
--   matches — populated by a trigger the moment BOTH sides have marked each
--     other Interested. Eagerly creates (or reuses) the 1-on-1 conversation
--     right then, so messaging is ready the instant both users see the
--     match — matches the "mutual match required before messaging" decision.
--     start_dm() is also updated to hard-require a match exists, so the
--     gate can't be bypassed by calling it directly.
--
--   gallery_views — records who's already been shown to whom, so
--     get_gallery_feed() never re-serves the same candidate twice.
--
--   get_gallery_feed(limit) — the feed RPC itself: random, not-yet-seen,
--     not-yet-decided, gender-filtered, block-aware candidates. Records the
--     serve as a "view" atomically so a refresh never repeats them, even if
--     the user never swiped Interested/Pass on what they were shown.

-- =========================================================================
-- profiles.interested_in
-- =========================================================================
alter table public.profiles
  add column if not exists interested_in text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_interested_in_check;
alter table public.profiles add constraint profiles_interested_in_check
  check (interested_in <@ array['female','male','nonbinary','other']::text[]);

-- =========================================================================
-- gallery_interests
-- =========================================================================
create table if not exists public.gallery_interests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  target_id  uuid not null references public.profiles(id) on delete cascade,
  decision   text not null check (decision in ('interested', 'passed')),
  created_at timestamptz not null default now(),
  unique (user_id, target_id),
  check (user_id <> target_id)
);

create index if not exists gallery_interests_user_idx   on public.gallery_interests (user_id, created_at desc);
create index if not exists gallery_interests_target_idx on public.gallery_interests (target_id);

alter table public.gallery_interests enable row level security;

-- Only your own outgoing decisions — needed for the Liked Gallery screen.
-- Writes happen exclusively through record_gallery_decision() below.
drop policy if exists "gallery_interests_select_own" on public.gallery_interests;
create policy "gallery_interests_select_own" on public.gallery_interests
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "gallery_interests_insert_none" on public.gallery_interests;
create policy "gallery_interests_insert_none" on public.gallery_interests
  for insert to authenticated with check (false);

-- =========================================================================
-- gallery_views — dedup log so a refresh never repeats a candidate.
-- =========================================================================
create table if not exists public.gallery_views (
  viewer_id  uuid not null references public.profiles(id) on delete cascade,
  target_id  uuid not null references public.profiles(id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (viewer_id, target_id)
);

create index if not exists gallery_views_viewer_idx on public.gallery_views (viewer_id);

alter table public.gallery_views enable row level security;

drop policy if exists "gallery_views_select_own" on public.gallery_views;
create policy "gallery_views_select_own" on public.gallery_views
  for select to authenticated using (viewer_id = auth.uid());

drop policy if exists "gallery_views_insert_none" on public.gallery_views;
create policy "gallery_views_insert_none" on public.gallery_views
  for insert to authenticated with check (false);

-- =========================================================================
-- matches
-- =========================================================================
create table if not exists public.matches (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references public.profiles(id) on delete cascade,
  user_b          uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  matched_at      timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b) -- canonical ordering: exactly one row per pair
);

create index if not exists matches_user_a_idx on public.matches (user_a);
create index if not exists matches_user_b_idx on public.matches (user_b);

alter table public.matches enable row level security;

drop policy if exists "matches_select_own" on public.matches;
create policy "matches_select_own" on public.matches
  for select to authenticated using (auth.uid() in (user_a, user_b));

-- No client writes — the trigger below (SECURITY DEFINER) is the only writer.
drop policy if exists "matches_insert_none" on public.matches;
create policy "matches_insert_none" on public.matches
  for insert to authenticated with check (false);

-- =========================================================================
-- record_gallery_decision(target, decision) — the only way to write
-- gallery_interests. Upserts so a user can flip Passed → Interested later.
-- =========================================================================
create or replace function public.record_gallery_decision(p_target_id uuid, p_decision text)
returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_target_id = me then raise exception 'cannot decide on yourself'; end if;
  if p_decision not in ('interested', 'passed') then raise exception 'invalid decision'; end if;
  if not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'target not found';
  end if;

  -- The feed already filters blocked users out of what's SHOWN, but this
  -- RPC is directly callable — without this check, a blocked user who kept
  -- the blocker's uuid could still force a match (via a stale reciprocal
  -- interest row), a conversation, and a notification onto their blocker.
  if exists (
    select 1 from public.user_blocks ub
     where (ub.blocker_id = me and ub.blocked_id = p_target_id)
        or (ub.blocker_id = p_target_id and ub.blocked_id = me)
  ) then
    raise exception 'target not found';
  end if;

  insert into public.gallery_interests (user_id, target_id, decision)
  values (me, p_target_id, p_decision)
  on conflict (user_id, target_id) do update set decision = excluded.decision, created_at = now();
end $$;

grant execute on function public.record_gallery_decision(uuid, text) to authenticated;

-- =========================================================================
-- Mutual-match trigger — fires on every insert/update to gallery_interests;
-- only acts when the new row is 'interested' AND the reverse row is too.
-- =========================================================================
create or replace function public.tg_check_mutual_match()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reciprocal boolean;
  a uuid;
  b uuid;
  conv_id uuid;
begin
  if new.decision <> 'interested' then
    return new;
  end if;

  -- Serialize concurrent reciprocal swipes on this pair. Without this,
  -- READ COMMITTED lets two simultaneous A→B / B→A inserts each miss the
  -- other's uncommitted row (no match ever created — and unrecoverable,
  -- since both are then excluded from each other's feeds) or both pass and
  -- collide on the matches unique constraint, aborting one user's swipe.
  -- The second transaction blocks here until the first commits, then sees
  -- its committed row.
  perform pg_advisory_xact_lock(
    hashtextextended(least(new.user_id, new.target_id)::text || ':' ||
                     greatest(new.user_id, new.target_id)::text, 42)
  );

  select exists(
    select 1 from public.gallery_interests
     where user_id = new.target_id and target_id = new.user_id and decision = 'interested'
  ) into reciprocal;

  if not reciprocal then
    return new;
  end if;

  a := least(new.user_id, new.target_id);
  b := greatest(new.user_id, new.target_id);

  if exists (select 1 from public.matches where user_a = a and user_b = b) then
    return new; -- already matched (e.g. re-triggered by an unrelated update)
  end if;

  -- Reuse an existing 1-on-1 conversation if these two already have one.
  select c.id into conv_id
    from public.conversations c
   where exists (select 1 from public.conversation_members where conversation_id = c.id and user_id = a)
     and exists (select 1 from public.conversation_members where conversation_id = c.id and user_id = b)
     and (select count(*) from public.conversation_members where conversation_id = c.id) = 2
   limit 1;

  if conv_id is null then
    insert into public.conversations default values returning id into conv_id;
    insert into public.conversation_members (conversation_id, user_id) values (conv_id, a), (conv_id, b);
  end if;

  -- Belt-and-suspenders: the advisory lock already serializes this pair,
  -- so a conflict here should be impossible — but never abort the user's
  -- swipe over it.
  insert into public.matches (user_a, user_b, conversation_id) values (a, b, conv_id)
  on conflict (user_a, user_b) do nothing;

  insert into public.notifications (user_id, actor_id, type, conversation_id)
  values (a, b, 'match', conv_id), (b, a, 'match', conv_id);

  return new;
end $$;

drop trigger if exists gallery_interests_check_match on public.gallery_interests;
create trigger gallery_interests_check_match
  after insert or update on public.gallery_interests
  for each row execute function public.tg_check_mutual_match();

-- =========================================================================
-- start_dm — now hard-requires a mutual match. The trigger above already
-- creates the conversation eagerly on match, so this mostly just becomes a
-- safe "reopen it" call, plus a backstop against calling it directly to
-- bypass the Interested/Pass flow entirely.
-- =========================================================================
create or replace function public.start_dm(other_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  my_id     uuid := auth.uid();
  conv_id   uuid;
  a uuid;
  b uuid;
  target_is_bot boolean;
begin
  if my_id is null then
    raise exception 'not authenticated';
  end if;
  if other_user_id = my_id then
    raise exception 'cannot dm yourself';
  end if;

  select p.is_bot into target_is_bot from public.profiles p where p.id = other_user_id;
  if target_is_bot is null then
    raise exception 'recipient not found';
  end if;

  -- Existing conversation? Always reopenable — the match gate must never
  -- lock people out of a conversation they already have (pre-pivot DMs,
  -- match-created conversations, support flows).
  select c.id
    into conv_id
    from public.conversations c
   where exists (select 1 from public.conversation_members
                  where conversation_id = c.id and user_id = my_id)
     and exists (select 1 from public.conversation_members
                  where conversation_id = c.id and user_id = other_user_id)
     and (select count(*) from public.conversation_members
           where conversation_id = c.id) = 2
   limit 1;

  if conv_id is not null then return conv_id; end if;

  -- New conversation: requires a mutual match — unless the recipient is a
  -- bot persona (bots never swipe, and being messageable is their purpose).
  a := least(my_id, other_user_id);
  b := greatest(my_id, other_user_id);
  if not target_is_bot
     and not exists (select 1 from public.matches where user_a = a and user_b = b) then
    raise exception 'no mutual match yet';
  end if;

  insert into public.conversations default values returning id into conv_id;
  insert into public.conversation_members (conversation_id, user_id)
    values (conv_id, my_id), (conv_id, other_user_id);
  return conv_id;
end $$;

grant execute on function public.start_dm(uuid) to authenticated;

-- =========================================================================
-- get_gallery_feed(limit) — the feed itself.
-- =========================================================================
-- Bots ARE included here (unlike searchable_profiles) — populating this
-- feed with lively-looking activity is the entire point of the bot roster.
create or replace function public.get_gallery_feed(p_limit int default 10)
returns table (
  id            uuid,
  handle        text,
  display_name  text,
  gender        text,
  country_code  text,
  gallery_urls  text[],
  age           int
)
language plpgsql security definer set search_path = public as $$
declare
  me            uuid := auth.uid();
  my_interests  text[];
  ids           uuid[];
  lim           int := least(greatest(1, p_limit), 50); -- cap: an uncapped
    -- limit would let one call random()-sort all of profiles AND mark the
    -- caller's entire candidate pool as viewed in one shot, irreversibly.
  attempt       int;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select coalesce(p.interested_in, '{}') into my_interests from public.profiles p where p.id = me;

  -- Attempt 1: fresh (never-served) candidates. If none remain, clear the
  -- view log for candidates the user never actually DECIDED on and retry —
  -- served-but-unswiped people rotate back in instead of the pool being
  -- permanently burned by refills the user never scrolled to. Decided
  -- (interested/passed) targets stay excluded forever, per product.
  for attempt in 1..2 loop
    select array_agg(sub.id) into ids
    from (
      select pr.id
        from public.profiles pr
       where pr.id <> me
         and pr.deleted_at is null
         and array_length(pr.gallery_urls, 1) > 0
         and (array_length(my_interests, 1) is null or pr.gender = any(my_interests))
         and not exists (select 1 from public.gallery_interests gi
                           where gi.user_id = me and gi.target_id = pr.id)
         and not exists (select 1 from public.gallery_views gv
                           where gv.viewer_id = me and gv.target_id = pr.id)
         and not exists (
               select 1 from public.user_blocks ub
                where (ub.blocker_id = me and ub.blocked_id = pr.id)
                   or (ub.blocker_id = pr.id and ub.blocked_id = me)
             )
       order by random()
       limit lim
    ) sub;

    exit when ids is not null and array_length(ids, 1) is not null;
    exit when attempt = 2;

    delete from public.gallery_views gv
     where gv.viewer_id = me
       and not exists (select 1 from public.gallery_interests gi
                         where gi.user_id = me and gi.target_id = gv.target_id);
  end loop;

  if ids is null or array_length(ids, 1) is null then
    return;
  end if;

  insert into public.gallery_views (viewer_id, target_id)
  select me, u from unnest(ids) as u
  on conflict do nothing;

  return query
    select pr.id, pr.handle, pr.display_name, pr.gender, pr.country_code, pr.gallery_urls,
           case when pr.dob is null then null else extract(year from age(pr.dob))::int end as age
      from public.profiles pr
     where pr.id = any(ids);
end $$;

grant execute on function public.get_gallery_feed(int) to authenticated;
