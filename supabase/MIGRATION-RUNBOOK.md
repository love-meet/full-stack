# Migration runbook — 0088 → 0097

**Status: both rehearsals have now been run and pass.**

Rehearsal 1 (clean build, all 97 from scratch) and Rehearsal 2 (over a restored
copy of the live database, 170 profiles) both complete, and the verification
queries below all return zero rows.

Between them they found **eight bugs**, every one invisible to review:

| # | Found by | Bug |
|---|---|---|
| 1 | clean build | `0089` dropped `withdrawal_requests` while `admin_dashboard` still selected from it |
| 2 | clean build | `0090` named a plpgsql variable `next`, so `return next;` parsed as `RETURN NEXT` |
| 3 | clean build | `0096` dropped `tg_notify_deposit` / `tg_bump_wallet` with triggers still attached |
| 4 | clean build | same again for `tg_notify_gift_response` |
| 5 | clean build | `0096` defined `profile_social`; the real function is `get_profile_social`, so the fix was never called |
| 6 | **prod copy** | `0089` rebuilt `admin_dashboard` selecting `public.deposits` — which does not exist on the live database |
| 7 | **prod copy** | `0089` re-created `subscribe()` returning `public.user_subscriptions` — also absent |
| 8 | **prod copy** | the balance backfill left the ledger short, so `sum(delta) <> coins` for **all 170 users** |

Bugs 6–8 could not have been caught by a clean build: they exist only because
the live schema has drifted from the migration files. Bug 8 is the one that
mattered most — balances were all correct, but the credit ledger would not have
reconciled for a single user, for ever.

Victor, 19 Sep: *"A migration that rewrites every user's balance gets one
chance."*

## The live database is not what the migration history claims

`supabase migration list` reports `0001`–`0087` applied. Reality differs:

- `0088` was applied **by hand and never recorded** — `profiles.coins` and
  `coin_ledger` exist, with 9 rows in the ledger
- `profiles.gallery_urls`, and the `matches` / `gallery_views` /
  `gallery_interests` tables, come from **no migration in this repo**
- `wallets`, `ledger_entries`, `deposits`, `withdrawal_requests`, `fx_rates`,
  `subscription_plans`, `user_subscriptions` are **gone**, though their
  migrations are recorded as applied

Migrations `0089`–`0097` are now written to tolerate all of that —
`to_regclass()` guards, `cascade` on trigger functions, and no assumption that
a recorded migration actually ran. **Do not remove those guards.**

---

## What these migrations do

| | |
|---|---|
| `0089_remove_money_out.sql` | Drops every path that moves real money out — payouts, withdrawals, FX, affiliate, crypto. Rebuilds `ledger_kind`. |
| `0090_signup_minimum.sql` | Adds `profiles.language` and `gallery_urls` + the gallery RPCs. |
| `0091_people_feed.sql` | Adds `feed_seed` / `feed_position` and the people-feed RPCs. |
| `0092_credits.sql` | **Rewrites every balance.** Rebuilds `coin_kind`, adds `spend_daily_message_credit()`, grants 1,000 credits to everyone. |
| `0093_ads.sql` | `app_settings.ads_enabled` + admin RPC. |
| `0094_chat_games.sql` | `chat_games` + the turn/move RPCs. |
| `0095_game_secrets.sql` | `chat_game_secrets` + the hidden-information checks. |
| `0096_no_money.sql` | Removes subscriptions/wallet/deposits surfaces, makes gifts free, **and repairs a bug 0089 introduced** (see below). |
| `0097_lagos_day.sql` | Daily message charge rolls over at Lagos midnight, not UTC. |

### The bug 0096 repairs — read this before running 0089 anywhere

`0089` drops `has_active_subscription()`. Postgres does **not** dependency-track
string-bodied function definitions, so that drop succeeds while three things
still call it:

- **`tg_block_free_to_paid_dm`** — a `BEFORE INSERT` trigger on
  `public.messages`. Between `0089` and `0096`, **every message send fails**
  with `function public.has_active_subscription(uuid) does not exist`.
- `profile_social` / `profile_relations` — the blue-tick lookups. Every
  profile page and conversation list throws.
- `ranked_feed` — the old post feed's ordering.

**Consequence: `0089` through `0095` must never be left applied on their own.**
Run the whole range `0089 → 0097` in one transaction, or run `0096` immediately
after. Do not deploy a half-applied range to anything users can reach.

---

## Rehearsal 1 — clean build

Proves the migrations are internally consistent from nothing.

1. Create a second Supabase project, `love-meet-staging`.
2. Apply `0001` onwards from scratch:
   ```bash
   supabase link --project-ref <staging-ref>
   supabase db push
   ```
3. Expect zero errors. If `0092` or `0096` fails on the enum rebuild, it is
   almost certainly a function that still takes `coin_kind` as a parameter and
   was not dropped before the type was renamed.
4. Smoke-test against staging by pointing `.env.local` at it:
   - sign up → three steps → land on the feed
   - check the new profile holds exactly **1,000** credits
   - send a message → balance drops to **900**
   - send five more → still **900**
   - open a chat game, make a move, confirm the opponent is notified

## Rehearsal 2 — over a copy of production

This is the one that matters, and it is the one that found bugs 6, 7 and 8.
The clean build cannot tell you what the backfill does to real rows.

It needs no cloud project — Docker and the local stack are enough:

```bash
# 1. Back up production (schema + data). Keep it OUT of the repo: it is PII.
npx supabase db dump --linked -f backup/prod-schema.sql
npx supabase db dump --linked --data-only -f backup/prod-data.sql

# 2. Make the local database look exactly like production
npx supabase start
docker exec -i supabase_db_full-stack psql -U postgres -d postgres <<'EOF'
drop schema if exists public cascade; create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
set session_replication_role = replica;
delete from auth.identities; delete from auth.sessions; delete from auth.users;
reset session_replication_role;
delete from supabase_migrations.schema_migrations;
insert into supabase_migrations.schema_migrations (version)
select lpad(g::text,4,'0') from generate_series(1,87) g;   -- prod reports 0001..0087
EOF
docker exec -i supabase_db_full-stack psql -U postgres -d postgres -q < backup/prod-schema.sql
{ echo "set session_replication_role = replica;"; cat backup/prod-data.sql; } \
  | docker exec -i supabase_db_full-stack psql -U postgres -d postgres -q

# 3. Apply 0088..0097 over the real rows
npx supabase migration up --local
```

`session_replication_role = replica` disables FK checks and triggers during the
load, so row order does not matter and no app trigger fires on restored data.

Then run the verification queries below. The old cloud-staging steps follow for
reference if a hosted rehearsal is ever wanted:

1. **Take a production backup first and verify you can restore it.**
   ```bash
   supabase db dump --project-ref <prod-ref> -f prod-backup.sql
   ```
2. Restore that dump into a *second* staging project (or reset staging and
   load it).
3. Record the before-state:
   ```sql
   select count(*) as profiles,
          sum(coins) as total_coins,
          count(*) filter (where coins <> 100) as not_100
     from public.profiles;
   ```
4. Apply `0089 → 0097`.
5. **Verify the balance migration landed everyone on exactly 1,000:**
   ```sql
   -- Must return 0 rows. Any row here is a user whose balance is wrong.
   select id, coins from public.profiles where coins <> 1000;

   -- Every profile must have exactly one signup grant, never two.
   select user_id, count(*)
     from public.coin_ledger
    where kind = 'signup_grant'
    group by user_id
   having count(*) <> 1;

   -- The ledger must reconcile against the balance for every user.
   select p.id, p.coins, sum(cl.delta) as ledger_total
     from public.profiles p
     join public.coin_ledger cl on cl.user_id = p.id
    group by p.id, p.coins
   having p.coins <> sum(cl.delta);
   ```
   All three must return **no rows**.
6. Verify the `0089` fallout is repaired:
   ```sql
   -- Must be empty: nothing may still reference the dropped function.
   select proname from pg_proc
    where prosrc like '%has_active_subscription%'
      and pronamespace = 'public'::regnamespace;

   -- Must be empty: the free-to-paid DM trigger is gone.
   select tgname from pg_trigger
    where tgrelid = 'public.messages'::regclass
      and tgname = 'block_free_to_paid_dm';
   ```
7. Insert a message as a real user and confirm it succeeds. This is the
   single most important check in the whole runbook.

## The production run

1. Announce a short maintenance window.
2. **Fresh backup**, taken immediately before — not the rehearsal one.
3. Apply `0089 → 0097` as one unit.
4. Re-run every verification query from step 5 and 6 above against production.
5. Send one message from a real account.
6. Only then deploy the frontend.

### Rollback

`0092` and `0096` rebuild enum types and `0096` drops `post_gifts.amount_cents`.
There is **no down migration** — restoring the backup is the rollback. That is
why steps 2 and 3 are not optional.

---

## Not migrated, deliberately

`wallets`, `ledger_entries`, `deposits` and `user_subscriptions` are **retained
as archives** with all client access revoked. They hold the record of real
money real users paid, and dropping them destroys the only evidence behind any
refund, chargeback or year-end reconciliation.

Nothing can read or write them — no RPC, no policy, no grant — so they are
inert from the app's point of view. Export them and drop them as a separate,
deliberate step once finance has what it needs.
