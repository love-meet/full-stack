import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import TopIcons from '../shell/TopIcons'
import FeedAd from '../components/FeedAd'
import { useAdsVisible } from '../hooks/useAds'
import { usePeopleFeed, useAdvanceFeed, ageFrom, type FeedPerson } from '../hooks/usePeopleFeed'
import { useStartDM, isDailyChatLimit } from '../hooks/useStartDM'
import { useRecordGalleryDecision } from '../hooks/useGalleryFeed'
import {
  useProfileActionState,
  useToggleProfileBookmark,
  type ProfileActionState,
} from '../hooks/useProfileActions'
import GiftSheet from '../components/GiftSheet'
import { useToggleFollow } from '../hooks/useFollow'
import {
  HeartIcon, BookmarkIcon, ShareIcon, GiftIcon,
  MutedIcon, SoundIcon,
} from '../components/FeedIcons'
import { isVideoUrl, compactCount } from '../lib/media'
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
const AD_EVERY = 10

export default function FeedScreen() {
  const feed = usePeopleFeed()
  const advance = useAdvanceFeed()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [gallery, setGallery] = useState<FeedPerson | null>(null)

  const people = feed.data ?? []
  const isEmpty = feed.status === 'success' && people.length === 0

  // Counts and my-state for every card on the page, in one request rather
  // than one per card.
  const actions = useProfileActionState(people.map((p) => p.id))

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
            state={actions.data?.[person.id]}
            onSeen={markSeen}
            onOpenGallery={() => setGallery(person)}
            // A sponsored card every tenth profile (§7). Always on, for
            // everyone — not a reward, unlocks nothing. Tenth rather than
            // eighth because the feed is faces: an ad among them intrudes
            // more than one among posts did.
            showAdAfter={(i + 1) % AD_EVERY === 0}
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
  person, state, onSeen, onOpenGallery, showAdAfter,
}: {
  person: FeedPerson
  state?: ProfileActionState
  onSeen: (id: string) => void
  onOpenGallery: () => void
  showAdAfter: boolean
}) {
  // Both levels must allow it (§7/§2): the build must be configured for a
  // provider AND the database switch must be on. Checked here, not inside
  // AdCard, so that when ads are not visible the wrapping "Sponsored" card
  // is never emitted at all — no blank full-screen slide in a snap-scroll
  // feed (the bug the previous implementation had).
  const adsVisible = useAdsVisible()
  const ref = useRef<HTMLElement>(null)
  const navigate = useNavigate()
  const startDM = useStartDM()
  const [chatError, setChatError] = useState<string | null>(null)
  const decide = useRecordGalleryDecision()
  const bookmark = useToggleProfileBookmark()
  const follow = useToggleFollow(person.id)
  const [sheet, setSheet] = useState<null | 'gift'>(null)
  const [muted, setMuted] = useState(true)
  const media = avatarUrlOr(person.avatar_url, person.gender)

  // Optimistic overrides — null means "whatever the server last said". The
  // rail has to answer a tap instantly; the counts catch up on the next fetch.
  const [likedNow, setLikedNow] = useState<boolean | null>(null)
  const [savedNow, setSavedNow] = useState<boolean | null>(null)
  const [followedNow, setFollowedNow] = useState<boolean | null>(null)

  const liked = likedNow ?? state?.liked_by_me ?? false
  const saved = savedNow ?? state?.saved_by_me ?? false
  const following = followedNow ?? state?.followed_by_me ?? false
  const likeCount = (state?.like_count ?? 0) + (likedNow && !state?.liked_by_me ? 1 : 0)

  // "Like" is the gallery-interest decision — it puts them in your Interested
  // tab and creates a match if they have liked you too. Deliberately not a
  // second, parallel like signal.
  function like() {
    if (liked || decide.isPending) return
    setLikedNow(true)
    decide.mutate({ targetId: person.id, decision: 'interested' }, {
      onError: () => setLikedNow(null),
    })
  }

  // Follow is one-way and additive from here: the + vanishes and stays gone.
  // Following back is what makes the two of you friends (0107).
  function followThem() {
    if (following) return
    setFollowedNow(true)
    follow.mutate(true, { onError: () => setFollowedNow(null) })
  }

  function save() {
    const next = !saved
    setSavedNow(next)
    bookmark.mutate(person.id, {
      onSuccess: (v) => setSavedNow(v),
      onError: () => setSavedNow(null),
    })
  }

  async function share() {
    const url = `${window.location.origin}/profile/${person.id}`
    const text = `${name} on Love meet`
    try {
      if (navigator.share) { await navigator.share({ url, text }); return }
      await navigator.clipboard.writeText(url)
      setChatError('Link copied')
      window.setTimeout(() => setChatError(null), 1500)
    } catch { /* user dismissed the share sheet — nothing to report */ }
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

  async function message() {
    setChatError(null)
    try {
      const id = await startDM.mutateAsync(person.id)
      navigate(`/chat/${id}`)
    } catch (e) {
      // Out of new chats for today is a real answer, not a failure — say so
      // rather than letting the button appear broken.
      setChatError(
        isDailyChatLimit(e)
          ? "That's 20 new chats today — the limit resets tomorrow. You can still reply to anyone."
          : null,
      )
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

          {/* Action rail — beside the card, the way TikTok and Instagram place
              them: outlined icon, count underneath, nothing else. Every one of
              these targets the person; comments, saves and gifts used to need
              a post, and 0106 gave profiles their own. Like is the
              gallery-interest decision, so it feeds Interested and can match. */}
          <div className="absolute right-2.5 bottom-32 flex flex-col items-center gap-4 z-10">
            {/* Their face at the top of the rail with the follow badge hung
                off it — the same anchor TikTok puts above the heart. The badge
                disappears once you follow, rather than becoming an "unfollow"
                button: it would be the easiest thing on the card to hit by
                accident. Unfollow lives on their profile. */}
            <div className="relative mb-2">
              <Link to={`/profile/${person.id}`} aria-label={`${name}'s profile`}>
                <img
                  src={avatarUrlOr(person.avatar_url, person.gender)}
                  alt=""
                  className="w-11 h-11 rounded-full object-cover ring-2 ring-white shadow-lg"
                />
              </Link>
              {!following && (
                <button
                  onClick={followThem}
                  aria-label={`Follow ${name}`}
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-gradient-brand text-white text-sm font-bold grid place-items-center ring-2 ring-black/20 transition-transform duration-75 active:scale-75"
                >
                  +
                </button>
              )}
            </div>

            <RailButton
              icon={<HeartIcon filled={liked} className="w-9 h-9" />}
              count={likeCount}
              label={liked ? 'Liked' : 'Like'}
              active={liked}
              onClick={like}
              // Deliberately NOT disabled while the mutation is in flight.
              // The heart already filled optimistically, so grey-ing it out
              // for the round-trip reads as the tap having failed. `like()`
              // guards against a double-send on its own.
            />
            <RailButton
              icon={<GiftIcon filled={state?.gifted_by_me} className="w-8 h-8" />}
              count={state?.gift_count}
              label="Send a gift"
              active={state?.gifted_by_me}
              onClick={() => setSheet('gift')}
            />
            <RailButton
              icon={<BookmarkIcon filled={saved} className="w-8 h-8" />}
              label={saved ? 'Saved' : 'Save'}
              active={saved}
              onClick={save}
            />
            {/* No Photos button: tapping the picture already opens the
                gallery, so a second control for it was the same action twice.
                The "1 / N" badge at the top-left says there is more to see. */}
            <RailButton
              icon={<ShareIcon className="w-8 h-8" />}
              label="Share"
              onClick={share}
            />
          </div>

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

            {/* Message stays the one big commitment — it is the action that
                costs a credit. Like / Photos / Share live in the rail beside
                the card, where a thumb reaches them without covering the face. */}
            <button
              onClick={message}
              disabled={startDM.isPending}
              className="mt-4 w-full rounded-full py-3 bg-gradient-brand text-white font-extrabold text-sm glow-rose active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              {startDM.isPending ? 'Opening…' : 'Message'}
            </button>

            {chatError && (
              <p className="mt-2 text-center text-xs text-white/80 drop-shadow">{chatError}</p>
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

      {showAdAfter && adsVisible && <AdCard />}
    </>
  )
}

/**
 * One control in the right-hand rail: a big outlined icon with its count
 * directly underneath, and nothing else.
 *
 * No pill, no capsule, no word label — TikTok and Instagram both dropped
 * those years ago because the icon has to read against a photograph, and a
 * background plate fights the photo instead of sitting on it. A drop shadow
 * does the same job at a fraction of the visual weight. `count` is omitted
 * when it would be zero: "0" on a like button reads as failure.
 */
function RailButton({
  icon, count, label, onClick, active, disabled,
}: {
  icon: React.ReactNode
  count?: number
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      // Fires on pointer-up without waiting for the browser's click
      // synthesis, and without framer-motion's gesture recogniser in between.
      // `whileTap` looked nicer but added a layer that had to settle before
      // the handler ran; a CSS :active transform paints on touch-down instead,
      // so the button acknowledges the finger immediately even while the
      // mutation is still in flight.
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={[
        // A 44px minimum target. The icons are ~34px drawn, so without the
        // padding a thumb misses the edges and the tap lands on the card
        // behind, which opens the gallery instead — reading as "it ignored me".
        'flex flex-col items-center justify-center gap-1 min-w-11 min-h-11 px-1',
        'transition-transform duration-75 active:scale-[0.82] disabled:opacity-60',
        // The shadow is what keeps a white outline legible over a bright
        // photo; without it the icon disappears on pale backgrounds.
        '[filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.55))]',
        active ? 'text-rose' : 'text-white',
      ].join(' ')}
    >
      {icon}
      {count != null && count > 0 && (
        <span className="text-[13px] font-bold tabular-nums leading-none text-white">
          {compactCount(count)}
        </span>
      )}
    </button>
  )
}

/**
 * A picture or a video, whichever the URL actually is.
 *
 * Galleries hold both — `gallery_urls` is just text — but every surface was
 * rendering an `<img>`, so a video showed as the browser's broken-image box or,
 * worse, a frozen first frame that looked like a photo that would not move.
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

/**
 * A sponsored slide — same footprint as a profile, clearly labelled.
 *
 * Only ever mounted when the caller has already confirmed `adsVisible`, so
 * there is no scenario where this renders and `FeedAd` inside comes back
 * empty: the wrapper and the ad appear and disappear together.
 */
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
