-- 0113_reports_and_photo_backfill.sql
--
-- Two gaps against HS-LM-v1 §07 that the first pass left open.
--
-- 1. REPORTING ONLY WORKS ON POSTS. §07: "A profile, a photograph and a
--    message must each be reportable, and the report must reach a human."
--    public.post_reports is keyed to posts(id) and nothing else can be
--    reported at all — so the single most likely thing a person needs to
--    report, another person, has no path.
--
-- 2. EXISTING PICTURES WERE NEVER QUEUED. 0111 added the review queue as a
--    trigger on avatar change, which is right for every picture from that
--    moment on and does nothing at all for the ones already there. The queue
--    read zero on production with 176 accounts in it, which is the opposite
--    of what §07 asks for.
-- ==========================================================================

-- -------------------------------------------------------------------------
-- 1. Reports against anything.
--
-- A new table rather than loosening post_reports: that one has a NOT NULL
-- post_id and an admin queue already reading it, and making the column
-- nullable would silently let a post report through with no post attached.
-- -------------------------------------------------------------------------
do $$ begin
  create type public.report_target as enum ('profile', 'photo', 'message', 'topic', 'topic_reply');
exception when duplicate_object then null; end $$;

create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  target       public.report_target not null,
  -- The person the report is about. Always set, even for a message or a
  -- photo: a moderator's first question is "who", and resolving it later
  -- from a deleted message is impossible.
  subject_id   uuid not null references public.profiles(id) on delete cascade,
  -- What exactly — a message id, a topic id, or the photo URL. Free-form
  -- because the targets do not share a key type.
  ref          text,
  reason       text not null check (reason in ('spam','inappropriate','harassment','underage','illegal','other')),
  note         text,
  status       text not null default 'open' check (status in ('open','resolved','dismissed')),
  handled_by   uuid references public.profiles(id) on delete set null,
  handled_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists reports_open_idx on public.reports (created_at) where status = 'open';
create index if not exists reports_subject_idx on public.reports (subject_id);

alter table public.reports enable row level security;

-- You can see what you reported; you cannot see reports about you, or
-- anybody else's. Knowing you have been reported is an invitation to go and
-- find out by whom.
drop policy if exists "reports_read_own" on public.reports;
create policy "reports_read_own" on public.reports
  for select to authenticated using (reporter_id = auth.uid());

drop policy if exists "reports_no_direct_insert" on public.reports;
create policy "reports_no_direct_insert" on public.reports
  for insert to authenticated with check (false);

/**
 * report(target, subject, ref, reason, note)
 *
 * One entry point for all of them. Duplicate reports from the same person
 * about the same thing collapse: a second one adds nothing for a moderator
 * and lets somebody bury the queue by tapping repeatedly.
 */
create or replace function public.submit_report(
  p_target  text,
  p_subject uuid,
  p_ref     text default null,
  p_reason  text default 'other',
  p_note    text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  rid uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_subject = me then raise exception 'you cannot report yourself'; end if;

  if not exists (select 1 from public.profiles where id = p_subject) then
    raise exception 'no such person';
  end if;

  -- Collapse a repeat of the same report from the same person.
  select r.id into rid
    from public.reports r
   where r.reporter_id = me
     and r.subject_id = p_subject
     and r.target = p_target::public.report_target
     and r.ref is not distinct from p_ref
     and r.status = 'open';
  if rid is not null then return rid; end if;

  insert into public.reports (reporter_id, target, subject_id, ref, reason, note)
       values (me, p_target::public.report_target, p_subject, p_ref, p_reason,
               nullif(btrim(coalesce(p_note, '')), ''))
    returning id into rid;

  return rid;
end $$;

grant execute on function public.submit_report(text, uuid, text, text, text) to authenticated;

/** The moderator queue — "the report must reach a human" (§07). */
create or replace function public.open_reports(p_limit int default 100)
returns table (
  id            uuid,
  target        text,
  reason        text,
  note          text,
  ref           text,
  created_at    timestamptz,
  subject_id    uuid,
  subject_handle text,
  subject_avatar text,
  reporter_id   uuid,
  reporter_handle text
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_admin() then raise exception 'not allowed'; end if;

  return query
    select r.id, r.target::text, r.reason, r.note, r.ref, r.created_at,
           r.subject_id, s.handle, s.avatar_url,
           r.reporter_id, p.handle
      from public.reports r
      join public.profiles s on s.id = r.subject_id
      join public.profiles p on p.id = r.reporter_id
     where r.status = 'open'
     order by r.created_at
     limit least(greatest(p_limit, 1), 500);
end $$;

grant execute on function public.open_reports(int) to authenticated;

create or replace function public.resolve_report(p_report uuid, p_dismiss boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_admin() then raise exception 'not allowed'; end if;

  update public.reports
     set status = case when p_dismiss then 'dismissed' else 'resolved' end,
         handled_by = auth.uid(),
         handled_at = now()
   where id = p_report and status = 'open';

  if not found then raise exception 'no such open report'; end if;
end $$;

grant execute on function public.resolve_report(uuid, boolean) to authenticated;

-- -------------------------------------------------------------------------
-- 2. Queue every picture that is already on the feed.
--
-- 0111's trigger only fires on change, so an account that has not touched
-- its avatar since signup was never reviewed. This is the one-off catch-up.
-- `on conflict do nothing` makes it safe to re-run, and it queues only what
-- is actually visible — a deleted account's picture is nobody's problem.
-- -------------------------------------------------------------------------
insert into public.photo_reviews (user_id, url)
select p.id, p.avatar_url
  from public.profiles p
 where p.avatar_url is not null
   and btrim(p.avatar_url) <> ''
   and p.deleted_at is null
on conflict (user_id, url) do nothing;
