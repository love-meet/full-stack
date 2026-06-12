-- 0086_audio_tracks.sql
-- Curated music library for posts. v1: admin-seeded tracks only,
-- no user uploads. Users pick a track in the compose flow; it plays
-- on the feed card (muted autoplay → tap speaker to unmute).

-- =========================================================================
-- audio_tracks — the curated library
-- =========================================================================
create table if not exists public.audio_tracks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  artist       text not null,
  audio_url    text not null,
  cover_url    text,           -- album art / waveform thumbnail
  duration_sec int,            -- display only; null = unknown
  genre        text,           -- e.g. 'lofi', 'afrobeats' — for future filtering
  created_at   timestamptz not null default now()
);

alter table public.audio_tracks enable row level security;

-- Everyone signed in can read the library; only service-role can write.
create policy "audio_tracks_public_read"
  on public.audio_tracks for select to authenticated using (true);

-- =========================================================================
-- posts — add audio_track_id (nullable; most posts have no music)
-- =========================================================================
alter table public.posts
  add column if not exists audio_track_id uuid
    references public.audio_tracks(id) on delete set null;

-- =========================================================================
-- posts_with_counts — extend view to surface audio fields
-- The ranked_feed RPC already does "select pwc.*" so it picks these up
-- automatically with no change to the function signature.
-- =========================================================================
create or replace view public.posts_with_counts as
select
  p.id,
  p.author_id,
  p.kind,
  p.media_url,
  p.media_aspect,
  p.caption,
  p.created_at,
  -- settings columns added in later migrations
  coalesce(p.hide_like_count,     false) as hide_like_count,
  coalesce(p.comments_disabled,   false) as comments_disabled,
  p.alt_text,
  -- audio track (nullable)
  p.audio_track_id,
  at.title        as audio_track_title,
  at.artist       as audio_track_artist,
  at.audio_url    as audio_track_url,
  at.cover_url    as audio_track_cover_url,
  -- counts
  coalesce(l.like_count,    0) as like_count,
  coalesce(c.comment_count, 0) as comment_count,
  coalesce(g.gift_count,    0) as gift_count,
  -- viewer state
  exists (
    select 1 from public.post_likes
    where post_id = p.id and user_id = auth.uid()
  ) as liked_by_me,
  exists (
    select 1 from public.bookmarks
    where post_id = p.id and user_id = auth.uid()
  ) as bookmarked_by_me,
  -- author quick-info
  pr.handle           as author_handle,
  pr.display_name     as author_display_name,
  pr.avatar_url       as author_avatar_url,
  pr.gender           as author_gender,
  public.has_active_subscription(p.author_id) as author_is_verified
from public.posts p
left join public.audio_tracks at on at.id = p.audio_track_id
left join lateral (
  select count(*) as like_count from public.post_likes where post_id = p.id
) l on true
left join lateral (
  select count(*) as comment_count from public.post_comments where post_id = p.id
) c on true
left join lateral (
  select count(*) as gift_count from public.gifts where post_id = p.id
) g on true
left join public.profiles pr on pr.id = p.author_id;

-- =========================================================================
-- Seed: 7 royalty-free tracks
-- NOTE: audio_url values below are SoundHelix demo tracks used as
-- placeholder CDN links. Replace with Pixabay Music / uploaded CDN URLs
-- before deploying to production at scale.
-- Licence: SoundHelix tracks are free for non-commercial and commercial
-- use — https://www.soundhelix.com/licence
-- =========================================================================
insert into public.audio_tracks (title, artist, audio_url, cover_url, duration_sec, genre) values
  (
    'Late Night Feels',
    'SoundHelix',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    null,
    370,
    'lofi'
  ),
  (
    'Golden Hour',
    'SoundHelix',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    null,
    310,
    'romantic'
  ),
  (
    'Afro Sunrise',
    'SoundHelix',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    null,
    280,
    'afrobeats'
  ),
  (
    'Smooth Groove',
    'SoundHelix',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    null,
    260,
    'rnb'
  ),
  (
    'Midnight Jazz',
    'SoundHelix',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    null,
    340,
    'jazz'
  ),
  (
    'Bossa Tarde',
    'SoundHelix',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
    null,
    295,
    'bossa-nova'
  ),
  (
    'Summer Rush',
    'SoundHelix',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
    null,
    320,
    'pop'
  );
