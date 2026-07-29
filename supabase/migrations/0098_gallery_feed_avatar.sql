-- Add `avatar_url` to the gallery feed so cards can show the person's
-- profile picture alongside their gallery photos, and add the RPC backing
-- the new "Interested" tab (people whose gallery you liked).
--
-- get_gallery_feed's RETURNS TABLE signature changes here, and Postgres
-- won't let CREATE OR REPLACE alter a function's output columns
-- (error 42P13) — so it has to be dropped and recreated. Body is otherwise
-- identical to 0097's, including the two-pass undecided-view recycle and
-- the p_limit cap.

drop function if exists public.get_gallery_feed(int);

create function public.get_gallery_feed(p_limit int default 10)
returns table (
  id            uuid,
  handle        text,
  display_name  text,
  avatar_url    text,
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
  lim           int := least(greatest(1, p_limit), 50);
  attempt       int;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select coalesce(p.interested_in, '{}') into my_interests from public.profiles p where p.id = me;

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
    select pr.id, pr.handle, pr.display_name, pr.avatar_url, pr.gender,
           pr.country_code, pr.gallery_urls,
           case when pr.dob is null then null else extract(year from age(pr.dob))::int end as age
      from public.profiles pr
     where pr.id = any(ids);
end $$;

grant execute on function public.get_gallery_feed(int) to authenticated;

-- =========================================================================
-- get_my_interests() — backs the "Interested" tab next to Messages.
-- =========================================================================
-- Everyone whose gallery the caller marked Interested in, newest first,
-- with whether it became a mutual match and the conversation id if so.
-- Messaging stays gated on a mutual match (start_dm enforces it), so the
-- client uses `is_match` to decide between "Message" and a waiting state
-- rather than offering a DM that would fail.
--
-- Passed targets are deliberately excluded — this is the "people I liked"
-- list, not a decision history.
create or replace function public.get_my_interests()
returns table (
  id              uuid,
  handle          text,
  display_name    text,
  avatar_url      text,
  country_code    text,
  gallery_urls    text[],
  age             int,
  interested_at   timestamptz,
  is_match        boolean,
  conversation_id uuid
)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  return query
    select pr.id, pr.handle, pr.display_name, pr.avatar_url, pr.country_code,
           pr.gallery_urls,
           case when pr.dob is null then null else extract(year from age(pr.dob))::int end,
           gi.created_at,
           m.user_a is not null,
           m.conversation_id
      from public.gallery_interests gi
      join public.profiles pr on pr.id = gi.target_id
      left join public.matches m
             on m.user_a = least(me, gi.target_id)
            and m.user_b = greatest(me, gi.target_id)
     where gi.user_id = me
       and gi.decision = 'interested'
       and pr.deleted_at is null
       -- Blocks in either direction hide the row, matching the feed's rules.
       and not exists (
             select 1 from public.user_blocks ub
              where (ub.blocker_id = me and ub.blocked_id = pr.id)
                 or (ub.blocker_id = pr.id and ub.blocked_id = me)
           )
     order by gi.created_at desc;
end $$;

grant execute on function public.get_my_interests() to authenticated;
