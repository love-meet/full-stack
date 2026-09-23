-- 0112_tips_and_topics.sql
--
-- Relationship tips and topics — HS-LM-v1 §01 and §05.
--
-- "Advice worth reading, and open topics anyone can contribute to. It is the
-- reason to open the app on a day when nobody new has appeared, and the thing
-- that makes this more than a dating app."
--
-- Two kinds of thing, deliberately in one table:
--
--   a TIP    written by us, read-only, the advice half
--   a TOPIC  opened by anyone, the conversation half
--
-- They share a table because the reading surface is the same list and the
-- only real difference is who may create one. Two tables would mean two
-- queries, two notification paths and a merge in the client for no gain.
--
-- §05 also asks for the thing that makes this social rather than a blog:
-- "when a friend contributes to relationship tips or any open topic, you hear
-- about it". That is the fan-out at the bottom.
--
-- STILL UNDECIDED (§05 says so explicitly, and this migration does not
-- pretend otherwise): who writes the tips, whether contributions are
-- moderated before or after they appear, and whether tips are per-language or
-- translated. The schema takes a `language` and a `published` flag so either
-- answer can be implemented without another migration — post-moderation is
-- the default because pre-moderation with nobody on duty means an empty
-- section, and an empty section is the same as not shipping it.
-- ==========================================================================

do $$ begin
  create type public.topic_kind as enum ('tip', 'topic');
exception when duplicate_object then null; end $$;

create table if not exists public.topics (
  id          uuid primary key default gen_random_uuid(),
  kind        public.topic_kind not null default 'topic',
  author_id   uuid references public.profiles(id) on delete set null,
  title       text not null check (length(btrim(title)) between 3 and 140),
  body        text not null check (length(btrim(body)) between 1 and 4000),
  language    text,
  published   boolean not null default true,
  reply_count int not null default 0,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists topics_live_idx
  on public.topics (created_at desc) where deleted_at is null and published;
create index if not exists topics_kind_idx
  on public.topics (kind, created_at desc) where deleted_at is null and published;
create index if not exists topics_author_idx on public.topics (author_id);

create table if not exists public.topic_replies (
  id         uuid primary key default gen_random_uuid(),
  topic_id   uuid not null references public.topics(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists topic_replies_topic_idx
  on public.topic_replies (topic_id, created_at) where deleted_at is null;

alter table public.topics enable row level security;
alter table public.topic_replies enable row level security;

-- Anyone signed in reads; blocks apply, so someone you blocked does not get
-- to lecture you from the topics list either.
drop policy if exists "topics_read" on public.topics;
create policy "topics_read" on public.topics
  for select to authenticated using (
    deleted_at is null and published
    and (author_id is null or not exists (
      select 1 from public.user_blocks ub
       where (ub.blocker_id = auth.uid() and ub.blocked_id = author_id)
          or (ub.blocker_id = author_id and ub.blocked_id = auth.uid())
    ))
  );

drop policy if exists "topic_replies_read" on public.topic_replies;
create policy "topic_replies_read" on public.topic_replies
  for select to authenticated using (
    deleted_at is null
    and not exists (
      select 1 from public.user_blocks ub
       where (ub.blocker_id = auth.uid() and ub.blocked_id = author_id)
          or (ub.blocker_id = author_id and ub.blocked_id = auth.uid())
    )
  );

-- Writes go through RPCs: they own the notification fan-out and the reply
-- counter, and a direct insert would silently skip both.
drop policy if exists "topics_no_direct_insert" on public.topics;
create policy "topics_no_direct_insert" on public.topics
  for insert to authenticated with check (false);

drop policy if exists "topic_replies_no_direct_insert" on public.topic_replies;
create policy "topic_replies_no_direct_insert" on public.topic_replies
  for insert to authenticated with check (false);

-- -------------------------------------------------------------------------
-- Notify my friends that I contributed (§05).
--
-- A friend is Interested in either direction (0108), so this walks the same
-- edges get_my_friends does. Capped: somebody with a thousand friends writing
-- ten topics should not generate ten thousand notification rows in one
-- transaction, and the people past the cap are exactly the ones least likely
-- to care.
-- -------------------------------------------------------------------------
create or replace function public.notify_friends_of_topic(
  p_actor uuid,
  p_topic uuid,
  p_title text
) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  insert into public.notifications (user_id, actor_id, type, body)
  select f.other_id, p_actor, 'friend_topic', left(btrim(p_title), 140)
    from (
      select gi.target_id as other_id
        from public.gallery_interests gi
       where gi.user_id = p_actor and gi.decision = 'interested'
      union
      select gi.user_id
        from public.gallery_interests gi
       where gi.target_id = p_actor and gi.decision = 'interested'
    ) f
    join public.profiles pr on pr.id = f.other_id
   where pr.deleted_at is null
     and coalesce(pr.is_bot, false) = false
     and f.other_id <> p_actor
     and not exists (
       select 1 from public.user_blocks ub
        where (ub.blocker_id = f.other_id and ub.blocked_id = p_actor)
           or (ub.blocker_id = p_actor and ub.blocked_id = f.other_id)
     )
   limit 500;

  get diagnostics n = row_count;
  return n;
end $$;

-- -------------------------------------------------------------------------
-- create_topic(title, body)
-- -------------------------------------------------------------------------
create or replace function public.create_topic(p_title text, p_body text)
returns public.topics
language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  row public.topics;
  lang text;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select language into lang from public.profiles where id = me;

  insert into public.topics (kind, author_id, title, body, language)
       values ('topic', me, btrim(p_title), btrim(p_body), lang)
    returning * into row;

  perform public.notify_friends_of_topic(me, row.id, row.title);
  return row;
end $$;

grant execute on function public.create_topic(text, text) to authenticated;

-- -------------------------------------------------------------------------
-- reply_to_topic(topic, body)
-- -------------------------------------------------------------------------
create or replace function public.reply_to_topic(p_topic uuid, p_body text)
returns public.topic_replies
language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  row    public.topic_replies;
  owner  uuid;
  ttitle text;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select t.author_id, t.title into owner, ttitle
    from public.topics t
   where t.id = p_topic and t.deleted_at is null and t.published;
  if ttitle is null then raise exception 'no such topic'; end if;

  insert into public.topic_replies (topic_id, author_id, body)
       values (p_topic, me, btrim(p_body))
    returning * into row;

  update public.topics set reply_count = reply_count + 1 where id = p_topic;

  -- The person who opened it hears about every reply; their friends do not,
  -- or a busy topic would notify half the app.
  if owner is not null and owner <> me then
    insert into public.notifications (user_id, actor_id, type, body)
         values (owner, me, 'topic_reply', left(btrim(p_body), 140));
  end if;

  return row;
end $$;

grant execute on function public.reply_to_topic(uuid, text) to authenticated;

-- -------------------------------------------------------------------------
-- delete_topic / delete_topic_reply — author or admin, soft.
-- -------------------------------------------------------------------------
create or replace function public.delete_topic(p_topic uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  update public.topics
     set deleted_at = now()
   where id = p_topic and deleted_at is null
     and (author_id = me or public.is_admin());
  if not found then raise exception 'not yours to delete'; end if;
end $$;

grant execute on function public.delete_topic(uuid) to authenticated;

create or replace function public.delete_topic_reply(p_reply uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  update public.topic_replies
     set deleted_at = now()
   where id = p_reply and deleted_at is null
     and (author_id = me or public.is_admin());
  if not found then raise exception 'not yours to delete'; end if;
end $$;

grant execute on function public.delete_topic_reply(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- list_topics(kind, limit, offset) — the reading surface.
--
-- Column names are suffixed where they would collide with the OUT parameters
-- this RETURNS TABLE declares. That collision creates cleanly and fails at
-- call time with 42702, which is how it bit twice already in this project.
-- -------------------------------------------------------------------------
create or replace function public.list_topics(
  p_kind   text default null,
  p_limit  int  default 20,
  p_offset int  default 0
) returns table (
  id            uuid,
  kind          text,
  author_id     uuid,
  handle        text,
  display_name  text,
  avatar_url    text,
  title         text,
  body          text,
  reply_count   int,
  created_at    timestamptz,
  is_mine       boolean
)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  return query
    select t.id, t.kind::text, t.author_id, a.handle, a.display_name, a.avatar_url,
           t.title, t.body, t.reply_count, t.created_at,
           (t.author_id = me)
      from public.topics t
      left join public.profiles a on a.id = t.author_id
     where t.deleted_at is null
       and t.published
       and (p_kind is null or t.kind::text = p_kind)
       and (t.author_id is null or not exists (
             select 1 from public.user_blocks ub
              where (ub.blocker_id = me and ub.blocked_id = t.author_id)
                 or (ub.blocker_id = t.author_id and ub.blocked_id = me)
           ))
     order by t.created_at desc
     limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end $$;

grant execute on function public.list_topics(text, int, int) to authenticated;

create or replace function public.list_topic_replies(p_topic uuid)
returns table (
  id           uuid,
  author_id    uuid,
  handle       text,
  display_name text,
  avatar_url   text,
  body         text,
  created_at   timestamptz,
  is_mine      boolean
)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  return query
    select r.id, r.author_id, a.handle, a.display_name, a.avatar_url,
           r.body, r.created_at, (r.author_id = me)
      from public.topic_replies r
      join public.profiles a on a.id = r.author_id
     where r.topic_id = p_topic
       and r.deleted_at is null
       and not exists (
             select 1 from public.user_blocks ub
              where (ub.blocker_id = me and ub.blocked_id = r.author_id)
                 or (ub.blocker_id = r.author_id and ub.blocked_id = me)
           )
     order by r.created_at;
end $$;

grant execute on function public.list_topic_replies(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- Seed the tips.
--
-- §05 leaves "who writes the tips" open. These are a starting set so the
-- section is not empty on day one — an empty tips tab is worse than no tips
-- tab, because it reads as a feature somebody abandoned. author_id is null:
-- they are from Love meet, not from a person.
-- -------------------------------------------------------------------------
insert into public.topics (kind, author_id, title, body, language)
select 'tip', null, v.title, v.body, 'en'
  from (values
    ('Ask about the thing they mentioned in passing',
     'People tell you what matters to them sideways, in the middle of another sentence. Going back to it — "you said you had been up since four, what is that about?" — is the difference between an interview and a conversation. It also costs you nothing and takes ten seconds to think of.'),
    ('Do not lead with a compliment about their body',
     'It is the first message they have had forty of this week and it tells them nothing about you. Say something about the picture instead — where it was taken, what they are doing in it, the dog in the background. You are trying to start a conversation, not file a review.'),
    ('A game is easier than a first line',
     'If you do not know what to say, start a game instead. It gives you both something to react to, and a reason to come back tomorrow without either of you having to perform. Most conversations that go anywhere started sideways like this.'),
    ('Meet sooner than you think, and somewhere public',
     'Long chat without meeting builds a version of someone that is mostly your own invention, and the real person then has to compete with it. A short coffee in week one tells you more than a month of messages. Public, your own transport, and somebody knows where you are.'),
    ('If they are inconsistent, believe the inconsistency',
     'Stories that change, a camera that never works, a job that shifts — these are not quirks to be patient about. You are not being unfair by noticing. Ask directly, and if the answer moves again, stop.'),
    ('Nobody real asks you for money',
     'Not for a flight, not for a customs fee, not for a sure investment, not for a friend in hospital. It does not matter how many weeks they spent being lovely first — that is the method, not a reason to trust them. Report and stop replying.'),
    ('Say what you are looking for, early',
     'People are bad at guessing and worse at asking. Saying "I am looking for something serious" or "I am not, honestly" in the first week saves everybody months. The ones who want the same thing are relieved; the ones who do not were never going to work.'),
    ('Reply like a person, not a service desk',
     'One-word answers are not mysterious, they are just work for the other person. If you are not interested, say so kindly and move on — that is a better thing to do to somebody than slowly going quiet.')
  ) as v(title, body)
 where not exists (select 1 from public.topics where kind = 'tip');
