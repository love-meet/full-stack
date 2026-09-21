-- =========================================================================
-- 0098 — open the DMs, pair on interested_in, and remove the bots.
--
-- Victor, 20 Sep, after the rehearsal surfaced a gallery/matching system
-- living on production that is in no migration in this repo.
--
--   * the Message button wins: no mutual match needed to start a chat
--   * but capped at 20 NEW conversations a day, so one day's credits can't
--     buy a cold-message run through the whole feed
--   * the feed pairs on profiles.interested_in, defaulted to the opposite
--     gender, instead of hardcoding men<->women
--   * bot personas leave the feed, search and the inbox entirely
--
-- get_gallery_feed / gallery_interests / gallery_views / matches are NOT
-- touched. They stay as the engine for the serious-relationship matching
-- path; they just stop gating the browse feed and ordinary messaging.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Who opened a conversation.
--
-- Needed for the daily cap. Existing rows are left null — they predate the
-- cap and counting them against anyone would be wrong.
-- -------------------------------------------------------------------------
alter table public.conversations
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create index if not exists conversations_created_by_day_idx
  on public.conversations (created_by, created_at desc);

comment on column public.conversations.created_by is
  'Who started this conversation. Drives the 20-new-chats-per-day cap in start_dm(). Null on rows created before 0098.';

-- -------------------------------------------------------------------------
-- 2. interested_in — who you want to see.
--
-- The column already exists on production, added outside this repo's
-- migrations, and get_gallery_feed already uses it. It is created here too,
-- because otherwise a clean build from these migrations cannot reproduce the
-- live schema — which is exactly the drift that made this restructure hard to
-- rehearse. Same for is_bot. `if not exists` makes both a no-op on production.
--
-- Defaulting interested_in to the opposite gender means a user who never
-- touches it gets exactly men<->women, and a user who changes it gets what
-- they asked for. Nobody is invisible, which is what a strict men-see-women
-- rule did to anyone non-binary.
-- -------------------------------------------------------------------------
alter table public.profiles
  add column if not exists interested_in text[]  not null default '{}'::text[],
  add column if not exists is_bot        boolean not null default false,
  add column if not exists bot_kind      text;

do $$ begin
  alter table public.profiles
    add constraint profiles_bot_kind_check
    check (bot_kind = any (array['persona', 'liker']));
exception when duplicate_object then null; end $$;

-- A bot is anything carrying EITHER marker.
--
-- Samuel's personas set bot_kind; is_bot is a separate, older flag. Checking
-- only is_bot let a persona with bot_kind='persona' and is_bot=false walk
-- into the feed, into search and into the inbox — 19 of them reply in DMs and
-- 5 have AI-generated galleries, which is the catfishing case Apple rejects
-- dating apps for. One helper so the rule cannot drift between call sites.
create or replace function public.is_bot_profile(p_is_bot boolean, p_bot_kind text)
returns boolean language sql immutable
as $fn$ select coalesce(p_is_bot, false) or p_bot_kind is not null $fn$;

do $$ begin
  alter table public.profiles
    add constraint profiles_interested_in_check
    check (interested_in <@ array['female', 'male', 'nonbinary', 'other']);
exception when duplicate_object then null; end $$;

create or replace function public.default_interested_in(p_gender text)
returns text[]
language sql immutable
as $$
  select case p_gender
           when 'female' then array['male']
           when 'male'   then array['female']
           -- No "opposite" for anyone else, so show them both rather than
           -- nothing. They can narrow it in Profile.
           else array['male', 'female']
         end;
$$;

-- Backfill anyone whose preference was never set.
update public.profiles
   set interested_in = public.default_interested_in(gender)
 where coalesce(array_length(interested_in, 1), 0) = 0
   and gender is not null;

-- And keep it true for new signups, whichever path creates them.
create or replace function public.tg_default_interested_in()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.gender is not null
     and coalesce(array_length(new.interested_in, 1), 0) = 0 then
    new.interested_in := public.default_interested_in(new.gender);
  end if;
  return new;
end $$;

drop trigger if exists default_interested_in_on_profile on public.profiles;
create trigger default_interested_in_on_profile
  before insert or update of gender on public.profiles
  for each row execute function public.tg_default_interested_in();

-- -------------------------------------------------------------------------
-- 3. Feed eligibility: interested_in, and no bots.
--
-- Replaces the hardcoded men<->women rule from 0091. The pairing is mutual —
-- I see you only if you match what I want AND I match what you want — so
-- nobody appears in a feed they would not want to be in.
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
     -- Bots never appear. We charge credits to send a message; letting
     -- someone pay to message an account they believe is a person, which
     -- isn't, is the one thing this app must not do.
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
     and not exists (
       select 1 from public.user_blocks b
        where (b.blocker_id = me.id and b.blocked_id = p.id)
           or (b.blocker_id = p.id  and b.blocked_id = me.id)
     );
$$;

grant execute on function public.feed_eligible_ids() to authenticated;

-- -------------------------------------------------------------------------
-- 4. start_dm — no match gate, no bots, 20 new chats a day.
--
-- The cap is on NEW conversations only. Replying to anyone, and continuing
-- any existing chat, stays unlimited: the credit charge already covers a
-- whole day of that. What the cap stops is one day's 100 credits buying a
-- cold-message run through the entire feed, which is how you lose the women
-- the app exists for.
--
-- Counted on the Africa/Lagos day, same boundary as the credit charge (0097),
-- so "today" means the same thing in both places.
-- -------------------------------------------------------------------------
create or replace function public.start_dm(other_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  my_id         uuid := auth.uid();
  conv_id       uuid;
  target_is_bot boolean;
  started_today int;
begin
  if my_id is null then raise exception 'not authenticated'; end if;
  if other_user_id = my_id then raise exception 'cannot dm yourself'; end if;

  select public.is_bot_profile(p.is_bot, p.bot_kind) into target_is_bot
    from public.profiles p
   where p.id = other_user_id and p.deleted_at is null;

  if target_is_bot is null then raise exception 'recipient not found'; end if;
  if target_is_bot then raise exception 'recipient not found'; end if;

  -- Existing conversation? Always reopenable, and never counted against the
  -- cap — you are continuing something, not starting it.
  select c.id into conv_id
    from public.conversations c
   where exists (select 1 from public.conversation_members
                  where conversation_id = c.id and user_id = my_id)
     and exists (select 1 from public.conversation_members
                  where conversation_id = c.id and user_id = other_user_id)
     and (select count(*) from public.conversation_members
           where conversation_id = c.id) = 2
   limit 1;

  if conv_id is not null then return conv_id; end if;

  select count(*) into started_today
    from public.conversations c
   where c.created_by = my_id
     and (c.created_at at time zone 'Africa/Lagos')::date
         = (now() at time zone 'Africa/Lagos')::date;

  if started_today >= 20 then
    raise exception 'daily_new_chat_limit';
  end if;

  insert into public.conversations (created_by) values (my_id) returning id into conv_id;
  insert into public.conversation_members (conversation_id, user_id)
       values (conv_id, my_id), (conv_id, other_user_id);

  return conv_id;
end $$;

grant execute on function public.start_dm(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- 5. Bots out of search too.
--
-- Leaving them searchable would just move the problem one screen across.
-- -------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.searchable_profiles') is not null then
    -- Same columns and the same self/blocked exclusions as the live view —
    -- create or replace view requires an identical column list anyway, and
    -- dropping those conditions would quietly un-block blocked users. The
    -- only change is the is_bot filter.
    execute $v$
      create or replace view public.searchable_profiles as
      select p.id, p.handle, p.display_name, p.avatar_url, p.bio, p.gender,
             p.country_code, p.country_name, p.city, p.looking_for, p.interests,
             p.dob,
             case when p.dob is null then null
                  else extract(year from age(p.dob::timestamptz))::int end as age,
             p.is_verified, p.created_at
        from public.profiles p
       where p.onboarded_at is not null
         and p.deleted_at is null
         and p.id <> auth.uid()
         and not public.is_bot_profile(p.is_bot, p.bot_kind)
         and not exists (
           select 1 from public.user_blocks ub
            where (ub.blocker_id = auth.uid() and ub.blocked_id = p.id)
               or (ub.blocker_id = p.id and ub.blocked_id = auth.uid())
         )
    $v$;
    execute 'alter view public.searchable_profiles set (security_invoker = on)';
    execute 'grant select on public.searchable_profiles to authenticated';
  end if;
end $$;
