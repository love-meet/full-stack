-- =========================================================================
-- 0090 — Phase 1: signup captures the minimum, everything else is optional.
--
-- Signup now requires gender, country/state/city, language, username and a
-- profile picture (§4). `gender` and `looking_for` already exist on profiles
-- and are reused as-is; country_code / country_name / region / city already
-- exist too. Two things were missing:
--
--   * language      — required at signup, had no column
--   * gallery_urls  — optional, added from Profile whenever the user feels
--                     like it; max 5, newest replaces oldest
--
-- Nothing here gates anything. The only NOT NULL added is on gallery_urls,
-- which defaults to an empty array.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Columns.
-- -------------------------------------------------------------------------
alter table public.profiles
  add column if not exists language     text,
  add column if not exists gallery_urls text[] not null default '{}';

comment on column public.profiles.language is
  'The language the user speaks, captured at signup. Free-form code/name from the client list.';
comment on column public.profiles.gallery_urls is
  'Up to 5 gallery photos, oldest first. Maintained by add_gallery_photo(); never written directly by the client.';

-- Belt-and-braces: the cap is enforced by the RPC, but a constraint means a
-- stray direct write can't blow past it either.
alter table public.profiles
  drop constraint if exists profiles_gallery_max_5;
alter table public.profiles
  add constraint profiles_gallery_max_5
  check (coalesce(array_length(gallery_urls, 1), 0) <= 5);

-- -------------------------------------------------------------------------
-- 2. Gallery: newest replaces oldest.
--
-- Append, then keep the last 5. Doing it in an RPC rather than the client
-- means two devices adding a photo at once can't race past the cap, and the
-- "newest replaces oldest" rule has exactly one implementation.
-- -------------------------------------------------------------------------
create or replace function public.add_gallery_photo(url text)
returns text[]
language plpgsql security definer set search_path = public
as $$
declare
  me   uuid := auth.uid();
  next text[];
  n    int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if url is null or btrim(url) = '' then raise exception 'url required'; end if;

  select coalesce(gallery_urls, '{}') || btrim(url)
    into next
    from public.profiles
   where id = me
     for update;

  if next is null then raise exception 'profile not found'; end if;

  n := coalesce(array_length(next, 1), 0);
  if n > 5 then
    next := next[n - 4 : n];          -- drop the oldest, keep the newest 5
  end if;

  update public.profiles set gallery_urls = next where id = me;
  return next;
end $$;

grant execute on function public.add_gallery_photo(text) to authenticated;

create or replace function public.remove_gallery_photo(url text)
returns text[]
language plpgsql security definer set search_path = public
as $$
declare
  me   uuid := auth.uid();
  next text[];
begin
  if me is null then raise exception 'not authenticated'; end if;

  select coalesce(array_remove(gallery_urls, btrim(url)), '{}')
    into next
    from public.profiles
   where id = me
     for update;

  if next is null then raise exception 'profile not found'; end if;

  update public.profiles set gallery_urls = next where id = me;
  return next;
end $$;

grant execute on function public.remove_gallery_photo(text) to authenticated;
