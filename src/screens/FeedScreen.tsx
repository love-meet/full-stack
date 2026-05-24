import { useEffect, useRef, useState, Fragment } from 'react'
import { motion, useMotionValue, animate, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { stagger, itemUp } from '../shell/motion'
import { useFeed, type FeedPost } from '../hooks/useFeed'
import { useToggleLike } from '../hooks/usePostMutations'
import { useFeedRealtime } from '../hooks/useFeedRealtime'
import { useUnreadNotifications, useNotificationsRealtime } from '../hooks/useNotifications'
import { useAuth } from '../stores/auth'
import { getSurface } from '../lib/surface'
import { avatarUrlOr } from '../lib/avatar'
import GiftSheet from '../components/GiftSheet'
import PostMoreDropdown from '../components/PostMoreDropdown'
import { IconComment, IconShare, IconMore } from '../components/icons'

export default function FeedScreen() {
  useFeedRealtime()
  useNotificationsRealtime()
  const unread = useUnreadNotifications().data ?? 0
  const feed = useFeed()
  const headerY = useMotionValue(0)
  const lastScrollY = useRef(0)

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY
      const dy = y - lastScrollY.current
      if (y > 50 && dy > 0) {
        animate(headerY, -80, { duration: 0.25, ease: [0.22, 1, 0.36, 1] })
      } else if (dy < 0 || y <= 0) {
        animate(headerY, 0, { duration: 0.25, ease: [0.22, 1, 0.36, 1] })
      }
      lastScrollY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [headerY])

  const pages = feed.data?.pages ?? []
  const isEmpty = feed.status === 'success' && pages.every((p) => p.length === 0)

  return (
    // pt-14 pushes content below the fixed (h-14) navbar so the first
    // post doesn't slide under it.
    <div className="min-h-full relative pt-14">
      {/* Fixed top app bar — pinned to viewport regardless of scroll.
          lg:left-64 clears the desktop sidebar (w-64). */}
      <motion.header
        style={{ y: headerY }}
        className="fixed top-0 left-0 right-0 lg:left-64 z-20 glass border-b border-white/5"
      >
        <div className="max-w-xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
          {/* Brand lives in the sidebar on desktop; show it in the navbar
              only on mobile where there is no sidebar. */}
          <Link to="/feed" className="flex items-center gap-2 lg:hidden">
            <img src="/logo.png" alt="" className="h-7 w-auto" />
            <span className="font-extrabold tracking-tight text-gradient-warm text-lg">
              Meet
            </span>
          </Link>
          <div className="hidden lg:block" />{/* spacer so right-aligned icons stay anchored */}
          <div className="flex items-center gap-1">
            <Link
              to="/search"
              className="w-10 h-10 grid place-items-center text-ink-2 hover:text-rose transition-colors"
              aria-label="Search"
            >
              <span className="text-xl">⌕</span>
            </Link>
            <Link
              to="/notifications"
              className="relative w-10 h-10 grid place-items-center text-ink-2 hover:text-rose transition-colors"
              aria-label="Notifications"
            >
              <span className="text-xl">🔔</span>
              {unread > 0 && (
                <span className="absolute top-1 right-1 min-w-[1.05rem] h-[1.05rem] px-1 rounded-full bg-rose text-white text-[10px] font-bold grid place-items-center">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
          </div>
        </div>
      </motion.header>

      {feed.status === 'pending' && (
        <div className="max-w-xl mx-auto px-5 sm:px-8 pt-5 space-y-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="glass rounded-3xl h-[420px] animate-pulse" />
          ))}
        </div>
      )}

      {feed.status === 'error' && (
        <div className="max-w-xl mx-auto px-5 sm:px-8 pt-5">
          <div className="glass rounded-2xl p-5 text-sm text-danger">
            Couldn't load the feed: {(feed.error as Error).message}
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="max-w-xl mx-auto px-5 sm:px-8 pt-5">
          <div className="glass rounded-3xl p-8 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-ink font-semibold mb-1">Nothing here yet</p>
            <p className="text-sm text-ink-muted">Tap the + tab to share your first post.</p>
          </div>
        </div>
      )}

      <motion.div
        className="max-w-xl mx-auto px-5 sm:px-8 pt-5 pb-28 space-y-5"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        {pages.map((page, i) => (
          <Fragment key={i}>
            {page.map((post) => (
              <motion.div key={post.id} variants={itemUp}>
                <PostCard post={post} />
              </motion.div>
            ))}
          </Fragment>
        ))}
      </motion.div>

      {feed.hasNextPage && (
        <div className="max-w-xl mx-auto px-5 sm:px-8 pb-10">
          <button
            onClick={() => feed.fetchNextPage()}
            disabled={feed.isFetchingNextPage}
            className="w-full glass rounded-full py-3 text-sm font-semibold text-ink-2 hover:text-rose transition-colors disabled:opacity-60"
          >
            {feed.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

function PostCard({ post }: { post: FeedPost }) {
  const myId = useAuth((s) => s.session?.user.id ?? null)
  const toggleLike = useToggleLike()
  const [popKey, setPopKey] = useState(0)
  const [giftOpen, setGiftOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const moreBtnRef = useRef<HTMLButtonElement>(null)

  const isMine = myId === post.author_id

  function onLike() {
    toggleLike.mutate({ postId: post.id, nextLiked: !post.liked_by_me })
    if (!post.liked_by_me) setPopKey((k) => k + 1)
  }

  return (
    <article className="glass rounded-3xl overflow-hidden">
      {/* Header — avatar/name link to that user's profile */}
      <header className="flex items-center justify-between px-4 pt-4">
        <Link
          to={`/profile/${post.author_id}`}
          className="flex items-center gap-3 min-w-0 active:opacity-70 transition-opacity"
        >
          <img
            src={avatarUrlOr(post.author_avatar_url, post.author_gender)}
            alt=""
            className="w-12 h-12 rounded-full object-cover shrink-0"
          />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-bold text-ink truncate flex items-center gap-1">
              @{post.author_handle ?? post.author_display_name ?? 'unknown'}
              {post.author_is_verified && <VerifiedBadge />}
            </span>
            <span className="text-[11px] text-ink-muted">{timeAgo(post.created_at)}</span>
          </div>
        </Link>
        <div className="shrink-0">
          <button
            ref={moreBtnRef}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="text-ink-muted hover:text-ink leading-none p-2 -mr-1 rounded-full hover:bg-white/[0.06] transition-colors"
          >
            <IconMore />
          </button>
          {menuOpen && (
            <PostMoreDropdown
              post={post}
              isMine={isMine}
              anchorRef={moreBtnRef}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </header>

      {/* Caption + media — single tap surface that opens the post detail */}
      <Link to={`/p/${post.id}`} className="block">
        {post.caption && (
          <p className="px-4 pt-2 pb-3 text-ink text-sm leading-relaxed">{post.caption}</p>
        )}

        <div
          className="mx-4 mt-1 mb-4 rounded-2xl overflow-hidden"
          style={{ aspectRatio: String(post.media_aspect ?? 0.8) }}
        >
          {post.kind === 'image' ? (
            <img src={post.media_url} alt={post.alt_text ?? ''} className="w-full h-full object-cover" />
          ) : (
            <video
              src={post.media_url}
            className="w-full h-full object-cover"
            playsInline
            muted
            loop
            controls
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
          />
        )}
        </div>
      </Link>

      {/* Actions row — mirrors mobile: pink-bg pill when liked, gift hidden for own post */}
      <footer className="flex items-center justify-around border-t border-white/8 py-2.5 px-2">
        <motion.button
          onClick={onLike}
          whileTap={{ scale: 0.9 }}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
            post.liked_by_me
              ? 'bg-rose/15 text-rose'
              : 'text-ink-muted hover:text-rose',
          ].join(' ')}
        >
          <motion.span
            key={popKey}
            initial={popKey ? { scale: 1.5 } : false}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 16 }}
            className="text-base leading-none"
          >
            {post.liked_by_me ? '❤' : '♡'}
          </motion.span>
          {!post.hide_like_count && <span>{formatCount(post.like_count)}</span>}
        </motion.button>

        {!post.comments_disabled && (
          <Link
            to={`/p/${post.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-ink-muted hover:text-magenta transition-colors"
          >
            <IconComment />
            <span>{formatCount(post.comment_count)}</span>
          </Link>
        )}

        <button
          onClick={() => shareToTelegram(post)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-ink-muted hover:text-coral transition-colors"
        >
          <IconShare />
          <span className="hidden sm:inline">Share</span>
        </button>

        {!isMine && (
          <button
            onClick={() => setGiftOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-ink-muted hover:text-gold transition-colors"
          >
            <span className="text-base leading-none">🎁</span>
            <span className="hidden sm:inline">
              Gift{post.gift_count > 0 ? ` ${formatCount(post.gift_count)}` : ''}
            </span>
          </button>
        )}
      </footer>

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
    </article>
  )
}

/** Small cyan ✓ badge, matching the mobile MaterialIcons "verified" tint. */
function VerifiedBadge() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="15"
      height="15"
      aria-label="Verified"
      className="text-gold shrink-0"
    >
      <path
        fill="currentColor"
        d="M10 1.2l2 1.6 2.5-.3.7 2.4 2.3 1-.4 2.5 1.4 2.1-1.6 2 .3 2.5-2.4.7-1 2.3-2.5-.4-2.1 1.4-2-1.6-2.5.3-.7-2.4-2.3-1 .4-2.5L.6 9.4 2.2 7.4 2 5l2.4-.7 1-2.3 2.5.4z"
      />
      <path
        fill="#070A16"
        d="M8.5 12.2l-2-2 1.1-1.1 1 1 3.2-3.3 1.1 1.1z"
      />
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
