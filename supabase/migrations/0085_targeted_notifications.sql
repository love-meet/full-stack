-- 0085_targeted_notifications.sql
--
-- Task A — New-member nearby notification.
--   When a user completes onboarding (onboarded_at: NULL → non-null), notify
--   up to 50 existing members in the SAME REGION who are compatible by intent
--   (looking_for) and have the new user's age within their preferred range.
--   Recipients are capped at 2 new_member_nearby notifications per UTC day to
--   prevent spam. The notifications table itself is the throttle store — no
--   additional table is introduced.
--
-- Task B — Tighten tg_notify_match_post.
--   Apply the same region + intent + daily-flood-protection filters to the
--   existing "new post" fan-out and reduce the cap 100 → 50. Previously this
--   triggered for every user platform-wide whose age happened to match. Now it
--   is scoped to the same region as the post author, with compatible intent.
--
-- Rollback: see bottom of file.

-- ============================================================================
-- 1. Indexes
--    These must exist BEFORE the functions that use them. All are partial so
--    they stay small and add zero overhead for rows that don't match.
-- ============================================================================

-- Recipient filter for both fan-outs: onboarded, not deleted, by country + region.
-- country_code leads so the (country_code, region) compound predicate hits this index.
create index if not exists profiles_notification_recipient_idx
  on public.profiles (country_code, region, looking_for)
  where onboarded_at is not null and deleted_at is null and region is not null;

-- Throttle sub-query: count today's new_member_nearby rows for a given user.
-- A partial index on the two notification types keeps it tiny and fast.
create index if not exists notifications_new_member_throttle_idx
  on public.notifications (user_id, created_at desc)
  where type = 'new_member_nearby';

create index if not exists notifications_match_post_throttle_idx
  on public.notifications (user_id, created_at desc)
  where type = 'match_post';

-- ============================================================================
-- 2. Task A — extend tg_notify_welcome to fan out new_member_nearby.
--    The trigger already fires after UPDATE OF onboarded_at. We replace the
--    function body (trigger DDL stays identical — recreated defensively below).
--    By this point the new user's country_code, region, dob, and looking_for
--    are all populated by the onboarding form, making filtering meaningful.
-- ============================================================================
create or replace function public.tg_notify_welcome()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name   text;
  new_user_age int;
begin
  -- Guard: only act when onboarded_at transitions NULL → non-null.
  if new.onboarded_at is null or old.onboarded_at is not null then
    return new;
  end if;

  -- ── Self-welcome (unchanged from 0040) ───────────────────────────────────
  insert into public.notifications (user_id, type, body)
  values (new.id, 'welcome',
    'Your profile is live and looking lovely 💕 The right person could be one hello away — so don''t be shy. Make the first move; fortune favours the bold (and the charming).');

  -- ── Fan-out to nearby members ────────────────────────────────────────────
  -- Requires region — without it we cannot scope the delivery.
  if new.region is null then
    return new;
  end if;

  -- Friendly name for the notification body.
  actor_name := coalesce(
    nullif(trim(new.first_name), ''),
    nullif(trim(new.display_name), ''),
    nullif(trim(new.handle), ''),
    'Someone new'
  );

  -- Age from dob (same expression used by tg_notify_match_post and ranked_feed).
  if new.dob is not null then
    new_user_age := extract(year from age(now(), new.dob))::int;
  end if;

  insert into public.notifications (user_id, actor_id, type, body)
  select
    u.id,
    new.id,
    'new_member_nearby',
    actor_name || ' just joined Love meet near you 💕'
  from public.profiles u
  where u.id <> new.id
    and u.onboarded_at is not null
    and u.deleted_at is null
    -- Geography: same country AND same region.
    -- country_code guards against region-name collisions across countries;
    -- region alone narrows to sub-national scope (not every user in a country).
    -- If the new user's country_code is NULL we skip the country guard (graceful).
    and (new.country_code is null or u.country_code = new.country_code)
    and u.region = new.region
    -- Intent: match if either side is NULL or values are identical.
    -- (serious↔serious, casual↔casual, friends↔friends, NULL↔any)
    and (
      new.looking_for is null
      or u.looking_for is null
      or u.looking_for = new.looking_for
    )
    -- Age targeting: new user's age must fall inside recipient's preferred range.
    -- If either side is missing, the filter is skipped (conservative default).
    and (
      new_user_age is null
      or u.age_min is null
      or u.age_max is null
      or new_user_age between u.age_min and u.age_max
    )
    -- Flood protection: at most 2 new_member_nearby notifications per recipient
    -- per UTC calendar day.
    and (
      select count(*) from public.notifications n2
       where n2.user_id = u.id
         and n2.type    = 'new_member_nearby'
         and n2.created_at >= current_date
    ) < 2
  order by random()
  limit 50;

  return new;
end $$;

-- Re-attach trigger (name unchanged from 0036/0040).
drop trigger if exists notify_on_welcome on public.profiles;
create trigger notify_on_welcome
  after update of onboarded_at on public.profiles
  for each row execute function public.tg_notify_welcome();

-- ============================================================================
-- 3. Task B — tighten tg_notify_match_post with region + intent + flood cap.
--    Previously: age-only filter, no geography, no throttle, LIMIT 100.
--    Now:        region + intent + age + flood protection (2/day), LIMIT 50.
-- ============================================================================
create or replace function public.tg_notify_match_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  author_age    int;
  author_region text;
  author_intent text;
begin
  -- Fetch the author's age, region, and intent in one query.
  select
    extract(year from age(now(), p.dob))::int,
    p.region,
    p.looking_for
  into author_age, author_region, author_intent
  from public.profiles p
  where p.id = new.author_id;

  -- Region is required to scope delivery. Without it we cannot safely fan out.
  if author_region is null then
    return new;
  end if;

  insert into public.notifications (user_id, actor_id, type, post_id, body)
  select u.id, new.author_id, 'match_post', new.id, null
    from public.profiles u
   where u.id <> new.author_id
     and u.onboarded_at is not null
     and u.deleted_at is null
     -- Geography: same region as the author.
     and u.region = author_region
     -- Intent compatibility.
     and (
       author_intent is null
       or u.looking_for is null
       or u.looking_for = author_intent
     )
     -- Age targeting: author's age must fall inside the recipient's preferred range.
     and (
       author_age is null
       or u.age_min is null
       or u.age_max is null
       or author_age between u.age_min and u.age_max
     )
     -- Flood protection: at most 2 match_post notifications per recipient per day.
     and (
       select count(*) from public.notifications n2
        where n2.user_id = u.id
          and n2.type    = 'match_post'
          and n2.created_at >= current_date
     ) < 2
   order by random()
   limit 50;

  return new;
end $$;

-- Trigger DDL unchanged — just re-declare to be safe.
drop trigger if exists notify_on_match_post on public.posts;
create trigger notify_on_match_post after insert on public.posts
  for each row execute function public.tg_notify_match_post();

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (run manually if a revert is needed)
-- ============================================================================
--
-- 1. Drop the new indexes:
--      drop index if exists public.profiles_notification_recipient_idx;
--      drop index if exists public.notifications_new_member_throttle_idx;
--      drop index if exists public.notifications_match_post_throttle_idx;
--
-- 2. Revert tg_notify_welcome to the 0040 body:
--      create or replace function public.tg_notify_welcome()
--      returns trigger language plpgsql security definer set search_path = public as $$
--      begin
--        if new.onboarded_at is not null and old.onboarded_at is null then
--          insert into public.notifications (user_id, type, body)
--          values (new.id, 'welcome',
--            'Your profile is live and looking lovely ...');
--        end if;
--        return new;
--      end $$;
--
-- 3. Revert tg_notify_match_post to the 0039 body:
--      create or replace function public.tg_notify_match_post()
--      returns trigger language plpgsql security definer set search_path = public as $$
--      declare author_age int;
--      begin
--        select extract(year from age(now(), dob))::int into author_age
--          from public.profiles where id = new.author_id;
--        if author_age is null then return new; end if;
--        insert into public.notifications (user_id, actor_id, type, post_id, body)
--        select u.id, new.author_id, 'match_post', new.id, null
--          from public.profiles u
--         where u.id <> new.author_id
--           and u.onboarded_at is not null
--           and u.deleted_at is null
--           and u.age_min is not null and u.age_max is not null
--           and author_age between u.age_min and u.age_max
--         order by u.created_at desc
--         limit 100;
--        return new;
--      end $$;
--
-- 4. Purge new_member_nearby rows if desired (optional):
--      delete from public.notifications where type = 'new_member_nearby';
--
-- ============================================================================
