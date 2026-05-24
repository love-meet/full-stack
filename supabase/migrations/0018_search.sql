-- M6 — Search tab.
--
-- A view `searchable_profiles` exposes the columns the search needs plus a
-- computed `age`, while filtering out: my own row, soft-deleted accounts,
-- accounts that haven't completed onboarding, and the two-way blocked
-- pairs. Trigram indexes on the textual columns make ILIKE fast.

create extension if not exists pg_trgm;

-- =========================================================================
-- Trigram GIN indexes so `ILIKE '%word%'` doesn't scan the whole table.
-- =========================================================================
create index if not exists profiles_handle_trgm_idx
  on public.profiles using gin (handle gin_trgm_ops);
create index if not exists profiles_display_name_trgm_idx
  on public.profiles using gin (display_name gin_trgm_ops);
create index if not exists profiles_bio_trgm_idx
  on public.profiles using gin (bio gin_trgm_ops);
create index if not exists profiles_country_trgm_idx
  on public.profiles using gin (country_name gin_trgm_ops);

-- =========================================================================
-- searchable_profiles — what the front-end queries. View inherits the
-- existing `profiles_select_authenticated` policy from the underlying
-- table, but we also strip out self / deleted / unfinished / blocked rows
-- here so the client never sees them in the first place.
-- =========================================================================
drop view if exists public.searchable_profiles;
create view public.searchable_profiles as
select
  p.id,
  p.handle,
  p.display_name,
  p.avatar_url,
  p.bio,
  p.gender,
  p.country_code,
  p.country_name,
  p.city,
  p.looking_for,
  p.interests,
  p.dob,
  -- AGE() is STABLE, not IMMUTABLE — fine for a view, can't be used in
  -- a generated column (which is why 0001 had to drop the attempt).
  case when p.dob is null then null
       else extract(year from age(p.dob))::int
  end as age,
  p.is_verified,
  p.created_at
from public.profiles p
where p.onboarded_at is not null
  and p.deleted_at is null
  and p.id <> auth.uid()
  and not exists (
    select 1 from public.user_blocks ub
     where (ub.blocker_id = auth.uid() and ub.blocked_id = p.id)
        or (ub.blocker_id = p.id      and ub.blocked_id = auth.uid())
  );

-- Views don't take their own RLS; they delegate to the table's. Grant
-- select on the view to authenticated so PostgREST will expose it.
grant select on public.searchable_profiles to authenticated;
