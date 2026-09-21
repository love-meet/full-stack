-- Merged from gallery-matching-bots-samuel (was 0092_local_fixes).
-- Adapted at the end of the file - see the note there.
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

-- -------------------------------------------------------------------------
-- ADAPTED DURING THE MERGE (Esther, 21 Sep).
--
-- Item 5 above grants SELECT/INSERT/UPDATE/DELETE on *all* tables in public.
-- That is right for the reason he gives — a local db reset does not carry the
-- hosted platform's default privileges, and PostgREST cannot see a table it
-- has no grant on.
--
-- But it also silently re-opens the four tables 0096 deliberately revoked:
-- wallets, ledger_entries, deposits and user_subscriptions. Those hold the
-- record of real money real users paid. Victor, 20 Sep: keep them, access
-- stays revoked, do not drop them — financial records have to be kept for
-- years. A blanket grant would have made them readable AND writable by every
-- signed-in user.
--
-- So the revokes are re-asserted here, after the grant. Guarded, because the
-- tables do not exist on every database this runs against.
-- -------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['wallets', 'ledger_entries', 'deposits', 'user_subscriptions']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from authenticated, anon', t);
    end if;
  end loop;
end $$;
