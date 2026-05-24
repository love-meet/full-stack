-- Even more notification events → bell + email via the same pipeline:
--   comment_like / reply_like, gift_accepted / gift_rejected, match_post
--   ("someone who matches your preferences posted").

-- ===== Comment & reply likes → notify the comment/reply author =====
create or replace function public.tg_notify_comment_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.post_comments;
begin
  select * into c from public.post_comments where id = new.comment_id;
  if c.id is null then return new; end if;
  perform public.tg_notify(
    c.author_id, new.user_id,
    case when c.parent_id is null then 'comment_like' else 'reply_like' end,
    c.post_id, c.id, null
  );
  return new;
end $$;
drop trigger if exists notify_on_comment_like on public.post_comment_likes;
create trigger notify_on_comment_like after insert on public.post_comment_likes
  for each row execute function public.tg_notify_comment_like();

-- ===== Gift accepted / rejected → notify the SENDER =====
create or replace function public.tg_notify_gift_response()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform public.tg_notify(new.sender_id, new.recipient_id, 'gift_accepted', new.post_id, null, new.gift_name);
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    perform public.tg_notify(new.sender_id, new.recipient_id, 'gift_rejected', new.post_id, null, new.gift_name);
  end if;
  return new;
end $$;
drop trigger if exists notify_on_gift_response on public.post_gifts;
create trigger notify_on_gift_response after update of status on public.post_gifts
  for each row execute function public.tg_notify_gift_response();

-- ===== New post → notify users whose age preference matches the author =====
-- "Matched my preference" = the author's age falls inside the viewer's
-- preferred age range (age_min..age_max). Capped per post to protect email
-- volume; consider per-type email prefs + a digest before high traffic.
create or replace function public.tg_notify_match_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare author_age int;
begin
  select extract(year from age(now(), dob))::int into author_age
    from public.profiles where id = new.author_id;
  if author_age is null then return new; end if;

  insert into public.notifications (user_id, actor_id, type, post_id, body)
  select u.id, new.author_id, 'match_post', new.id, null
    from public.profiles u
   where u.id <> new.author_id
     and u.onboarded_at is not null
     and u.deleted_at is null
     and u.age_min is not null and u.age_max is not null
     and author_age between u.age_min and u.age_max
   order by u.created_at desc
   limit 100;
  return new;
end $$;
drop trigger if exists notify_on_match_post on public.posts;
create trigger notify_on_match_post after insert on public.posts
  for each row execute function public.tg_notify_match_post();
