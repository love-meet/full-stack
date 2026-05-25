import { useEffect, useRef, useState, Fragment, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useFeed, type FeedPost } from '../hooks/useFeed'
import { useToggleLike } from '../hooks/usePostMutations'
import { useFeedRealtime } from '../hooks/useFeedRealtime'
import { useUnreadNotifications, useNotificationsRealtime } from '../hooks/useNotifications'
import { useConversations } from '../hooks/useConversations'
import { useAuth } from '../stores/auth'
import { getSurface } from '../lib/surface'
import { avatarUrlOr } from '../lib/avatar'
import GiftSheet from '../components/GiftSheet'
import PostMoreDropdown from '../components/PostMoreDropdown'
import { IconComment, IconShare, IconMore, IconPlay } from '../components/icons'

export default function FeedScreen() {
  useFeedRealtime()
  useNotificationsRealtime()
  const unread = useUnreadNotifications().data ?? 0
  const unreadChats = (useConversations().data ?? []).filter((c) => c.unread_count > 0).length
  const feed = useFeed()
  const scrollerRef = useRef<HTMLDivElement>(null)

  const pages = feed.data?.pages ?? []
  const posts = pages.flat()
  const isEmpty = feed.status === 'success' && posts.length === 0

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
      {/* Floating top bar — transparent over the media, icons stay tappable. */}
      <div className="fixed top-0 left-0 right-0 lg:left-64 z-30 pointer-events-none">
        <div className="bg-gradient-to-b from-black/55 to-transparent">
          <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link to="/feed" className="flex items-center gap-2 lg:hidden pointer-events-auto">
              <img src="/logo.png" alt="" className="h-7 w-auto" />
              <span className="font-extrabold tracking-tight text-white text-lg drop-shadow">Meet</span>
            </Link>
            <div className="hidden lg:block" />
            <div className="flex items-center gap-1 pointer-events-auto">
              <TopIcon to="/search" label="Search" glyph="⌕" />
              <TopIcon to="/notifications" label="Notifications" glyph="🔔" badge={unread} />
              <TopIcon to="/chat" label="Chats" glyph="✉" badge={unreadChats} />
            </div>
          </div>
        </div>
      </div>

      {/* Full-screen vertical snap feed: one post per screen. Sits above the
          mobile bottom-nav (bottom-16) and clears the desktop sidebar. */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="fixed top-0 left-0 right-0 bottom-16 lg:left-64 lg:bottom-0 bg-black overflow-y-scroll snap-y snap-mandatory overscroll-contain no-scrollbar"
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

        {pages.map((page, i) => (
          <Fragment key={i}>
            {page.map((post) => (
              <FeedSlide key={post.id} post={post} />
            ))}
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

function TopIcon({ to, label, glyph, badge }: { to: string; label: string; glyph: string; badge?: number }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="relative w-10 h-10 grid place-items-center text-white/90 hover:text-white transition-colors drop-shadow"
    >
      <span className="text-xl">{glyph}</span>
      {!!badge && badge > 0 && (
        <span className="absolute top-1 right-1 min-w-[1.05rem] h-[1.05rem] px-1 rounded-full bg-rose text-white text-[10px] font-bold grid place-items-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// One full-screen post.
// ---------------------------------------------------------------------------
function FeedSlide({ post }: { post: FeedPost }) {
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
    <section className="relative h-full w-full snap-start snap-always grid place-items-center overflow-hidden">
      {/* Media — contained within the screen (whole media visible), centered. */}
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
          <img
            src={avatarUrlOr(post.author_avatar_url, post.author_gender)}
            alt=""
            className="w-10 h-10 rounded-full object-cover ring-2 ring-white/40 shrink-0"
          />
          <span className="text-sm font-bold text-white drop-shadow flex items-center gap-1 min-w-0">
            <span className="truncate">@{post.author_handle ?? post.author_display_name ?? 'unknown'}</span>
            {post.author_is_verified && <VerifiedBadge />}
          </span>
          <span className="text-[11px] text-white/70 drop-shadow">· {timeAgo(post.created_at)}</span>
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
// Custom video player: thumbnail + center play/pause, buffering spinner,
// bottom progress bar (scrub to seek). Tap center to play/pause. Pauses
// automatically when scrolled off-screen.
// ---------------------------------------------------------------------------
function FeedVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [started, setStarted] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1

  // Pause + reset the "playing" state when the slide scrolls out of view.
  useEffect(() => {
    const el = wrapRef.current
    const v = ref.current
    if (!el || !v) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio < 0.5 && !v.paused) {
          v.pause()
        }
      },
      { threshold: [0, 0.5, 1] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  function toggle() {
    const v = ref.current
    if (!v) return
    if (v.paused) {
      setStarted(true)
      v.muted = false
      void v.play().catch(() => {})
    } else {
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

      {/* Center tap target: play / pause. */}
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="absolute inset-0 grid place-items-center"
      >
        {/* Show the big control when paused or buffering; hide while playing cleanly. */}
        {(!playing || buffering) && (
          <span className="relative grid place-items-center w-16 h-16">
            {buffering && (
              <span className="absolute inset-0 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            )}
            <span className="w-16 h-16 rounded-full bg-black/45 grid place-items-center text-white">
              {playing ? <PauseGlyph /> : <IconPlay size={30} className="ml-0.5" />}
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

      {!started && <span className="sr-only">Video — tap to play</span>}
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
