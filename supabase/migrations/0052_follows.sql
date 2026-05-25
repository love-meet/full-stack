-- Follow system: users follow users. Drives follower/following counts on the
-- profile and a "follow" notification to the followed user.

create table if not exists public.follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists follows_following_idx on public.follows (following_id);
create index if not exists follows_follower_idx  on public.follows (follower_id);

alter table public.follows enable row level security;

-- Counts are public to authenticated users.
drop policy if exists "follows_select" on public.follows;
create policy "follows_select" on public.follows
  for select to authenticated using (true);

-- You can only create/remove your OWN follow edges.
drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own" on public.follows
  for insert to authenticated with check (follower_id = auth.uid());

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own" on public.follows
  for delete to authenticated using (follower_id = auth.uid());

-- =========================================================================
-- get_profile_social(target) — follower/following counts, whether I follow
-- them, and whether they're a paying subscriber (drives the blue verified
-- tick). One round-trip for the profile header.
-- =========================================================================
create or replace function public.get_profile_social(target uuid)
returns table (followers int, following int, is_following boolean, is_subscriber boolean)
language sql security definer stable set search_path = public
as $$
  select
    (select count(*) from public.follows where following_id = target)::int,
    (select count(*) from public.follows where follower_id  = target)::int,
    exists (select 1 from public.follows where follower_id = auth.uid() and following_id = target),
    public.has_active_subscription(target);
$$;

grant execute on function public.get_profile_social(uuid) to authenticated;

-- =========================================================================
-- Notify the followed user when someone follows them.
-- =========================================================================
create or replace function public.tg_notify_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.tg_notify(new.following_id, new.follower_id, 'follow', null, null, null);
  return new;
end $$;
drop trigger if exists notify_on_follow on public.follows;
create trigger notify_on_follow after insert on public.follows
  for each row execute function public.tg_notify_follow();

alter publication supabase_realtime add table public.follows;
