-- Explore → full communities system.
--
-- Phase-1 schema for the whole groups feature (UI rolls out across phases):
--   * groups gain owner/welcome/instructions/avatar/is_default + relaxed kind
--   * group_members (owner/admin/member, active/pending/removed)
--   * group_posts gain status (pending/approved/rejected) + media columns
--   * group_post_comments gain parent_id (replies)
--   * is_group_admin() + approval / membership RPCs
--   * rebuilt group_posts_with_counts (status-aware, media) + groups_with_meta

-- =========================================================================
-- 1. Expand groups
-- =========================================================================
alter table public.groups
  add column if not exists owner_id        uuid references public.profiles(id) on delete set null,
  add column if not exists welcome_message text,
  add column if not exists instructions    text,
  add column if not exists avatar_url      text,
  add column if not exists cover_url       text,
  add column if not exists is_default      bool not null default false,
  add column if not exists visibility      text not null default 'public'
    check (visibility in ('public', 'private'));

-- Relax the fixed-category constraint so user groups can exist.
alter table public.groups drop constraint if exists groups_kind_check;
alter table public.groups alter column kind set default 'custom';

-- Mark the three seeded rooms as defaults + freshen the Naughty name.
update public.groups set is_default = true where slug in ('pickup', 'naughty', 'advice');
update public.groups set name = 'Naughty girls' where slug = 'naughty';

-- =========================================================================
-- 2. group_members
-- =========================================================================
do $$ begin
  create type public.group_member_role as enum ('owner', 'admin', 'member');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.group_member_status as enum ('active', 'pending', 'removed');
exception when duplicate_object then null;
end $$;

create table if not exists public.group_members (
  group_id   uuid not null references public.groups(id)   on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       public.group_member_role   not null default 'member',
  status     public.group_member_status not null default 'active',
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members (user_id);
create index if not exists group_members_group_active_idx
  on public.group_members (group_id) where status = 'active';

-- =========================================================================
-- 3. group_posts: status + media
-- =========================================================================
do $$ begin
  create type public.group_post_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.group_media_kind as enum ('image', 'video');
exception when duplicate_object then null;
end $$;

alter table public.group_posts
  add column if not exists status       public.group_post_status not null default 'pending',
  add column if not exists media_url    text,
  add column if not exists media_kind   public.group_media_kind,
  add column if not exists media_aspect numeric(6,4),
  add column if not exists approved_by  uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at  timestamptz,
  add column if not exists reject_reason text;

-- Body may now be null when media is present. Replace the original check.
alter table public.group_posts drop constraint if exists group_posts_body_check;
alter table public.group_posts alter column body drop not null;
alter table public.group_posts
  add constraint group_posts_body_check check (
    (media_url is not null and (body is null or length(body) <= 1000))
    or (body is not null and length(trim(body)) > 0 and length(body) <= 1000)
  );

-- Anything that already exists predates moderation — grandfather it in.
update public.group_posts set status = 'approved' where status = 'pending' and approved_at is null;

create index if not exists group_posts_status_idx
  on public.group_posts (group_id, status, created_at desc);

-- =========================================================================
-- 4. group_post_comments: replies
-- =========================================================================
alter table public.group_post_comments
  add column if not exists parent_id uuid references public.group_post_comments(id) on delete cascade;

create index if not exists group_comments_parent_idx
  on public.group_post_comments (parent_id) where parent_id is not null;

-- =========================================================================
-- 5. is_group_admin(group_id) — platform admin OR group owner/admin member
-- =========================================================================
create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.group_members
       where group_id = gid
         and user_id = auth.uid()
         and role in ('owner', 'admin')
         and status = 'active'
    )
$$;

grant execute on function public.is_group_admin(uuid) to authenticated;

-- =========================================================================
-- 6. Rebuild group_posts_with_counts (status-aware + media)
-- =========================================================================
drop view if exists public.group_posts_with_counts;
create view public.group_posts_with_counts as
select
  p.id,
  p.group_id,
  g.slug         as group_slug,
  p.author_id,
  p.body,
  p.status,
  p.media_url,
  p.media_kind,
  p.media_aspect,
  p.created_at,
  coalesce(l.like_count, 0)    as like_count,
  coalesce(c.comment_count, 0) as comment_count,
  exists (
    select 1 from public.group_post_likes
    where post_id = p.id and user_id = auth.uid()
  ) as liked_by_me,
  pr.handle        as author_handle,
  pr.display_name  as author_display_name,
  pr.avatar_url    as author_avatar_url
from public.group_posts p
join public.groups g on g.id = p.group_id
left join lateral (
  select count(*) as like_count from public.group_post_likes where post_id = p.id
) l on true
left join lateral (
  select count(*) as comment_count
    from public.group_post_comments where post_id = p.id
) c on true
left join public.profiles pr on pr.id = p.author_id
-- Everyone sees approved posts; authors see their own pending/rejected;
-- group admins see everything in their group (for the moderation queue).
where p.status = 'approved'
   or p.author_id = auth.uid()
   or public.is_group_admin(p.group_id);

grant select on public.group_posts_with_counts to authenticated;

-- =========================================================================
-- 7. groups_with_meta — group + counts + my membership
-- =========================================================================
create or replace view public.groups_with_meta as
select
  g.id, g.slug, g.name, g.description, g.kind, g.requires_age_gate,
  g.sort_order, g.owner_id, g.welcome_message, g.instructions,
  g.avatar_url, g.cover_url, g.is_default, g.visibility, g.created_at,
  coalesce(mc.c, 0)::int as member_count,
  coalesce(pc.c, 0)::int as post_count,
  (select role from public.group_members
     where group_id = g.id and user_id = auth.uid() and status = 'active') as my_role,
  exists (select 1 from public.group_members
     where group_id = g.id and user_id = auth.uid() and status = 'active') as is_member
from public.groups g
left join lateral (
  select count(*) c from public.group_members where group_id = g.id and status = 'active'
) mc on true
left join lateral (
  select count(*) c from public.group_posts where group_id = g.id and status = 'approved'
) pc on true;

grant select on public.groups_with_meta to authenticated;

-- =========================================================================
-- 8. RPCs
-- =========================================================================

-- create_group — owner becomes an active 'owner' member automatically.
create or replace function public.create_group(
  p_name text,
  p_description text default null,
  p_welcome text default null,
  p_instructions text default null,
  p_avatar_url text default null
)
returns public.groups
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  new_slug text;
  row public.groups;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_name is null or length(trim(p_name)) < 3 then
    raise exception 'group name must be at least 3 characters';
  end if;

  -- slug = kebab of name + short random suffix to guarantee uniqueness.
  new_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'))
              || '-' || substring(gen_random_uuid()::text for 6);

  insert into public.groups (slug, name, description, kind, welcome_message,
                             instructions, avatar_url, owner_id, is_default)
       values (new_slug, trim(p_name), p_description, 'custom', p_welcome,
               p_instructions, p_avatar_url, me, false)
    returning * into row;

  insert into public.group_members (group_id, user_id, role, status)
       values (row.id, me, 'owner', 'active');

  return row;
end $$;

grant execute on function public.create_group(text, text, text, text, text) to authenticated;

create or replace function public.join_group(gid uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  insert into public.group_members (group_id, user_id, role, status)
       values (gid, me, 'member', 'active')
  on conflict (group_id, user_id) do update set status = 'active';
end $$;

grant execute on function public.join_group(uuid) to authenticated;

create or replace function public.leave_group(gid uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  -- Owners can't leave their own group (they'd orphan it); they delete it instead.
  if exists (select 1 from public.group_members
              where group_id = gid and user_id = me and role = 'owner') then
    raise exception 'owners cannot leave their own group';
  end if;
  delete from public.group_members where group_id = gid and user_id = me;
end $$;

grant execute on function public.leave_group(uuid) to authenticated;

create or replace function public.remove_group_member(gid uuid, target uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_group_admin(gid) then raise exception 'group admin only'; end if;
  -- Can't remove the owner.
  if exists (select 1 from public.group_members
              where group_id = gid and user_id = target and role = 'owner') then
    raise exception 'cannot remove the owner';
  end if;
  update public.group_members set status = 'removed'
   where group_id = gid and user_id = target;
end $$;

grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

create or replace function public.set_group_member_role(gid uuid, target uuid, next_role public.group_member_role)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- Only the owner may change roles, and the owner role itself is fixed.
  if not exists (select 1 from public.group_members
                  where group_id = gid and user_id = auth.uid()
                    and role = 'owner' and status = 'active') then
    raise exception 'group owner only';
  end if;
  if next_role = 'owner' then raise exception 'cannot assign owner'; end if;
  update public.group_members set role = next_role
   where group_id = gid and user_id = target and role <> 'owner';
end $$;

grant execute on function public.set_group_member_role(uuid, uuid, public.group_member_role) to authenticated;

create or replace function public.approve_group_post(post_id uuid)
returns public.group_posts
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  gid uuid;
  row public.group_posts;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select group_id into gid from public.group_posts where id = post_id;
  if gid is null then raise exception 'post not found'; end if;
  if not public.is_group_admin(gid) then raise exception 'group admin only'; end if;

  update public.group_posts
     set status = 'approved', approved_by = me, approved_at = now()
   where id = post_id and status = 'pending'
  returning * into row;
  if row.id is null then raise exception 'post not pending'; end if;
  return row;
end $$;

grant execute on function public.approve_group_post(uuid) to authenticated;

create or replace function public.reject_group_post(post_id uuid, reason text default null)
returns public.group_posts
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  gid uuid;
  row public.group_posts;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select group_id into gid from public.group_posts where id = post_id;
  if gid is null then raise exception 'post not found'; end if;
  if not public.is_group_admin(gid) then raise exception 'group admin only'; end if;

  update public.group_posts
     set status = 'rejected', approved_by = me, approved_at = now(), reject_reason = reason
   where id = post_id and status in ('pending', 'approved')
  returning * into row;
  if row.id is null then raise exception 'post not found'; end if;
  return row;
end $$;

grant execute on function public.reject_group_post(uuid, text) to authenticated;

-- =========================================================================
-- 9. RLS for new table + tightened group writes
-- =========================================================================
alter table public.group_members enable row level security;

drop policy if exists "gmembers_select_auth" on public.group_members;
create policy "gmembers_select_auth" on public.group_members
  for select to authenticated using (true);

-- All membership writes flow through the SECURITY DEFINER RPCs above.
drop policy if exists "gmembers_no_client_write" on public.group_members;
create policy "gmembers_no_client_write" on public.group_members
  for insert to authenticated with check (false);

-- group_posts insert stays "own author", but now also requires that the
-- inserted row is pending (clients can't self-approve).
drop policy if exists "gposts_insert_own" on public.group_posts;
create policy "gposts_insert_own" on public.group_posts
  for insert to authenticated
  with check (auth.uid() = author_id and status = 'pending');

-- Direct UPDATE on group_posts is denied; approval flows via RPC.
-- (No update policy = denied by default.)

alter publication supabase_realtime add table public.group_members;
