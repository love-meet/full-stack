-- 0092 — Production patches discovered during local smoke test.

-- 1. Drop the launch promo trigger that references the now-deleted ledger_entries table.
drop trigger if exists launch_bonus_on_signup on public.profiles cascade;
drop function if exists public.tg_launch_bonus() cascade;

-- 2. Fix the RLS update policy — the old role subquery caused updates to return 0 rows.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- 3. Ensure explicit table-level privileges are granted.
grant select, update on public.profiles to authenticated;
grant select on public.profiles to anon;

-- 4. Re-grant SELECT on posts_with_counts (lost when view was recreated in 00871).
grant select on public.posts_with_counts to authenticated;

-- 5. Blanket-grant all public schema tables to authenticated.
--    Local Supabase db reset does not carry over the default-privilege grants
--    that the hosted platform applies automatically. Rather than listing every
--    table individually, grant on all current tables in one shot.
--    RLS policies are the real access-control layer; these grants just let
--    PostgREST see the tables at all.
grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

grant usage on schema public to authenticated, anon;
