-- 0111_consent_export_moderation.sql
--
-- HS-LM-v1 §07 — three of the things that block a store submission.
--
--   Consent capture at signup, recorded with a timestamp
--   Data export on request (NDPA here, GDPR for any European user)
--   Photo moderation before a picture reaches the feed
--
-- Photo moderation is the one with teeth. "A single explicit image in a
-- dating app is a removal." There is no automated classifier wired up yet, so
-- this builds the queue and the states; what it does NOT do is block the feed
-- on a human being awake, because a signup that cannot be seen by anyone
-- until someone reviews it is a dead signup. New pictures are visible and
-- flagged for review; a reviewer can reject one, and a rejected picture
-- leaves the feed immediately.
-- ==========================================================================

-- -------------------------------------------------------------------------
-- 1. Consent, with a timestamp and a version.
--
-- The version matters: consent to the terms of 23 Sep 2026 is not consent to
-- whatever they say next year, and a regulator asking "what did they agree
-- to" needs an answer that is not "the current file".
-- -------------------------------------------------------------------------
create table if not exists public.user_consents (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('terms', 'privacy', 'guidelines', 'age_18')),
  version      text not null,
  accepted_at  timestamptz not null default now(),
  primary key (user_id, kind, version)
);

create index if not exists user_consents_user_idx on public.user_consents (user_id);

alter table public.user_consents enable row level security;

drop policy if exists "consents_read_own" on public.user_consents;
create policy "consents_read_own" on public.user_consents
  for select to authenticated using (user_id = auth.uid());

-- Writes go through the RPC so the timestamp is the server's, not a clock
-- the client controls.
drop policy if exists "consents_no_client_write" on public.user_consents;
create policy "consents_no_client_write" on public.user_consents
  for insert to authenticated with check (false);

create or replace function public.record_consent(p_kinds text[], p_version text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  n  int := 0;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if coalesce(array_length(p_kinds, 1), 0) = 0 then return 0; end if;

  insert into public.user_consents (user_id, kind, version)
  select me, k, coalesce(nullif(btrim(p_version), ''), 'unversioned')
    from unnest(p_kinds) as k
   where k in ('terms', 'privacy', 'guidelines', 'age_18')
  on conflict do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.record_consent(text[], text) to authenticated;

-- -------------------------------------------------------------------------
-- 2. Data export.
--
-- Everything we hold that is about this person and is theirs to see. It
-- deliberately does NOT include other people's messages to them beyond the
-- text they were sent, and it does not include another user's identity where
-- that would leak it — a block list export naming who blocked you would be a
-- privacy hole dressed as a privacy feature.
-- -------------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  out jsonb;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select jsonb_build_object(
    'exported_at', now(),
    'profile', (
      select to_jsonb(p) - 'feed_seed' - 'feed_position'
        from public.profiles p where p.id = me
    ),
    'consents', coalesce((
      select jsonb_agg(to_jsonb(c)) from public.user_consents c where c.user_id = me
    ), '[]'::jsonb),
    'coin_ledger', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.created_at)
        from public.coin_ledger l where l.user_id = me
    ), '[]'::jsonb),
    'messages_sent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'conversation_id', m.conversation_id,
               'body', m.body,
               'created_at', m.created_at))
        from public.messages m where m.sender_id = me
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(to_jsonb(po)) from public.posts po where po.author_id = me
    ), '[]'::jsonb),
    'decisions_i_made', coalesce((
      select jsonb_agg(jsonb_build_object(
               'target_id', gi.target_id, 'decision', gi.decision, 'at', gi.created_at))
        from public.gallery_interests gi where gi.user_id = me
    ), '[]'::jsonb),
    'gifts_sent', coalesce((
      select jsonb_agg(to_jsonb(g)) from public.profile_gifts g where g.sender_id = me
    ), '[]'::jsonb),
    'gifts_received', coalesce((
      select jsonb_agg(to_jsonb(g)) from public.profile_gifts g where g.recipient_id = me
    ), '[]'::jsonb),
    -- Who I blocked is mine. Who blocked me is theirs, and is left out.
    'i_blocked', coalesce((
      select jsonb_agg(b.blocked_id) from public.user_blocks b where b.blocker_id = me
    ), '[]'::jsonb)
  ) into out;

  return out;
end $$;

grant execute on function public.export_my_data() to authenticated;

-- -------------------------------------------------------------------------
-- 3. Photo moderation.
-- -------------------------------------------------------------------------
do $$ begin
  create type public.photo_review_state as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.photo_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  url         text not null,
  state       public.photo_review_state not null default 'pending',
  reason      text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, url)
);

create index if not exists photo_reviews_pending_idx
  on public.photo_reviews (created_at) where state = 'pending';

alter table public.photo_reviews enable row level security;

-- A person can see the verdict on their own pictures. Only admins see the
-- queue, via the RPC below.
drop policy if exists "photo_reviews_read_own" on public.photo_reviews;
create policy "photo_reviews_read_own" on public.photo_reviews
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "photo_reviews_no_client_write" on public.photo_reviews;
create policy "photo_reviews_no_client_write" on public.photo_reviews
  for insert to authenticated with check (false);

-- Every avatar change queues itself for review. A trigger rather than a
-- client call: a picture that reaches the database without being queued is
-- exactly the one that gets us removed.
create or replace function public.tg_queue_avatar_review()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.avatar_url is not null and btrim(new.avatar_url) <> ''
     and (tg_op = 'INSERT' or new.avatar_url is distinct from old.avatar_url) then
    insert into public.photo_reviews (user_id, url)
         values (new.id, new.avatar_url)
    on conflict (user_id, url) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists queue_avatar_review on public.profiles;
create trigger queue_avatar_review
  after insert or update of avatar_url on public.profiles
  for each row execute function public.tg_queue_avatar_review();

-- A rejected picture leaves the feed at once.
create or replace function public.review_photo(
  p_review_id uuid,
  p_approve   boolean,
  p_reason    text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  rev public.photo_reviews;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.is_admin() then raise exception 'not allowed'; end if;

  update public.photo_reviews
     set state = case when p_approve then 'approved' else 'rejected' end::public.photo_review_state,
         reason = p_reason,
         reviewed_by = me,
         reviewed_at = now()
   where id = p_review_id
  returning * into rev;

  if rev.id is null then raise exception 'no such review'; end if;

  if not p_approve then
    -- Clearing the avatar is what removes them from the feed:
    -- feed_eligible_ids() already requires a non-empty avatar_url.
    update public.profiles
       set avatar_url = null
     where id = rev.user_id and avatar_url = rev.url;

    insert into public.notifications (user_id, actor_id, type, body)
         values (rev.user_id, null, 'photo_rejected',
                 coalesce(p_reason, 'Your profile picture was removed. Please upload another.'));
  end if;
end $$;

grant execute on function public.review_photo(uuid, boolean, text) to authenticated;

-- The queue, for the admin console.
create or replace function public.pending_photo_reviews(p_limit int default 50)
returns table (
  id           uuid,
  user_id      uuid,
  handle       text,
  display_name text,
  url          text,
  created_at   timestamptz
)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.is_admin() then raise exception 'not allowed'; end if;

  return query
    select r.id, r.user_id, p.handle, p.display_name, r.url, r.created_at
      from public.photo_reviews r
      join public.profiles p on p.id = r.user_id
     where r.state = 'pending'
     order by r.created_at
     limit least(greatest(p_limit, 1), 200);
end $$;

grant execute on function public.pending_photo_reviews(int) to authenticated;
