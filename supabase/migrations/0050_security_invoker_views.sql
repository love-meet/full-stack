-- Clear the Supabase "Security Definer View" advisories (12 of them).
--
-- By default a Postgres view runs with its OWNER's privileges, which bypasses
-- the RLS of the querying user. All our views are already safe (each is either
-- scoped to auth.uid() or exposes already-public data, and the admin views
-- carry is_admin() checks) — but the linter rightly prefers views to run as
-- the INVOKER so RLS is the single source of truth.
--
-- security_invoker = on makes each view enforce the caller's RLS. Verified safe
-- because every underlying table grants the needed reads:
--   * public content (posts/comments/groups/profiles) → readable by authenticated
--   * self-scoped tables (ledger, notifications, conversations) → own rows
--   * admin views' tables (reports, bans, payouts, tickets) → is_admin() policies

do $$
declare v text;
begin
  foreach v in array array[
    'posts_with_counts',
    'my_conversations',
    'group_posts_with_counts',
    'post_comments_with_meta',
    'searchable_profiles',
    'admin_dashboard',
    'groups_with_meta',
    'my_earnings_summary',
    'support_tickets_view',
    'my_affiliate_summary',
    'notifications_with_actor',
    'my_transactions'
  ]
  loop
    if exists (select 1 from pg_views where schemaname = 'public' and viewname = v) then
      execute format('alter view public.%I set (security_invoker = on)', v);
    end if;
  end loop;
end $$;
