-- Fix: feed-bot's persona roster (profiles.bot_kind = 'persona') was
-- originally seeded with `onboarded_at` set, which unintentionally made
-- those ~18 accounts show up in `searchable_profiles` (0018_search.sql)
-- and made them eligible for the new-member-nearby / match-post
-- notification fan-outs (00851_targeted_notifications.sql) — i.e. a real
-- user could find one via Search or get "Luna joined near you" / "Luna
-- posted" and pursue her as a genuine potential match. That's the exact
-- catfishing-adjacent risk the Day 2 feed-bot content policy (non-human
-- imagery only, generic placeholder avatars) was meant to avoid, and the
-- same reasoning 0095_like_bots.sql already applied to the liker cohort.
--
-- Personas should stay reachable exactly the way they were designed to be
-- — via feed posts/comments (profile tap → Message/game-invite) — not via
-- Search or match-suggestion notifications. Nothing in game-bot/chat-bot's
-- own RPCs (create_game/join_game/start_dm/messages) requires
-- `onboarded_at` to be set, so clearing it doesn't affect any bot
-- functionality. feed-bot's own seeding code no longer sets this field for
-- newly created personas either (see supabase/functions/feed-bot/index.ts).

update public.profiles
   set onboarded_at = null
 where bot_kind = 'persona'
   and onboarded_at is not null;
