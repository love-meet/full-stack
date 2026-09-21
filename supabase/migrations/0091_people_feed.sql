-- =========================================================================
-- 0091 — Phase 2: the feed is people.
--
-- Profile pictures only, men see women and women see men, in a stable
-- per-viewer order with a persisted cursor (§5).
--
-- The ordering problem this solves: today the same person is always first
-- after a refresh. Two pieces fix it —
--
--   * feed_seed     — generated once per viewer and stored. The order is
--                     md5(profile_id || viewer_seed), so every viewer gets a
--                     different order and that order does not reshuffle
--                     between sessions. Without a *stable* order, new signups
--                     and blocks shuffle people back into view and the
--                     "everyone once before repeating" guarantee breaks.
--   * feed_position — a cursor into that order, advanced as cards are
--                     consumed and wrapped to 0 at the end of the set.
--
-- So if a viewer has seen 1-6 of 11, the next session starts at 7, 8, 9, 10,
-- 11 and then wraps to 1, 2, 3, 4, 5.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Per-viewer seed + cursor.
--
-- Added nullable, backfilled, then made NOT NULL, so every existing profile
-- gets its own seed rather than sharing one.
-- -------------------------------------------------------------------------
alter table public.profiles
  add column if not exists feed_seed     text,
  add column if not exists feed_position int not null default 0;

update public.profiles
   set feed_seed = md5(gen_random_uuid()::text)
 where feed_seed is null;

alter table public.profiles
  alter column feed_seed set default md5(gen_random_uuid()::text),
  alter column feed_seed set not null;

comment on column public.profiles.feed_seed is
  'Per-viewer ordering seed. Generated once, never rotated — rotating it reshuffles the feed and breaks the once-before-repeating guarantee.';
comment on column public.profiles.feed_position is
  'Cursor into this viewer''s stable ordering. Advanced as cards are consumed, wrapped to 0 at the end of the set.';

-- -------------------------------------------------------------------------
-- 2. Eligibility — one definition, used by both the page query and the
--    cursor wrap.
--
-- Show profiles where the gender is the one the viewer is looking for,
-- excluding self, blocked users (in either direction), deleted accounts, and
-- anyone with no profile picture.
--
-- NOTE on "the gender the viewer is looking for": profiles.looking_for is
-- relationship intent ('serious' | 'casual' | 'friends'), not a gender
-- preference — there is no gender-preference column. So this implements §1's
-- stated rule off `gender`: men see women, women see men. A viewer whose
-- gender is nonbinary/other/prefer_not_to_say sees both, because the
-- alternative is handing them an empty feed. Add a `seeking` column and this
-- is the one function to change.
-- -------------------------------------------------------------------------
create or replace function public.feed_eligible_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select p.id
    from public.profiles p
   cross join (select id, gender from public.profiles where id = auth.uid()) me
   where p.id <> me.id
     and p.deleted_at is null
     and p.onboarded_at is not null
     and p.avatar_url is not null
     and btrim(p.avatar_url) <> ''
     and p.gender is not null
     and case me.gender
           when 'male'   then p.gender = 'female'
           when 'female' then p.gender = 'male'
           else p.gender in ('male', 'female')
         end
     and not exists (
       select 1 from public.user_blocks b
        where (b.blocker_id = me.id and b.blocked_id = p.id)
           or (b.blocker_id = p.id  and b.blocked_id = me.id)
     );
$$;

grant execute on function public.feed_eligible_ids() to authenticated;

-- -------------------------------------------------------------------------
-- 3. The page query.
--
-- `slot` is the card's distance from the cursor, so the client can order and
-- advance without knowing the seed. (Not `position` — that is a Postgres
-- keyword and reads ambiguously in ORDER BY.) `total` lets the client show
-- progress and recognise a completed cycle. gallery_urls rides along so
-- tapping a picture opens the gallery with no second round-trip.
--
-- Every column reference below is table-qualified on purpose: RETURNS TABLE
-- columns are OUT parameters and are in scope inside the body, so a bare `id`
-- would be ambiguous against the output column of the same name.
-- -------------------------------------------------------------------------
create or replace function public.people_feed(page_size int default 20)
returns table (
  id           uuid,
  handle       text,
  display_name text,
  avatar_url   text,
  gender       text,
  city         text,
  region       text,
  country_name text,
  language     text,
  dob          date,
  gallery_urls text[],
  slot         int,
  total        int
)
language sql stable security definer set search_path = public
as $$
  with me as (
    select mp.feed_seed, mp.feed_position
      from public.profiles mp
     where mp.id = auth.uid()
  ),
  ordered as (
    select p.id, p.handle, p.display_name, p.avatar_url, p.gender,
           p.city, p.region, p.country_name, p.language, p.dob,
           coalesce(p.gallery_urls, '{}') as gallery_urls,
           (row_number() over (order by md5(p.id::text || (select me.feed_seed from me)), p.id) - 1)::int as rn
      from public.profiles p
     where p.id in (select public.feed_eligible_ids())
  ),
  n as (select count(*)::int as c from ordered)
  select o.id, o.handle, o.display_name, o.avatar_url, o.gender,
         o.city, o.region, o.country_name, o.language, o.dob,
         o.gallery_urls,
         (((o.rn - (select me.feed_position from me)) % n.c + n.c) % n.c)::int as slot,
         n.c as total
    from ordered o
   cross join n
   where n.c > 0
     and (((o.rn - (select me.feed_position from me)) % n.c + n.c) % n.c) < greatest(1, page_size)
   -- Ordinal, not `slot`: the OUT parameter of that name is in scope here and
   -- would shadow the select-list alias.
   order by 12;
$$;

grant execute on function public.people_feed(int) to authenticated;

-- -------------------------------------------------------------------------
-- 4. Advancing the cursor.
--
-- Wrapped modulo the eligible count so the position stays inside the set and
-- a full cycle returns to 0. If the set is empty the cursor is reset rather
-- than left pointing at nothing.
-- -------------------------------------------------------------------------
create or replace function public.advance_feed_position(n int default 1)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  me    uuid := auth.uid();
  total int;
  pos   int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if n is null or n <= 0 then
    select feed_position into pos from public.profiles where id = me;
    return coalesce(pos, 0);
  end if;

  select count(*)::int into total from public.feed_eligible_ids();

  if total = 0 then
    update public.profiles set feed_position = 0 where id = me;
    return 0;
  end if;

  update public.profiles
     set feed_position = (coalesce(feed_position, 0) + n) % total
   where id = me
   returning feed_position into pos;

  return coalesce(pos, 0);
end $$;

grant execute on function public.advance_feed_position(int) to authenticated;
