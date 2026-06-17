-- M1 — profiles, RLS, helpers.
--
-- Run this from the Supabase SQL editor (or `supabase db push` if you've
-- linked the CLI). Idempotent enough to re-run during dev — safer if you
-- drop the schema before re-running for a clean slate.

-- =========================================================================
-- profiles
-- =========================================================================
-- One row per signed-in user. `id` matches `auth.users.id` (the Supabase
-- auth row), so RLS uses `auth.uid()` to compare ownership cheaply.

create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,

  -- Identity claim sources (filled depending on which surface signed in).
  telegram_user_id   bigint unique,
  google_sub         text unique,

  -- User-chosen + onboarding fields.
  handle             text unique,
  display_name       text,
  avatar_url         text,
  gender             text check (gender in ('female','male','nonbinary','other','prefer_not_to_say')),
  dob                date,
  interests          text[] not null default '{}',

  -- Location (captured from the Geolocation API + reverse geocode).
  country_code       text,             -- ISO 3166-1 alpha-2, e.g. 'NG'
  region             text,             -- state/province
  city               text,
  lat                double precision,
  lon                double precision,

  -- Role gate for the admin tab (see M8). Default: user.
  role               text not null default 'user' check (role in ('user','admin','super_admin')),

  -- Lifecycle.
  onboarded_at       timestamptz,      -- non-null once the onboarding form is submitted
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists profiles_handle_lower_idx on public.profiles (lower(handle));
create index if not exists profiles_country_idx       on public.profiles (country_code);
create index if not exists profiles_interests_gin     on public.profiles using gin (interests);

-- Defensive: if a prior run created an `age` column (or someone tries it),
-- drop it. Postgres rejects generated columns whose expression depends on
-- CURRENT_DATE (`age(dob)` is STABLE, not IMMUTABLE — error 42P17).
-- We compute age client-side from `dob` instead, and filter by `dob` ranges
-- on the server (`dob between today-26y and today-21y` for "21-25"),
-- which is also index-friendly.
alter table public.profiles drop column if exists age;

-- =========================================================================
-- updated_at trigger
-- =========================================================================
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- =========================================================================
-- Auto-create a profile row when an auth user is created.
-- =========================================================================
-- We always have an auth.users row before a profiles row. This trigger keeps
-- them in lockstep so the client never has to "create profile if missing."

create or replace function public.tg_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, telegram_user_id, google_sub)
  values (
    new.id,
    nullif((new.raw_user_meta_data ->> 'telegram_user_id'), '')::bigint,
    nullif((new.raw_user_meta_data ->> 'google_sub'),       '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_user();

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.profiles enable row level security;

-- Anyone signed in can read the public-safe columns of any profile.
-- (Restrict columns at the client by selecting only what's needed; for the
-- truly private fields, expose a SECURITY DEFINER view instead.)
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

-- A user can only update their own row.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- Inserts happen exclusively via the trigger; deny direct client inserts.
drop policy if exists "profiles_insert_none" on public.profiles;
create policy "profiles_insert_none"
  on public.profiles
  for insert
  to authenticated
  with check (false);

-- =========================================================================
-- Helper: is_admin()  — used by future admin-only tables/policies.
-- =========================================================================
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('admin','super_admin')
       from public.profiles
       where id = auth.uid()),
    false
  );
$$;

-- Explicitly grant table permissions (Supabase local Postgres sometimes drops
-- public schema default privileges during heavy migrations).
grant select, update on public.profiles to authenticated;
grant select on public.profiles to anon;

grant execute on function public.is_admin() to authenticated;
