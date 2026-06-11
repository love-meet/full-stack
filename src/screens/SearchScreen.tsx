import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useFeed, type FeedPost } from '../hooks/useFeed'
import { useSearchProfiles, type SearchableProfile } from '../hooks/useSearchProfiles'
import { avatarUrlOr } from '../lib/avatar'
import PresenceDot from '../components/PresenceDot'
import { IconPlay, IconVideo } from '../components/icons'

/**
 * Search — ported from the archived mobile SearchScreen:
 *   • Empty query  → a shuffled grid of posts with media (explore).
 *   • Typing       → a debounced list of matching users (handle/name/bio).
 * Tap a post → post detail; tap a user → their profile.
 */
export default function SearchScreen() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')

  // 300ms debounce, matching the mobile app.
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(text.trim()), 300)
    return () => window.clearTimeout(t)
  }, [text])

  const searching = debounced.length > 0

  return (
    <div className="min-h-screen text-ink pb-24">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center gap-2">
          <button onClick={() => navigate(-1)} aria-label="Back" className="text-ink-2 hover:text-ink text-2xl leading-none px-1">←</button>
          <div className="flex-1 glass rounded-full px-4 py-2 flex items-center gap-2.5 focus-within:ring-brand transition-shadow">
            <span className="text-ink-muted text-lg">⌕</span>
            <input
              type="search"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink-muted"
            />
            {text && (
              <button onClick={() => setText('')} aria-label="Clear" className="text-ink-muted hover:text-ink">✕</button>
            )}
          </div>
        </div>
      </header>

      {searching ? <UserResults q={debounced} /> : <ExploreGrid />}
    </div>
  )
}

// ---------- Users list (while typing) ----------

function UserResults({ q }: { q: string }) {
  const results = useSearchProfiles({ q })
  const users = results.data?.pages.flat() ?? []

  if (results.status === 'pending') {
    return (
      <div className="flex justify-center py-10">
        <div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    )
  }

  if (users.length === 0) {
    return <p className="text-center text-ink-muted text-sm py-10">No users found.</p>
  }

  return (
    <ul className="max-w-2xl mx-auto">
      {users.map((u) => (
        <li key={u.id}>
          <UserRow u={u} />
        </li>
      ))}

      {results.hasNextPage && (
        <li className="px-4 py-3">
          <button
            onClick={() => results.fetchNextPage()}
            disabled={results.isFetchingNextPage}
            className="w-full glass rounded-full py-2.5 text-sm text-ink-2 hover:text-ink font-semibold"
          >
            {results.isFetchingNextPage ? 'Loading…' : 'Show more'}
          </button>
        </li>
      )}
    </ul>
  )
}

function UserRow({ u }: { u: SearchableProfile }) {
  return (
    <Link
      to={`/profile/${u.id}`}
      className="flex items-center gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/[0.04] transition-colors"
    >
      <span className="relative shrink-0">
        <img
          src={avatarUrlOr(u.avatar_url, u.gender)}
          alt=""
          className="w-12 h-12 rounded-full object-cover"
        />
        <PresenceDot userId={u.id} size="md" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm font-bold text-ink truncate">
            @{u.handle ?? u.display_name ?? 'unknown'}
          </span>
          {u.is_verified && (
            <span className="shrink-0 w-4 h-4 rounded-full bg-gold grid place-items-center text-[9px] text-surface font-bold">✓</span>
          )}
        </div>
        <div className="text-[12px] text-ink-muted truncate">
          {u.display_name ?? ([u.city, u.country_name].filter(Boolean).join(', ') || ' ')}
        </div>
      </div>
    </Link>
  )
}

// ---------- Explore grid (empty query) ----------

function ExploreGrid() {
  const feed = useFeed()
  const posts = feed.data?.pages.flat() ?? []

  // Posts with media, shuffled once per load (mirrors the mobile app).
  const shuffled = useMemo(() => {
    const withMedia = posts.filter((p) => !!p.media_url)
    for (let i = withMedia.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[withMedia[i], withMedia[j]] = [withMedia[j], withMedia[i]]
    }
    return withMedia
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length])

  if (feed.status === 'pending') {
    return (
      <div className="grid grid-cols-3 gap-px bg-white/5">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="aspect-square bg-surface-2 animate-pulse" />
        ))}
      </div>
    )
  }

  if (shuffled.length === 0) {
    return <p className="text-center text-ink-muted text-sm py-10">Nothing to explore yet.</p>
  }

  return (
    <>
      <motion.div
        className="grid grid-cols-3 gap-px bg-white/5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {shuffled.map((p) => (
          <GridTile key={p.id} p={p} />
        ))}
      </motion.div>

      {feed.hasNextPage && (
        <div className="px-5 py-5">
          <button
            onClick={() => feed.fetchNextPage()}
            disabled={feed.isFetchingNextPage}
            className="w-full glass rounded-full py-3 text-sm text-ink-2 hover:text-ink font-semibold"
          >
            {feed.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </>
  )
}

function GridTile({ p }: { p: FeedPost }) {
  const isVideo = p.kind !== 'image'
  return (
    <Link to={`/p/${p.id}`} className="relative aspect-square bg-surface overflow-hidden">
      {isVideo ? (
        <video src={p.media_url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
      ) : (
        <img src={p.media_url} alt="" className="w-full h-full object-cover" />
      )}
      {isVideo && (
        <>
          <span className="absolute top-1.5 right-1.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
            <IconVideo size={16} strokeWidth={2.4} />
          </span>
          <span className="absolute inset-0 grid place-items-center pointer-events-none">
            <span className="w-8 h-8 rounded-full bg-black/45 grid place-items-center text-white">
              <IconPlay size={16} />
            </span>
          </span>
        </>
      )}
    </Link>
  )
}
