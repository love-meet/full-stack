import { useEffect, useRef, useState, Fragment, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useFeed, type FeedPost } from '../hooks/useFeed'
import OnboardingPrompts from '../components/OnboardingPrompts'
import TopIcons from '../shell/TopIcons'
import { useToggleLike } from '../hooks/usePostMutations'
import { useFeedRealtime } from '../hooks/useFeedRealtime'
import { useMySubscription } from '../hooks/usePayments'
import { useRelations, useToggleFollow, type Relation } from '../hooks/useFollow'
import { useLiveGames, type LiveGame } from '../hooks/usePixelGame'
import { useAuth } from '../stores/auth'
import BlueTick from '../components/BlueTick'
import { useFeedPrefs } from '../stores/feedPrefs'
import { getSurface } from '../lib/surface'
import { avatarUrlOr } from '../lib/avatar'
import PresenceDot from '../components/PresenceDot'
import GiftSheet from '../components/GiftSheet'
import FeedAd from '../components/FeedAd'
import PostMoreDropdown from '../components/PostMoreDropdown'
import { IconComment, IconShare, IconMore, IconPlay } from '../components/icons'

// Sponsored slides appear at RANDOM gaps (not a fixed count) for free-mode
// users, so an ad can surface as the next post at any time. Gaps stay within
// these bounds so it's neither too rare nor spammy.
const AD_MIN_GAP = 3
const AD_MAX_GAP = 7

// Deterministic per-session ad positions: a seeded PRNG gives varied,
// unpredictable gaps that stay stable across re-renders (and as more posts
// load), so slides don't reshuffle while scrolling.
function computeAdPositions(count: number, seed: number): Set<number> {
  let a = seed >>> 0
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const gap = () => AD_MIN_GAP + Math.floor(rand() * (AD_MAX_GAP - AD_MIN_GAP + 1))
  const positions = new Set<number>()
  let i = gap() - 1 // index after which the first ad shows
  while (i < count) {
    positions.add(i)
    i += gap()
  }
  return positions
}

export default function FeedScreen() {
  useFeedRealtime()
  const isSubscriber = !!useMySubscription().data
  const showAds = !isSubscriber
  const feed = useFeed()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const adSeed = useRef(Math.floor(Math.random() * 1e9))

  const pages = feed.data?.pages ?? []
  const posts = pages.flat()
  const relations = useRelations(posts.map((p) => p.author_id))
  const liveGames = useLiveGames().data ?? []
  const isEmpty = feed.status === 'success' && posts.length === 0
  const adAfter = useMemo(
    () => (showAds ? computeAdPositions(posts.length, adSeed.current) : new Set<number>()),
    [showAds, posts.length],
  )

  // Load the next page as the viewer nears the end of the current one.
  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el || !feed.hasNextPage || feed.isFetchingNextPage) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - el.clientHeight * 1.5) {
      feed.fetchNextPage()
    }
  }, [feed])

  return (
    <>
      <OnboardingPrompts />
      {/* Floating top bar — transparent over the media, icons stay tappable. */}
      <div className="fixed top-0 left-0 right-0 lg:left-64 xl:right-[22rem] z-30 pointer-events-none">
        <div className="bg-gradient-to-b from-black/55 to-transparent" style={{ paddingTop: 'var(--lm-top-inset)' }}>
          <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link to="/feed" className="flex items-center gap-2 lg:hidden pointer-events-auto">
              <img src="/logo.png" alt="" className="h-7 w-auto" />
              <span className="font-extrabold tracking-tight text-white text-lg drop-shadow">Meet</span>
            </Link>
            <div className="hidden lg:block" />
            <div className="pointer-events-auto">
              <TopIcons tone="light" />
            </div>
          </div>
        </div>
      </div>

      {/* Full-screen vertical snap feed: one post per screen. Sits above the
          mobile bottom-nav (bottom-16) and clears the desktop sidebar. */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="fixed top-0 left-0 right-0 bottom-[calc(4rem_+_var(--lm-bottom-inset))] lg:left-64 lg:bottom-0 xl:right-[22rem] bg-black overflow-y-scroll snap-y snap-mandatory overscroll-contain no-scrollbar"
      >
        {feed.status === 'pending' && (
          <div className="h-full grid place-items-center">
            <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        )}

        {feed.status === 'error' && (
          <div className="h-full grid place-items-center px-8">
            <div className="glass rounded-2xl p-5 text-sm text-danger text-center">
              Couldn't load the feed: {(feed.error as Error).message}
            </div>
          </div>
        )}

        {isEmpty && (
          <div className="h-full grid place-items-center px-8">
            <div className="text-center">
              <div className="text-5xl mb-3">📭</div>
              <p className="text-white font-semibold mb-1">Nothing here yet</p>
              <p className="text-sm text-white/60">Tap the + tab to share your first post.</p>
            </div>
          </div>
        )}

        {liveGames.length > 0 && <LiveGamesSlide games={liveGames} />}

        {posts.map((post, i) => (
          <Fragment key={post.id}>
            <FeedSlide post={post} relation={relations.data?.get(post.author_id)} />
            {adAfter.has(i) && <AdSlide />}
          </Fragment>
        ))}

        {feed.isFetchingNextPage && (
          <div className="h-16 grid place-items-center">
            <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        )}
      </div>
    </>
  )
}

// A sponsored slide — same full-screen footprint as a post. Renders nothing
// if no Adsterra key is configured, so the feed just skips it.
function AdSlide() {
  return (
    <section className="relative h-full w-full snap-start snap-always bg-black grid place-items-center px-5">
      <div className="w-full max-w-3xl mx-auto flex flex-col items-center">
        <div className="glass rounded-3xl px-5 pt-4 pb-5 flex flex-col items-center gap-4 w-full max-w-md sm:max-w-3xl">
          <span className="self-start text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
            Sponsored
          </span>
          <div className="grid place-items-center min-h-[250px] w-full">
            <FeedAd />
          </div>
        </div>
        <p className="mt-4 text-xs text-white/55 text-center">
          Ads keep Love meet free —{' '}
          <Link to="/subscription" className="text-rose font-semibold hover:underline">go premium</Link>{' '}
          to remove them.
        </p>
      </div>
    </section>
  )
}

// All currently-live games in ONE slide, scrollable horizontally so 70 live
// games don't flood the feed as 70 separate slides. Width matches the rest
// of the feed (max-w-xl) so swiping vertically doesn't reveal a layout jump.
function LiveGamesSlide({ games }: { games: LiveGame[] }) {
  // Centre the row when it fits the viewport (≤ 2 cards); flow-start so
  // longer rows scroll naturally from the leading edge.
  return (
    <section className="relative h-full w-full snap-start snap-always bg-black grid place-items-center overflow-hidden">
      <div className="w-full max-w-xl mx-auto px-4">
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white bg-rose rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> {games.length} live now
          </span>
        </div>
        <p className="text-center text-xs text-white/60 mb-2">Swipe to peek into any live game</p>
        <div className="overflow-x-auto no-scrollbar pb-2 snap-x snap-mandatory">
          <div className={['flex gap-3 min-w-min', games.length <= 2 ? 'justify-center' : ''].join(' ')}>
            {games.map((g) => <LiveGameCard key={g.id} game={g} />)}
          </div>
        </div>
      </div>
    </section>
  )
}

function LiveGameCard({ game }: { game: LiveGame }) {
  const ps = [...(game.players ?? [])].sort((a, b) => a.joined_at.localeCompare(b.joined_at))
  return (
    <Link
      to={`/play/${game.invite_code}`}
      className="w-[260px] shrink-0 snap-center glass rounded-2xl p-5 text-center block hover:ring-1 hover:ring-gold/40 transition-shadow"
      style={{ background: 'radial-gradient(380px 280px at 50% 0%, rgba(53,205,232,0.20), transparent 60%)' }}
    >
      <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-white bg-rose rounded-full px-2 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live
      </span>
      <div className="mt-3 flex items-center justify-center gap-2">
        <PlayerFace p={ps[0]} />
        <span className="text-base font-extrabold text-gradient-warm shrink-0">VS</span>
        <PlayerFace p={ps[1]} />
      </div>
      <h3 className="mt-3 text-base font-extrabold text-gradient-warm">Pixel Rush</h3>
      <p className="mt-0.5 text-[11px] text-ink-2">
        {game.kind === '1v1' ? '1 v 1' : 'Team'} · Round {game.current_round}/{game.rounds_total}
      </p>
      <span className="mt-3 inline-block rounded-full px-4 py-1.5 bg-gradient-brand text-white text-xs font-bold glow-rose">
        ▶ Watch
      </span>
    </Link>
  )
}

function PlayerFace({ p }: { p?: LiveGame['players'][number] }) {
  const label = p?.profile?.handle ?? p?.profile?.display_name ?? 'Player'
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="relative">
        <img
          src={avatarUrlOr(p?.profile?.avatar_url)}
          alt=""
          className="w-20 h-20 rounded-full object-cover ring-2 ring-white/30"
        />
        {p?.user_id && <PresenceDot userId={p.user_id} size="md" ringColor="ring-black/60" />}
      </span>
      <span className="text-xs text-white/90 max-w-20 truncate">@{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// One full-screen post.
// ---------------------------------------------------------------------------
function FeedSlide({ post, relation }: { post: FeedPost; relation?: Relation }) {
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const toggleLike = useToggleLike()
  const [popKey, setPopKey] = useState(0)
  const [giftOpen, setGiftOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const moreBtnRef = useRef<HTMLButtonElement>(null)

  const isMine = myId === post.author_id

  function onLike() {
    toggleLike.mutate({ postId: post.id, nextLiked: !post.liked_by_me })
    if (!post.liked_by_me) setPopKey((k) => k + 1)
  }

  return (
    <section className="relative h-full w-full snap-start snap-always bg-black overflow-hidden">
      {/* Centered column — the post keeps a phone-ish max width (like before)
          instead of stretching across a wide desktop. Everything (media,
          caption, action rail) lives inside it. */}
      <div className="relative h-full w-full max-w-md mx-auto">
      {/* Media — full HEIGHT of the screen, whole image/video visible (never
          cropped); width follows. object-contain on a definite box. */}
      {post.kind === 'image' ? (
        <img src={post.media_url} alt={post.alt_text ?? ''} className="w-full h-full object-contain" />
      ) : (
        <FeedVideo src={post.media_url} />
      )}

      {/* Top + bottom scrims for legibility. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/70 to-transparent" />

      {/* Caption + author — bottom-left, above the action rail. */}
      <div className="absolute left-0 right-16 bottom-0 p-4 pb-5">
        <Link to={`/profile/${post.author_id}`} className="flex items-center gap-2.5 mb-2 active:opacity-70">
          <span className="relative shrink-0">
            <img
              src={avatarUrlOr(post.author_avatar_url, post.author_gender)}
              alt=""
              className="w-10 h-10 rounded-full object-cover ring-2 ring-white/40"
            />
            <PresenceDot userId={post.author_id} size="md" ringColor="ring-black/60" />
          </span>
          <span className="text-sm font-bold text-white drop-shadow flex items-center gap-1 min-w-0">
            <span className="truncate">@{post.author_handle ?? post.author_display_name ?? 'unknown'}</span>
            {relation?.is_subscriber ? <BlueTick size={15} /> : post.author_is_verified && <VerifiedBadge />}
          </span>
          <span className="text-[11px] text-white/70 drop-shadow">· {timeAgo(post.created_at)}</span>
          {!isMine && (
            <FeedFollowButton authorId={post.author_id} initialFollowing={relation?.is_following ?? false} />
          )}
        </Link>
        {post.caption && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-left text-white text-sm leading-relaxed drop-shadow block"
          >
            <span className={expanded ? '' : 'line-clamp-2'}>{post.caption}</span>
          </button>
        )}
      </div>

      {/* Action rail — vertical, bottom-right. */}
      <div className="absolute right-2 bottom-4 flex flex-col items-center gap-5">
        <RailButton onClick={onLike} label={post.hide_like_count ? undefined : formatCount(post.like_count)} active={post.liked_by_me}>
          <motion.span
            key={popKey}
            initial={popKey ? { scale: 1.6 } : false}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 16 }}
            className="text-[26px] leading-none"
          >
            {post.liked_by_me ? '❤️' : '🤍'}
          </motion.span>
        </RailButton>

        {!post.comments_disabled && (
          <Link to={`/p/${post.id}`} className="flex flex-col items-center gap-1 text-white drop-shadow">
            <IconComment size={28} className="text-white" />
            <span className="text-[11px] font-semibold">{formatCount(post.comment_count)}</span>
          </Link>
        )}

        <RailButton onClick={() => shareToTelegram(post)}>
          <IconShare size={28} className="text-white" />
        </RailButton>

        {!isMine && (
          <RailButton onClick={() => setGiftOpen(true)} label={post.gift_count > 0 ? formatCount(post.gift_count) : undefined}>
            <span className="text-[26px] leading-none">🎁</span>
          </RailButton>
        )}

        <button
          ref={moreBtnRef}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="More options"
          className="text-white drop-shadow"
        >
          <IconMore size={26} className="text-white" />
        </button>
        {menuOpen && (
          <PostMoreDropdown post={post} isMine={isMine} anchorRef={moreBtnRef} onClose={() => setMenuOpen(false)} />
        )}
      </div>
      </div>

      <AnimatePresence>
        {giftOpen && (
          <GiftSheet
            postId={post.id}
            recipientId={post.author_id}
            recipientLabel={post.author_handle ?? post.author_display_name ?? 'user'}
            onClose={() => setGiftOpen(false)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

/** Compact "Follow" chip on the feed author line (blurred bg). Disappears
 *  once you're following (initially or after tapping). */
function FeedFollowButton({ authorId, initialFollowing }: { authorId: string; initialFollowing: boolean }) {
  const toggle = useToggleFollow(authorId)
  const [done, setDone] = useState(false)
  if (initialFollowing || done) return null
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDone(true); toggle.mutate(true) }}
      className="ml-1 shrink-0 text-[11px] font-bold text-white bg-white/15 backdrop-blur-sm px-2.5 py-0.5 rounded-full ring-1 ring-white/30"
    >
      Follow
    </button>
  )
}

function RailButton({
  children, onClick, label, active,
}: {
  children: React.ReactNode
  onClick: () => void
  label?: string
  active?: boolean
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.85 }}
      className={['flex flex-col items-center gap-1 drop-shadow', active ? 'text-rose' : 'text-white'].join(' ')}
    >
      {children}
      {label && <span className="text-[11px] font-semibold">{label}</span>}
    </motion.button>
  )
}

// ---------------------------------------------------------------------------
// Custom video player: autoplays (muted) when it's the on-screen post; tap
// center to pause/replay; buffering spinner; bottom progress bar to scrub;
// speaker toggle for sound. Pauses automatically when scrolled off-screen.
// ---------------------------------------------------------------------------
function FeedVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1
  const muted = useFeedPrefs((s) => s.muted)
  const setMuted = useFeedPrefs((s) => s.setMuted)
  // Remember if the user explicitly paused this slide, so the visibility
  // observer doesn't fight them and re-play it while it's still on screen.
  const userPaused = useRef(false)

  // Autoplay when this post is on screen; pause when it scrolls away.
  useEffect(() => {
    const el = wrapRef.current
    const v = ref.current
    if (!el || !v) return
    const io = new IntersectionObserver(
      ([entry]) => {
        const onScreen = entry.intersectionRatio >= 0.6
        if (onScreen) {
          userPaused.current = false
          v.muted = useFeedPrefs.getState().muted
          v.play().catch(() => {
            // Autoplay with sound can be blocked — retry muted so it still plays.
            v.muted = true
            useFeedPrefs.getState().setMuted(true)
            v.play().catch(() => {})
          })
        } else {
          v.pause()
        }
      },
      { threshold: [0, 0.6, 1] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Keep the element's muted flag in sync with the shared preference.
  useEffect(() => {
    if (ref.current) ref.current.muted = muted
  }, [muted])

  function togglePlay() {
    const v = ref.current
    if (!v) return
    if (v.paused) {
      userPaused.current = false
      void v.play().catch(() => {})
    } else {
      userPaused.current = true
      v.pause()
    }
  }

  function seek(clientX: number) {
    const v = ref.current
    const bar = barRef.current
    if (!v || !bar || !v.duration) return
    const rect = bar.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    v.currentTime = frac * v.duration
    setProgress(frac)
  }

  return (
    <div ref={wrapRef} className="relative h-full w-full grid place-items-center">
      <video
        ref={ref}
        src={src}
        className="w-full h-full object-contain"
        playsInline
        loop
        muted={muted}
        preload="metadata"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget
          if (v.duration) setProgress(v.currentTime / v.duration)
        }}
      />

      {/* Center tap target: play / pause. The control group (sound toggle +
          play/pause) shows when paused or buffering and hides while playing. */}
      <button
        onClick={togglePlay}
        aria-label={playing ? 'Pause' : 'Play'}
        className="absolute inset-0 grid place-items-center"
      >
        {(!playing || buffering) && (
          <span className="flex flex-col items-center gap-4">
            {/* Sound toggle — sits above the play button, monochrome white to
                match it. stopPropagation so it doesn't also play/pause. */}
            <span
              role="button"
              aria-label={muted ? 'Unmute' : 'Mute'}
              onClick={(e) => { e.stopPropagation(); setMuted(!muted) }}
              className="w-10 h-10 rounded-full bg-black/45 grid place-items-center text-white"
            >
              {muted ? <IconMuted /> : <IconSound />}
            </span>
            <span className="relative grid place-items-center w-16 h-16">
              {buffering && (
                <span className="absolute inset-0 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              )}
              <span className="w-16 h-16 rounded-full bg-black/45 grid place-items-center text-white">
                {playing ? <PauseGlyph /> : <IconPlay size={30} className="ml-0.5" />}
              </span>
            </span>
          </span>
        )}
      </button>

      {/* Bottom progress bar — view + scrub. */}
      <div
        ref={barRef}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          seek(e.clientX)
        }}
        onPointerMove={(e) => { if (e.buttons === 1) seek(e.clientX) }}
        className="absolute bottom-0 left-0 right-0 px-0 py-2 cursor-pointer"
      >
        <div className="h-1 mx-0 rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

function PauseGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}

function IconSound() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" />
      <path d="M16 8.5a4 4 0 0 1 0 7M18.5 6a7.5 7.5 0 0 1 0 12"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconMuted() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" />
      <path d="M16.5 9.5l5 5M21.5 9.5l-5 5"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Small cyan ✓ badge, matching the mobile MaterialIcons "verified" tint. */
function VerifiedBadge() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-label="Verified" className="text-gold shrink-0">
      <path fill="currentColor" d="M10 1.2l2 1.6 2.5-.3.7 2.4 2.3 1-.4 2.5 1.4 2.1-1.6 2 .3 2.5-2.4.7-1 2.3-2.5-.4-2.1 1.4-2-1.6-2.5.3-.7-2.4-2.3-1 .4-2.5L.6 9.4 2.2 7.4 2 5l2.4-.7 1-2.3 2.5.4z" />
      <path fill="#070A16" d="M8.5 12.2l-2-2 1.1-1.1 1 1 3.2-3.3 1.1 1.1z" />
    </svg>
  )
}

function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0) + 'k'
  return (n / 1_000_000).toFixed(1) + 'm'
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return `${Math.floor(s)}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function shareToTelegram(post: FeedPost) {
  const url = `${window.location.origin}/feed?post=${post.id}`
  const text = post.caption
    ? `“${post.caption.slice(0, 100)}” — @${post.author_handle ?? 'someone'} on Love meet`
    : `Look at this on Love meet`
  if (getSurface() === 'telegram' && window.Telegram?.WebApp) {
    const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
    const wa = window.Telegram.WebApp as unknown as { openTelegramLink?: (s: string) => void }
    if (wa.openTelegramLink) { wa.openTelegramLink(share); return }
  }
  if (navigator.share) { void navigator.share({ url, text }).catch(() => {}); return }
  window.open(
    `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    '_blank',
  )
}
