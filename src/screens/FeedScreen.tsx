import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import TopIcons from '../shell/TopIcons'
import FeedAd from '../components/FeedAd'
import { usePeopleFeed, useAdvanceFeed, ageFrom, type FeedPerson } from '../hooks/usePeopleFeed'
import { useStartDM } from '../hooks/useStartDM'
import { avatarUrlOr } from '../lib/avatar'
import { languageName } from '../data/languages'

/**
 * The feed is people (§5).
 *
 * Profile pictures only — one per screen, tap to open that person's gallery.
 * Eligibility and ordering both live in the `people_feed` RPC: men see women,
 * women see men, ordered by a hash of (profile_id, viewer_seed) so the order
 * is different for everyone and stable across sessions.
 *
 * This screen owns one thing the server can't see: which cards were actually
 * *consumed*. A card counts as consumed once it has been on screen, and the
 * running total is flushed to `advance_feed_position` so the next session
 * starts where this one stopped rather than replaying the same first profile.
 */
export default function FeedScreen() {
  const feed = usePeopleFeed()
  const advance = useAdvanceFeed()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [gallery, setGallery] = useState<FeedPerson | null>(null)

  const people = feed.data ?? []
  const isEmpty = feed.status === 'success' && people.length === 0

  // ── Consumption tracking ────────────────────────────────────────────────
  // `seen` is a set so a card scrolled past twice only counts once; `pending`
  // is what hasn't been flushed to the server yet. Both are refs: they change
  // on every scroll and none of it belongs in render.
  const seen = useRef<Set<string>>(new Set())
  const pending = useRef(0)
  const flushTimer = useRef<number | null>(null)

  const flush = useCallback(() => {
    const n = pending.current
    if (n <= 0) return
    pending.current = 0
    advance.mutate(n)
  }, [advance])

  const markSeen = useCallback((id: string) => {
    if (seen.current.has(id)) return
    seen.current.add(id)
    pending.current += 1
    if (flushTimer.current) window.clearTimeout(flushTimer.current)
    // Batch a fast scroll into one round-trip.
    flushTimer.current = window.setTimeout(flush, 1200)
  }, [flush])

  // A fresh page means a fresh cursor — forget what was seen under the old one.
  useEffect(() => {
    seen.current = new Set()
  }, [feed.dataUpdatedAt])

  // Leaving the screen (or the tab) must not lose the cursor.
  const flushRef = useRef(flush)
  useEffect(() => { flushRef.current = flush }, [flush])
  useEffect(() => {
    function onHide() { if (document.visibilityState === 'hidden') flushRef.current() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', () => flushRef.current())
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      if (flushTimer.current) window.clearTimeout(flushTimer.current)
      flushRef.current()
    }
  }, [])

  return (
    <>
      {/* Floating top bar — transparent over the picture, icons stay tappable. */}
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

      <div
        ref={scrollerRef}
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
              <div className="text-5xl mb-3">👋</div>
              <p className="text-white font-semibold mb-1">Nobody here yet</p>
              <p className="text-sm text-white/60">
                Check back soon, or find someone in{' '}
                <Link to="/search" className="text-rose font-semibold hover:underline">Search</Link>.
              </p>
            </div>
          </div>
        )}

        {people.map((person, i) => (
          <PersonCard
            key={person.id}
            person={person}
            onSeen={markSeen}
            onOpenGallery={() => setGallery(person)}
            // A sponsored card roughly every eighth profile (§7). Always on,
            // for everyone — it is not a reward and unlocks nothing.
            showAdAfter={(i + 1) % 8 === 0}
          />
        ))}
      </div>

      <AnimatePresence>
        {gallery && <GalleryOverlay person={gallery} onClose={() => setGallery(null)} />}
      </AnimatePresence>
    </>
  )
}

// ---------------------------------------------------------------------------
// One person, one screen. The picture is the card.
// ---------------------------------------------------------------------------
function PersonCard({
  person, onSeen, onOpenGallery, showAdAfter,
}: {
  person: FeedPerson
  onSeen: (id: string) => void
  onOpenGallery: () => void
  showAdAfter: boolean
}) {
  const ref = useRef<HTMLElement>(null)
  const navigate = useNavigate()
  const startDM = useStartDM()

  // Consumed once it has actually been on screen — not merely rendered, or
  // the whole page would count as seen the moment it loads.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.intersectionRatio >= 0.6) onSeen(person.id) },
      { threshold: [0, 0.6, 1] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [person.id, onSeen])

  const age = ageFrom(person.dob)
  const name = person.display_name ?? person.handle ?? 'Someone'
  const place = [person.city, person.country_name].filter(Boolean).join(', ')
  const lang = languageName(person.language)
  const extra = person.gallery_urls.length

  async function message() {
    try {
      const id = await startDM.mutateAsync(person.id)
      navigate(`/chat/${id}`)
    } catch {
      // The chat screen surfaces a real error; a failed tap shouldn't
      // interrupt browsing.
    }
  }

  return (
    <>
      <section ref={ref} className="relative h-full w-full snap-start snap-always bg-black overflow-hidden">
        <div className="relative h-full w-full max-w-md mx-auto">
          <button
            onClick={onOpenGallery}
            className="absolute inset-0 w-full h-full"
            aria-label={`Open ${name}'s gallery`}
          >
            <img
              src={avatarUrlOr(person.avatar_url, person.gender)}
              alt=""
              className="w-full h-full object-cover"
            />
          </button>

          {/* Scrim so the name stays legible over any picture. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/80 to-transparent" />

          {extra > 0 && (
            <span className="pointer-events-none absolute top-20 right-4 rounded-full px-2.5 py-1 bg-black/45 text-white text-[11px] font-bold">
              1 / {extra + 1}
            </span>
          )}

          <div className="absolute left-0 right-0 bottom-0 p-5 pb-6">
            <Link to={`/profile/${person.id}`} className="block active:opacity-70">
              <h2 className="text-white text-2xl font-extrabold drop-shadow flex items-baseline gap-2">
                <span className="truncate">{name}</span>
                {age != null && <span className="text-xl font-bold text-white/80">{age}</span>}
              </h2>
              {person.handle && (
                <p className="text-sm text-white/70 drop-shadow">@{person.handle}</p>
              )}
            </Link>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {place && <Chip>📍 {place}</Chip>}
              {lang && <Chip>💬 {lang}</Chip>}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={message}
                disabled={startDM.isPending}
                className="flex-1 rounded-full py-3 bg-gradient-brand text-white font-extrabold text-sm glow-rose active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {startDM.isPending ? 'Opening…' : 'Message'}
              </button>
              <button
                onClick={onOpenGallery}
                className="rounded-full px-5 py-3 glass text-white font-bold text-sm"
              >
                Photos
              </button>
            </div>
          </div>
        </div>
      </section>

      {showAdAfter && <AdCard />}
    </>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full px-2.5 py-1 bg-white/15 backdrop-blur-sm text-white text-[11px] font-semibold">
      {children}
    </span>
  )
}

/** A sponsored slide — same footprint as a profile, clearly labelled. */
function AdCard() {
  return (
    <section className="relative h-full w-full snap-start snap-always bg-black grid place-items-center px-5">
      <div className="w-full max-w-md mx-auto glass rounded-3xl px-5 pt-4 pb-5 flex flex-col items-center gap-4">
        <span className="self-start text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
          Sponsored
        </span>
        <div className="grid place-items-center min-h-[250px] w-full">
          <FeedAd />
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Tap a picture → that person's gallery. Avatar first, then their photos.
// ---------------------------------------------------------------------------
function GalleryOverlay({ person, onClose }: { person: FeedPerson; onClose: () => void }) {
  const photos = [person.avatar_url, ...person.gallery_urls].filter(Boolean) as string[]
  const [index, setIndex] = useState(0)
  const name = person.display_name ?? person.handle ?? 'Someone'

  const go = useCallback((delta: number) => {
    setIndex((i) => Math.min(photos.length - 1, Math.max(0, i + delta)))
  }, [photos.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, go])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
      role="dialog"
      aria-label={`${name}'s photos`}
    >
      {/* Progress pips — one per photo, like a story. */}
      <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 px-3 pt-3" style={{ paddingTop: 'calc(var(--lm-top-inset) + 0.75rem)' }}>
        {photos.map((p, i) => (
          <span
            key={p}
            className={['h-0.5 flex-1 rounded-full', i <= index ? 'bg-white' : 'bg-white/30'].join(' ')}
          />
        ))}
      </div>

      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-14 right-4 z-20 w-9 h-9 rounded-full bg-black/50 text-white grid place-items-center text-lg"
      >
        ✕
      </button>

      <img src={photos[index]} alt="" className="w-full h-full object-contain" />

      {/* Tap left third to go back, right two-thirds to go forward. */}
      <button onClick={() => go(-1)} aria-label="Previous photo" className="absolute inset-y-0 left-0 w-1/3" />
      <button
        onClick={() => (index === photos.length - 1 ? onClose() : go(1))}
        aria-label="Next photo"
        className="absolute inset-y-0 right-0 w-2/3"
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 pb-8 bg-gradient-to-t from-black/80 to-transparent">
        <Link to={`/profile/${person.id}`} className="pointer-events-auto text-white font-extrabold text-xl drop-shadow">
          {name}
        </Link>
        {person.handle && <p className="text-sm text-white/70">@{person.handle}</p>}
      </div>
    </motion.div>
  )
}
