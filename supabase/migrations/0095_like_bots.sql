-- M?? — like bots: a large (up to ~10,000), minimal-profile pool of bot
-- accounts whose only job is to like real posts, trickling in over time
-- rather than all at once, and never covering every post fully.
--
-- These are deliberately NOT the same as feed-bot's persona roster:
--   - `profiles.bot_kind` distinguishes 'persona' (posts + comments + can be
--     chatted with/played against — feed-bot/game-bot/chat-bot) from
--     'liker' (this migration — likes only, minimal identity, never posts,
--     never discoverable, never messageable).
--   - Existing `is_bot = true` rows are backfilled to bot_kind = 'persona'
--     so feed-bot/game-bot keep working unchanged — see the companion edits
--     to those functions' bot-roster queries (now filtered by bot_kind).
--   - Liker accounts are seeded WITHOUT `onboarded_at` set. That's what
--     keeps them out of `searchable_profiles` (0018_search.sql filters on
--     `onboarded_at is not null`) and out of the new-member-nearby /
--     match-post notification fan-outs (00851, same filter) — no schema
--     change needed there, just never flipping that column for this cohort.
--   - A liker's like never generates a "X liked your post" notification
--     (see tg_notify_like below) — the point is ambient social proof on the
--     like COUNT, not a flood of notifications from obviously-synthetic
--     accounts.
--
-- Run after 0094_game_chat_bot.sql. Then:
--   1. Deploy: npx supabase functions deploy like-bot --project-ref <ref>
--   2. Secret: npx supabase secrets set LIKE_BOT_SECRET=<any long random string>
--   3. Seed in chunks (see SETUP.md) — call repeatedly with
--      {"action":"seed","target":10000} until the response reports the
--      target reached; each call only creates what's still missing.
--   4. Replace <project-ref> / <LIKE_BOT_SECRET> below and run this file —
--      schedules like-bot to tick every 5 minutes.

alter table public.profiles
  add column if not exists bot_kind text check (bot_kind in ('persona', 'liker'));

update public.profiles set bot_kind = 'persona' where is_bot = true and bot_kind is null;

create index if not exists profiles_bot_kind_idx
  on public.profiles (bot_kind) where bot_kind is not null;

-- =========================================================================
-- bot_add_likes — atomically like a post with up to p_take random liker
-- bots that haven't already liked it. NOT granted to `authenticated` (a
-- real user must never be able to call this on their own posts) — only
-- reachable via the like-bot Edge Function's service-role client.
-- =========================================================================
create or replace function public.bot_add_likes(p_post_id uuid, p_take int)
returns int
language plpgsql security definer set search_path = public
as $$
declare inserted int;
begin
  insert into public.post_likes (post_id, user_id)
  select p_post_id, pr.id
    from public.profiles pr
   where pr.bot_kind = 'liker'
     and not exists (
       select 1 from public.post_likes pl
        where pl.post_id = p_post_id and pl.user_id = pr.id
     )
   order by random()
   limit greatest(0, p_take)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end $$;

-- =========================================================================
-- Skip notifications for liker-bot likes — see header comment.
-- =========================================================================
create or replace function public.tg_notify_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare author uuid; liker_bot boolean;
begin
  select (bot_kind = 'liker') into liker_bot from public.profiles where id = new.user_id;
  if coalesce(liker_bot, false) then return new; end if;
  select author_id into author from public.posts where id = new.post_id;
  perform public.tg_notify(author, new.user_id, 'like', new.post_id, null, null);
  return new;
end $$;

-- =========================================================================
-- Schedule: invoke the like-bot Edge Function every 5 minutes.
-- =========================================================================
-- Placeholder guard: refuses to schedule with unedited <placeholders> (see
-- 0093 for rationale — `supabase db push` applies files verbatim).
do $$
declare
  cron_url    text := 'https://<project-ref>.supabase.co/functions/v1/like-bot';
  cron_secret text := '<LIKE_BOT_SECRET>';
begin
  if cron_url like '%<%' or cron_secret like '%<%' then
    raise notice 'like-bot cron NOT scheduled: placeholders not filled in (edit 0095_like_bots.sql or run the block manually)';
    return;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule('like-bot-tick')
      where exists (select 1 from cron.job where jobname = 'like-bot-tick');
    perform cron.schedule(
      'like-bot-tick',
      '*/5 * * * *',
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
