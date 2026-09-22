-- 0105_friends_feed.sql
--
-- The second tab used to be Search. It becomes Friends: the people you have
-- actually connected with, rather than a box to type strangers' names into.
--
-- "Friend" here means a mutual match — both people marked Interested — which
-- is exactly a row in public.matches. There was no read path for that table
-- beyond get_my_interests(), which returns everyone you liked and only flags
-- which of them matched back. A tab that shows friends needs the other shape:
-- matches only, with enough of the profile to draw a feed card.
--
-- Search itself is not deleted — /search still exists and is still routable.
-- Only the tab slot changes.
-- ==========================================================================

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
           m.matched_at, m.conversation_id
      from public.matches m
      -- The pair is stored canonically (user_a < user_b), so the friend is
      -- whichever side isn't me.
      join public.profiles pr
        on pr.id = case when m.user_a = me then m.user_b else m.user_a end
     where me in (m.user_a, m.user_b)
       and pr.deleted_at is null
       -- A block in either direction ends the friendship as far as the UI is
       -- concerned, same rule the feed uses.
       and not exists (
             select 1 from public.user_blocks ub
              where (ub.blocker_id = me and ub.blocked_id = pr.id)
                 or (ub.blocker_id = pr.id and ub.blocked_id = me)
           )
     order by m.matched_at desc;
end $$;

grant execute on function public.get_my_friends() to authenticated;
