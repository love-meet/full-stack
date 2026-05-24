-- M8 — admin tab.
--
-- The admin role already exists on profiles (`role` enum 'user' /
-- 'admin' / 'super_admin' from 0001). This migration adds:
--   - `admin_actions` audit log so every moderation/payout action has a paper trail.
--   - `user_bans` table so banning is distinct from blocking + auditable.
--   - RLS so admin reads of post_reports / deposits / withdrawals / etc.
--     work end-to-end via the `is_admin()` helper.
--   - RPCs for the moderation queue + user management actions.

-- =========================================================================
-- Helper: is_admin() — used by RLS + RPCs to gate admin-only paths.
-- =========================================================================
create or replace function public.is_admin()
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce(
    (select role in ('admin','super_admin') from public.profiles where id = auth.uid()),
    false
  )
$$;

grant execute on function public.is_admin() to authenticated;

-- =========================================================================
-- admin_actions — audit log
-- =========================================================================
create table if not exists public.admin_actions (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references public.profiles(id) on delete set null,
  action      text not null,        -- e.g. 'ban_user', 'resolve_report', 'approve_withdrawal'
  target_type text,                  -- 'user' | 'post' | 'comment' | 'report' | 'withdrawal' | 'deposit'
  target_id   uuid,
  note        text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists admin_actions_admin_idx  on public.admin_actions (admin_id, created_at desc);
create index if not exists admin_actions_target_idx on public.admin_actions (target_type, target_id);

alter table public.admin_actions enable row level security;
drop policy if exists "admin_actions_read" on public.admin_actions;
create policy "admin_actions_read" on public.admin_actions
  for select to authenticated using (public.is_admin());

-- All writes go through the RPCs below (SECURITY DEFINER).
drop policy if exists "admin_actions_no_client_write" on public.admin_actions;
create policy "admin_actions_no_client_write" on public.admin_actions
  for insert to authenticated with check (false);

-- =========================================================================
-- user_bans — temporary or permanent bans separate from user_blocks.
-- Sets up RLS so a banned user can still be admin-viewed but their
-- posts/comments are hidden from peer queries (we'll need to swap feed
-- views to exclude when ready; for now the table is the source of truth).
-- =========================================================================
create table if not exists public.user_bans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  banned_by    uuid references public.profiles(id) on delete set null,
  reason       text,
  expires_at   timestamptz,        -- null = permanent
  lifted_at    timestamptz,        -- non-null = un-banned
  created_at   timestamptz not null default now()
);

create index if not exists user_bans_user_active_idx
  on public.user_bans (user_id) where lifted_at is null;

alter table public.user_bans enable row level security;
drop policy if exists "user_bans_admin_read" on public.user_bans;
create policy "user_bans_admin_read" on public.user_bans
  for select to authenticated using (public.is_admin() or user_id = auth.uid());

drop policy if exists "user_bans_no_client_write" on public.user_bans;
create policy "user_bans_no_client_write" on public.user_bans
  for insert to authenticated with check (false);

-- =========================================================================
-- Cross-table admin policies — let admins read the user_facing tables.
-- post_reports already exists from 0009 but had no admin SELECT, only
-- the reporter could read their own row. Same for posts/comments via RLS.
-- =========================================================================
drop policy if exists "post_reports_admin_read" on public.post_reports;
create policy "post_reports_admin_read" on public.post_reports
  for select to authenticated using (public.is_admin() or reporter_id = auth.uid());

-- =========================================================================
-- RPCs — every admin write goes through here so it lands in the audit log.
-- =========================================================================
create or replace function public.resolve_report(
  report_id uuid,
  next_status text,    -- 'resolved' or 'dismissed'
  note text default null
)
returns public.post_reports
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.post_reports;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if next_status not in ('resolved','dismissed') then
    raise exception 'invalid status';
  end if;

  update public.post_reports
     set status = next_status
   where id = report_id and status = 'open'
  returning * into row;
  if row.id is null then raise exception 'report not open'; end if;

  insert into public.admin_actions (admin_id, action, target_type, target_id, note)
       values (me, concat('report_', next_status), 'report', report_id, note);

  return row;
end $$;

grant execute on function public.resolve_report(uuid, text, text) to authenticated;

create or replace function public.ban_user(
  target uuid,
  reason text default null,
  expires_at timestamptz default null
)
returns public.user_bans
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.user_bans;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if target = me then raise exception 'cannot ban yourself'; end if;

  insert into public.user_bans (user_id, banned_by, reason, expires_at)
       values (target, me, reason, expires_at)
    returning * into row;

  insert into public.admin_actions (admin_id, action, target_type, target_id, note, payload)
       values (me, 'ban_user', 'user', target, reason,
               jsonb_build_object('expires_at', expires_at));

  return row;
end $$;

grant execute on function public.ban_user(uuid, text, timestamptz) to authenticated;

create or replace function public.lift_ban(target uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  update public.user_bans
     set lifted_at = now()
   where user_id = target and lifted_at is null;

  insert into public.admin_actions (admin_id, action, target_type, target_id)
       values (me, 'lift_ban', 'user', target);
end $$;

grant execute on function public.lift_ban(uuid) to authenticated;

create or replace function public.set_role(
  target uuid,
  next_role text          -- 'user' | 'admin' | 'super_admin'
)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  is_super bool;
  row public.profiles;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if next_role not in ('user','admin','super_admin') then
    raise exception 'invalid role';
  end if;
  select role = 'super_admin' into is_super from public.profiles where id = me;
  if not is_super then raise exception 'super_admin only'; end if;

  -- profiles_update_own has a `with check (... and role = (select role …))`
  -- clause that forbids users (including admins) from changing role
  -- themselves. SECURITY DEFINER bypasses RLS for the super-admin path.
  update public.profiles set role = next_role where id = target returning * into row;
  if row.id is null then raise exception 'user not found'; end if;

  insert into public.admin_actions (admin_id, action, target_type, target_id, note)
       values (me, 'set_role', 'user', target, next_role);

  return row;
end $$;

grant execute on function public.set_role(uuid, text) to authenticated;

-- =========================================================================
-- View: admin_dashboard — at-a-glance counts. Empty rows aren't an error,
-- they're zeros.
-- =========================================================================
create or replace view public.admin_dashboard as
select
  (select count(*) from public.post_reports where status = 'open')                 as open_reports,
  (select count(*) from public.withdrawal_requests where status in ('pending','approved')) as pending_payouts,
  (select count(*) from public.deposits where status = 'pending')                  as pending_deposits,
  (select count(*) from public.user_bans where lifted_at is null
     and (expires_at is null or expires_at > now()))                               as active_bans,
  (select count(*) from public.profiles where role in ('admin','super_admin'))     as admin_count,
  (select count(*) from public.profiles where onboarded_at is not null and deleted_at is null) as user_count;

grant select on public.admin_dashboard to authenticated;
