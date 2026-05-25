-- Two helpers that power "show the verified tick / follow state everywhere"
-- and a ranking algorithm for the feed.

-- =========================================================================
-- profile_relations(ids) — for a set of users, return whether each is a
-- paying subscriber (blue tick) and whether the current user follows them.
-- One round-trip per list (feed authors, chat partners, comment authors…).
-- =========================================================================
create or replace function public.profile_relations(ids uuid[])
returns table (id uuid, is_subscriber boolean, is_following boolean)
language sql stable security definer set search_path = public
as $$
  select
    p.id,
    public.has_active_subscription(p.id),
    exists (select 1 from public.follows f
             where f.follower_id = auth.uid() and f.following_id = p.id)
  from public.profiles p
  where p.id = any(ids);
$$;

grant execute on function public.profile_relations(uuid[]) to authenticated;

-- =========================================================================
-- ranked_feed(limit, offset) — the feed, scored so people see more of:
--   • accounts they follow            (+1000)
--   • verified (subscriber) accounts  (+250)
--   • accounts matching their age preferences (+120)
-- with recency as the tie-breaker (newer ranks higher within a tier).
-- SECURITY INVOKER (default) so RLS on posts still applies; auth.uid() is
-- the caller. Offset pagination keeps it simple.
-- =========================================================================
create or replace function public.ranked_feed(p_limit int default 10, p_offset int default 0)
returns setof public.posts_with_counts
language sql stable set search_path = public
as $$
  select pwc.*
    from public.posts_with_counts pwc
    join public.profiles a  on a.id = pwc.author_id
    left join public.profiles me on me.id = auth.uid()
   order by (
       (case when exists (select 1 from public.follows f
                           where f.follower_id = auth.uid() and f.following_id = pwc.author_id)
             then 1000 else 0 end)
     + (case when public.has_active_subscription(pwc.author_id) then 250 else 0 end)
     + (case when me.age_min is not null and me.age_max is not null and a.dob is not null
                  and extract(year from age(now(), a.dob))::int between me.age_min and me.age_max
             then 120 else 0 end)
     - (extract(epoch from (now() - pwc.created_at)) / 86400.0)
   ) desc, pwc.created_at desc
   limit greatest(1, p_limit) offset greatest(0, p_offset);
$$;

grant execute on function public.ranked_feed(int, int) to authenticated;
