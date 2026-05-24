-- M1+ — extend profiles to match the full onboarding from the old mobile app.
-- Run AFTER 0001_profiles.sql.

alter table public.profiles
  add column if not exists first_name        text,
  add column if not exists last_name         text,
  add column if not exists bio               text,
  add column if not exists looking_for       text,
  add column if not exists age_min           int  default 18,
  add column if not exists age_max           int  default 35,
  add column if not exists show_online_status bool not null default true,
  add column if not exists show_distance      bool not null default true;

-- Constrain looking_for to the three options the UI shows. Drop+re-add so a
-- re-run with a tighter constraint still wins.
alter table public.profiles drop constraint if exists profiles_looking_for_check;
alter table public.profiles add  constraint profiles_looking_for_check
  check (looking_for is null or looking_for in ('serious','casual','friends'));

-- Age bounds + ordering.
alter table public.profiles drop constraint if exists profiles_age_min_check;
alter table public.profiles add  constraint profiles_age_min_check
  check (age_min is null or (age_min between 18 and 100));

alter table public.profiles drop constraint if exists profiles_age_max_check;
alter table public.profiles add  constraint profiles_age_max_check
  check (age_max is null or (age_max between 18 and 100));

alter table public.profiles drop constraint if exists profiles_age_range_order_check;
alter table public.profiles add  constraint profiles_age_range_order_check
  check (age_min is null or age_max is null or age_min <= age_max);

-- =========================================================================
-- username_available()
-- =========================================================================
-- Case-insensitive availability check. Marked SECURITY DEFINER so it works
-- regardless of RLS, and STABLE so PostgREST can cache short bursts.

create or replace function public.username_available(candidate text)
returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.profiles where lower(handle) = lower(candidate)
  );
$$;

grant execute on function public.username_available(text) to authenticated;
