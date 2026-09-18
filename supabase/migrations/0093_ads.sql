-- =========================================================================
-- 0093 — Phase 4: ads.
--
-- §7: always on, for every user, regardless of credit balance. They are not a
-- reward and they unlock nothing. Victor switches them off when he chooses.
--
-- That last sentence is why this is a table and not an environment variable:
-- a kill switch that needs a redeploy is not a switch. One row, readable by
-- everyone, writable by admins.
-- =========================================================================

create table if not exists public.app_settings (
  id          int primary key default 1,
  ads_enabled boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null,
  check (id = 1)
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

comment on table public.app_settings is
  'Single-row runtime switches. Read by every client; written only through the admin RPCs below.';

alter table public.app_settings enable row level security;

-- Every signed-in client reads it — the answer is the same for everyone, and
-- it is not a secret.
drop policy if exists "app_settings_read" on public.app_settings;
create policy "app_settings_read" on public.app_settings
  for select to authenticated using (true);

-- No direct writes, from anyone. The RPC is the only door.
drop policy if exists "app_settings_no_client_write" on public.app_settings;
create policy "app_settings_no_client_write" on public.app_settings
  for insert to authenticated with check (false);

drop policy if exists "app_settings_no_client_update" on public.app_settings;
create policy "app_settings_no_client_update" on public.app_settings
  for update to authenticated using (false);

create or replace function public.set_ads_enabled(p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  me       uuid := auth.uid();
  is_admin boolean;
  result   boolean;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select coalesce(p.role in ('admin', 'super_admin'), false)
    into is_admin
    from public.profiles p
   where p.id = me;

  if not is_admin then raise exception 'admin only'; end if;

  update public.app_settings
     set ads_enabled = coalesce(p_enabled, true),
         updated_at  = now(),
         updated_by  = me
   where id = 1
   returning ads_enabled into result;

  return result;
end $$;

grant execute on function public.set_ads_enabled(boolean) to authenticated;

-- Realtime so flipping the switch empties the ad slots everywhere without
-- anyone having to reload.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_settings'
  ) then
    alter publication supabase_realtime add table public.app_settings;
  end if;
end $$;
