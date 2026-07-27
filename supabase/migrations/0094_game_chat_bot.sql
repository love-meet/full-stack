-- M?? — game + chat bots. Reuses the `profiles.is_bot` roster seeded by
-- 0093_feed_bot.sql: the same personas can now (a) auto-fill an understaffed
-- 1v1 game lobby as a live opponent, and (b) reply in DM conversations a real
-- user starts with them (via the existing profile → Message flow — no new
-- client code needed for either surface).
--
-- Both bots authenticate as the acting bot user (real Supabase session, not
-- service-role) because the game RPCs and the `messages` insert RLS policy
-- key off `auth.uid()`. That means every `is_bot` profile needs a known,
-- shared password — set once via the `game-bot` function's {"action":
-- "prepare"} call (see SETUP.md), never exposed to end users.
--
-- Run after 0093_feed_bot.sql. Then:
--   1. Deploy both functions:
--        npx supabase functions deploy game-bot --project-ref <ref>
--        npx supabase functions deploy chat-bot --project-ref <ref>
--   2. Set secrets:
--        npx supabase secrets set GAME_BOT_SECRET=<any long random string>
--        npx supabase secrets set BOT_ACCOUNT_PASSWORD=<any long random string>
--        npx supabase secrets set ANTHROPIC_API_KEY=<your Anthropic API key>
--   3. Call game-bot once with body {"action":"prepare"} (x-webhook-secret
--      header = GAME_BOT_SECRET) to set every bot's password + top up coins.
--   4. Replace <project-ref> / <GAME_BOT_SECRET> below and run this file —
--      schedules game-bot every minute via pg_cron + pg_net (same extensions
--      as 0093_feed_bot.sql; enable pg_net if you haven't already).
--   5. Wire chat-bot as a Database Webhook (Dashboard → Database → Webhooks)
--      on `public.messages` INSERT → HTTP Request to the chat-bot URL, header
--      x-webhook-secret = a secret you set as CHAT_BOT_SECRET — same pattern
--      as the existing notify-email webhook (see SETUP.md M5 notes).

-- Fast "which lobbies need filling" scan.
create index if not exists games_lobby_scan_idx
  on public.games (status, created_at) where status = 'lobby';

-- =========================================================================
-- Schedule: invoke the game-bot Edge Function every minute.
-- =========================================================================
-- Placeholder guard: refuses to schedule with unedited <placeholders> (see
-- 0093 for rationale — `supabase db push` applies files verbatim).
do $$
declare
  cron_url    text := 'https://<project-ref>.supabase.co/functions/v1/game-bot';
  cron_secret text := '<GAME_BOT_SECRET>';
begin
  if cron_url like '%<%' or cron_secret like '%<%' then
    raise notice 'game-bot cron NOT scheduled: placeholders not filled in (edit 0094_game_chat_bot.sql or run the block manually)';
    return;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule('game-bot-tick')
      where exists (select 1 from cron.job where jobname = 'game-bot-tick');
    perform cron.schedule(
      'game-bot-tick',
      '* * * * *',
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
