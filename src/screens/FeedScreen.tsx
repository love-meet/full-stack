import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import TopIcons from '../shell/TopIcons'
import { usePeopleFeed, useAdvanceFeed, ageFrom, type FeedPerson } from '../hooks/usePeopleFeed'
import { useRecordGalleryDecision } from '../hooks/useGalleryFeed'
import GiftSheet from '../components/GiftSheet'
import {
  HeartIcon, CloseIcon, GiftIcon,
  MutedIcon, SoundIcon,
} from '../components/FeedIcons'
import { isVideoUrl } from '../lib/media'
import { avatarUrlOr } from '../lib/avatar'
import { languageName } from '../data/languages'

/**
 * The feed is people (§5).
 *
 * Profile pictures only — one per screen, tap to open that person's gallery.
 * Eligibility and ordering both live in the `people_feed` RPC: it pairs on
 * profiles.interested_in (defaulted to the opposite gender), ordered by a
 * hash of (profile_id, viewer_seed) so it differs per viewer and is stable.
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

        {people.map((person) => (
          <PersonCard
            key={person.id}
            person={person}
            onSeen={markSeen}
            onOpenGallery={() => setGallery(person)}
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
  person, onSeen, onOpenGallery,
}: {
  person: FeedPerson
  onSeen: (id: string) => void
  onOpenGallery: () => void
}) {
  const ref = useRef<HTMLElement>(null)
  const decide = useRecordGalleryDecision()
  const [sheet, setSheet] = useState<null | 'gift'>(null)
  const [muted, setMuted] = useState(true)
  const media = avatarUrlOr(person.avatar_url, person.gender)

  // §04 allows exactly three answers to a profile, and each one is final for
  // this viewer: the card leaves the feed either way and never comes back.
  // `answered` is the local half of that — the server already filters the
  // next page, but the card in front of the user has to react now.
  const [answered, setAnswered] = useState<null | 'interested' | 'passed'>(null)

  function decideOn(decision: 'interested' | 'passed') {
    if (answered || decide.isPending) return
    setAnswered(decision)
    decide.mutate({ targetId: person.id, decision }, {
      onError: () => setAnswered(null),
    })
  }

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

  return (
    <>
      <section ref={ref} className="relative h-full w-full snap-start snap-always bg-black overflow-hidden">
        <div className="relative h-full w-full max-w-md mx-auto">
          <button
            onClick={onOpenGallery}
            className="absolute inset-0 w-full h-full"
            aria-label={`Open ${name}'s gallery`}
          >
            <Media src={media} play muted={muted} />
          </button>

          {/* Sound toggle, only when there is sound to toggle. Video always
              starts muted — autoplay with sound is blocked by every browser,
              and a feed that shouts when you open it is worse anyway. */}
          {isVideoUrl(media) && (
            <button
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="absolute top-20 right-4 z-10 w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm text-white grid place-items-center"
            >
              {muted ? <MutedIcon className="w-5 h-5" /> : <SoundIcon className="w-5 h-5" />}
            </button>
          )}

          {/* Scrim so the name stays legible over any picture. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/80 to-transparent" />

          {extra > 0 && (
            <span className="pointer-events-none absolute top-20 left-4 rounded-full px-2.5 py-1 bg-black/45 text-white text-[11px] font-bold">
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
              {place && <Chip>{place}</Chip>}
              {lang && <Chip>{lang}</Chip>}
            </div>

            {/* §04: three things you can do to a profile, and then the next
                person. Laid out across the bottom rather than up the side —
                a side rail is for a feed you keep scrolling past, and these
                are decisions that end the card.

                Reject is deliberately the quiet one. It is permanent and the
                other person is never told, so it should not look like the
                obvious tap, but it must not hide either: burying it is what
                makes people answer Interested just to move on. */}
            <div className="mt-4 flex items-center gap-2.5">
              <button
                onClick={() => decideOn('passed')}
                disabled={!!answered}
                aria-label={`Reject ${name}`}
                className="w-14 h-14 shrink-0 rounded-full grid place-items-center bg-white/10 backdrop-blur-sm text-white/80 ring-1 ring-white/20 active:scale-90 transition-transform disabled:opacity-40"
              >
                <CloseIcon className="w-6 h-6" />
              </button>

              <button
                onClick={() => decideOn('interested')}
                disabled={!!answered}
                className="flex-1 h-14 rounded-full bg-gradient-brand text-white font-extrabold glow-rose active:scale-[0.97] transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <HeartIcon filled className="w-5 h-5" />
                {answered === 'interested' ? 'Interested' : 'Interested'}
              </button>

              <button
                onClick={() => setSheet('gift')}
                aria-label={`Send ${name} a gift`}
                className="w-14 h-14 shrink-0 rounded-full grid place-items-center bg-white/10 backdrop-blur-sm text-white ring-1 ring-white/20 active:scale-90 transition-transform"
              >
                <GiftIcon className="w-6 h-6" />
              </button>
            </div>

            {answered === 'interested' && (
              <p className="mt-2 text-center text-xs text-white/85 drop-shadow">
                You're on each other's friends list. Say hello.
              </p>
            )}
          </div>
        </div>
      </section>

      {sheet === 'gift' && (
        <GiftSheet
          recipientId={person.id}
          recipientLabel={person.handle ?? name}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}

/**
 * A picture or a video, whichever the URL actually is.
 *
 * Galleries hold both — `gallery_urls` is just text — but every surface was
 * rendering an `<img>`, so a video showed as the browser's broken-image box
 * or, worse, a frozen first frame that looked like a photo that would not
 * move.
 *
 * Autoplay only works muted and only while the element is on screen, so the
 * play is driven by an IntersectionObserver rather than the `autoplay`
 * attribute: a feed of twenty videos all decoding at once stalls the scroll.
 */
function Media({
  src, fit = 'cover', play = false, controls = false, muted = true,
}: {
  src: string
  fit?: 'cover' | 'contain'
  play?: boolean
  controls?: boolean
  muted?: boolean
}) {
  const vid = useRef<HTMLVideoElement>(null)
  const isVideo = isVideoUrl(src)

  useEffect(() => {
    const el = vid.current
    if (!el || !play) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.6) void el.play().catch(() => {})
        else el.pause()
      },
      { threshold: [0, 0.6, 1] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [play, src])

  // Written out rather than interpolated — Tailwind scans source text, so a
  // composed `object-${fit}` would never make it into the stylesheet.
  const cls = fit === 'contain' ? 'w-full h-full object-contain' : 'w-full h-full object-cover'
  if (!isVideo) return <img src={src} alt="" className={cls} />
  return (
    <video
      ref={vid}
      src={src}
      className={cls}
      muted={muted}
      loop
      playsInline
      preload="metadata"
      controls={controls}
    />
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full px-2.5 py-1 bg-white/15 backdrop-blur-sm text-white text-[11px] font-semibold">
      {children}
    </span>
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

      {/* Back, not a bare ✕ in a corner.
          Inside the Telegram Mini-App this overlay covers the whole viewport,
          so the only obvious way out was Telegram's own "Close" — which quits
          the app entirely. This sits below Telegram's header (lm-top-inset),
          is labelled, and is big enough to hit with a thumb. */}
      <button
        onClick={onClose}
        aria-label="Back to the feed"
        className="absolute left-3 z-20 flex items-center gap-1.5 rounded-full pl-2.5 pr-4 py-2 bg-black/60 backdrop-blur-sm text-white text-sm font-bold"
        style={{ top: 'calc(var(--lm-top-inset) + 0.75rem)' }}
      >
        <span className="text-lg leading-none">←</span> Back
      </button>

      <Media src={photos[index]} fit="contain" play controls />

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
