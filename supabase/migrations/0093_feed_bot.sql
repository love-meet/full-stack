-- M?? — feed bot: synthetic accounts that post + comment on the feed to
-- keep it feeling alive.
--
-- Content policy (do not relax without re-checking with product): bot
-- avatars are left null (falls back to the app's existing generic
-- gendered placeholder — same one shown for any real user with no photo)
-- and bot POSTS only ever use non-human stock imagery (nature, travel,
-- pets, food, hobbies). Never a photo implying "this is a real dateable
-- person" — see the `feed-bot` Edge Function for the image pool.
--
-- Run after 0003_profile_extensions.sql. Then:
--   1. Deploy the Edge Function:
--        npx supabase functions deploy feed-bot --project-ref <ref>
--   2. Set secrets:
--        npx supabase secrets set FEED_BOT_SECRET=<any long random string>
--   3. Enable the `pg_net` extension (Dashboard → Database → Extensions),
--      alongside `pg_cron` (already enabled for the game auto-sweep, see
--      0057_game_autosweep.sql).
--   4. Replace <project-ref> and <FEED_BOT_SECRET> below with your real
--      values and run this file.
--   5. One-time only: call the function once with body {"action":"seed"}
--      (same x-webhook-secret header) to create the bot roster.

alter table public.profiles
  add column if not exists is_bot boolean not null default false;

create index if not exists profiles_is_bot_idx on public.profiles (is_bot) where is_bot;

-- Fast "has this bot already commented on this post" lookups.
create index if not exists post_comments_author_post_idx
  on public.post_comments (author_id, post_id);

-- =========================================================================
-- Schedule: invoke the feed-bot Edge Function every 20 minutes.
-- =========================================================================
-- NOTE: the url/secret below contain <placeholders> that MUST be hand-edited
-- before this block is run (SQL editor), because `supabase db push` applies
-- migration files verbatim. The guard refuses to schedule a job pointing at
-- a literal placeholder — unedited, this migration is a no-op with a notice
-- instead of a cron job that fails every 20 minutes forever.
do $$
declare
  cron_url    text := 'https://<project-ref>.supabase.co/functions/v1/feed-bot';
  cron_secret text := '<FEED_BOT_SECRET>';
begin
  if cron_url like '%<%' or cron_secret like '%<%' then
    raise notice 'feed-bot cron NOT scheduled: placeholders not filled in (edit 0093_feed_bot.sql or run the block manually)';
    return;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule('feed-bot-tick')
      where exists (select 1 from cron.job where jobname = 'feed-bot-tick');
    perform cron.schedule(
      'feed-bot-tick',
      '*/20 * * * *',
      format($cron$
        select net.http_post(
          url     := %L,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-webhook-secret', %L
          ),
          body    := '{}'::jsonb
        );
      $cron$, cron_url, cron_secret)
    );
  end if;
end $$;
