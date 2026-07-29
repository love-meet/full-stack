import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGalleryFeed, useRecordGalleryDecision, type GalleryCandidate } from '../hooks/useGalleryFeed'
import OnboardingPrompts from '../components/OnboardingPrompts'
import TopIcons from '../shell/TopIcons'
import { useMySubscription } from '../hooks/usePayments'
import { useLiveGames, type LiveGame } from '../hooks/usePixelGame'
import { avatarFor, avatarUrlOr } from '../lib/avatar'
import { flagEmoji, flagImageUrl } from '../lib/flags'
import PresenceDot from '../components/PresenceDot'
import FeedAd from '../components/FeedAd'

// A sponsored slide follows roughly 1 in 5 cards. The decision is a
// deterministic hash of (card id, session seed) — NOT the card's index —
// so consuming a card (Interested/Pass removes it from the list) never
// reshuffles which of the remaining cards carry an ad. The seed lives at
// module scope: fresh per page load, stable across re-renders, and no
// render-time ref/impure-call for the hooks rules to object to.
const AD_SEED = Math.floor(Math.random() * 1e9)

function adFollowsCard(cardId: string, seed: number): boolean {
  let h = seed >>> 0
  for (let i = 0; i < cardId.length; i++) {
    h = Math.imul(h ^ cardId.charCodeAt(i), 0x01000193)
  }
  return (h >>> 0) % 5 === 0
}

export default function FeedScreen() {
  const { t } = useTranslation()
  const isSubscriber = !!useMySubscription().data
  const showAds = !isSubscriber
  const feed = useGalleryFeed()

  const cards = feed.cards
  const liveGames = useLiveGames().data ?? []
  const isEmpty = feed.status === 'success' && cards.length === 0
  const showError = feed.status === 'error' && cards.length === 0

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

      {/* Full-screen vertical snap feed: one person per screen. Sits above
          the mobile bottom-nav (bottom-16) and clears the desktop sidebar. */}
      <div
        className="fixed top-0 left-0 right-0 bottom-[calc(4rem_+_var(--lm-bottom-inset))] lg:left-64 lg:bottom-0 xl:right-[22rem] bg-black overflow-y-scroll snap-y snap-mandatory overscroll-contain no-scrollbar"
      >
        {feed.status === 'pending' && (
          <div className="h-full grid place-items-center">
            <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        )}

        {showError && (
          <div className="h-full grid place-items-center px-8">
            <div className="glass rounded-2xl p-5 text-center space-y-4">
              <p className="text-sm text-danger">
                {t('feed.loadError', { message: feed.error?.message ?? '' })}
              </p>
              <button
                onClick={feed.retry}
                className="rounded-full px-6 py-2.5 bg-gradient-brand text-white text-sm font-bold glow-rose"
              >
                {t('feed.retry')}
              </button>
            </div>
          </div>
        )}

        {isEmpty && (
          <div className="h-full grid place-items-center px-8">
            <div className="text-center">
              <div className="text-5xl mb-3">📭</div>
              <p className="text-white font-semibold mb-1">{t('feed.emptyTitle')}</p>
              <p className="text-sm text-white/60">{t('feed.emptySubtitle')}</p>
            </div>
          </div>
        )}

        {liveGames.length > 0 && <LiveGamesSlide games={liveGames} />}

        {cards.map((card) => (
          <PersonCardSlide
            key={card.id}
            card={card}
            onDecided={() => feed.consume(card.id)}
            adAfter={showAds && adFollowsCard(card.id, AD_SEED)}
          />
        ))}
      </div>
    </>
  )
}

function PersonCardSlide({
  card, onDecided, adAfter,
}: {
  card: GalleryCandidate
  onDecided: () => void
  adAfter: boolean
}) {
  return (
    <>
      <PersonCard card={card} onDecided={onDecided} />
      {adAfter && <AdSlide />}
    </>
  )
}

// A sponsored slide — same full-screen footprint as a card. Renders nothing
// if no Adsterra key is configured, so the feed just skips it.
function AdSlide() {
  const { t } = useTranslation()
  return (
    <section className="relative h-full w-full snap-start snap-always bg-black grid place-items-center px-5">
      <div className="w-full max-w-3xl mx-auto flex flex-col items-center">
        <div className="glass rounded-3xl px-5 pt-4 pb-5 flex flex-col items-center gap-4 w-full max-w-md sm:max-w-3xl">
          <span className="self-start text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
            {t('feed.sponsored')}
          </span>
          <div className="grid place-items-center min-h-[250px] w-full">
            <FeedAd />
          </div>
        </div>
        <p className="mt-4 text-xs text-white/55 text-center">
          {t('feed.adDisclaimer')}{' '}
          <Link to="/subscription" className="text-rose font-semibold hover:underline">{t('feed.goPremium')}</Link>{' '}
          {t('feed.adDisclaimerEnd')}
        </p>
      </div>
    </section>
  )
}

// All currently-live games in ONE slide, scrollable horizontally so 70 live
// games don't flood the feed as 70 separate slides.
function LiveGamesSlide({ games }: { games: LiveGame[] }) {
  const { t } = useTranslation()
  return (
    <section className="relative h-full w-full snap-start snap-always bg-black grid place-items-center overflow-hidden">
      <div className="w-full max-w-xl mx-auto px-4">
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white bg-rose rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> {t('feed.liveNow', { count: games.length })}
          </span>
        </div>
        <p className="text-center text-xs text-white/60 mb-2">{t('feed.swipeLiveGames')}</p>
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
  const { t } = useTranslation()
  const ps = [...(game.players ?? [])].sort((a, b) => a.joined_at.localeCompare(b.joined_at))
  return (
    <Link
      to={`/play/${game.invite_code}`}
      className="w-[260px] shrink-0 snap-center glass rounded-2xl p-5 text-center block hover:ring-1 hover:ring-gold/40 transition-shadow"
      style={{ background: 'radial-gradient(380px 280px at 50% 0%, rgba(53,205,232,0.20), transparent 60%)' }}
    >
      <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-white bg-rose rounded-full px-2 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> {t('feed.live')}
      </span>
      <div className="mt-3 flex items-center justify-center gap-2">
        <PlayerFace p={ps[0]} />
        <span className="text-base font-extrabold text-gradient-warm shrink-0">VS</span>
        <PlayerFace p={ps[1]} />
      </div>
      <h3 className="mt-3 text-base font-extrabold text-gradient-warm">Pixel Rush</h3>
      <p className="mt-0.5 text-[11px] text-ink-2">
        {game.kind === '1v1' ? t('feed.oneVOne') : t('feed.team')} · {t('feed.round', { current: game.current_round, total: game.rounds_total })}
      </p>
      <span className="mt-3 inline-block rounded-full px-4 py-1.5 bg-gradient-brand text-white text-xs font-bold glow-rose">
        ▶ {t('feed.watch')}
      </span>
    </Link>
  )
}

function PlayerFace({ p }: { p?: LiveGame['players'][number] }) {
  const { t } = useTranslation()
  const label = p?.profile?.handle ?? p?.profile?.display_name ?? t('feed.player')
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
// One full-screen person card — swipe horizontally through their photos,
// Interested/Pass at the bottom.
// ---------------------------------------------------------------------------
function PersonCard({ card, onDecided }: { card: GalleryCandidate; onDecided: () => void }) {
  const { t } = useTranslation()
  const decide = useRecordGalleryDecision()
  const [photoIndex, setPhotoIndex] = useState(0)
  const [deciding, setDeciding] = useState<'interested' | 'passed' | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  // The person's WHOLE gallery, in their own order — one slider per person.
  const photos = useMemo(
    () => card.gallery_urls.filter(Boolean),
    [card.gallery_urls],
  )

  const flag = flagEmoji(card.country_code)
  const flagSrc = flagImageUrl(card.country_code)
  // Prefer a real avatar; fall back to their first GALLERY photo before the
  // generic silhouette. The avatar step in onboarding is optional, and bot
  // personas deliberately have none — but anyone in this feed has gallery
  // photos by definition, so a real face beats a placeholder.
  const avatar = card.avatar_url ? avatarFor(card) : (photos[0] ?? avatarFor(card))
  const name = card.display_name ?? card.handle ?? t('feed.player')

  function onPhotoScroll() {
    const el = scrollerRef.current
    if (!el || el.clientWidth === 0) return
    setPhotoIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  /** Advance the carousel one photo, wrapping at both ends so the gallery
   *  circles rather than dead-ending. Touch users swipe; this gives mouse and
   *  keyboard users a way through the gallery, which they otherwise had no
   *  affordance for at all (wheel-down just moves to the next person). */
  function step(dir: -1 | 1) {
    const el = scrollerRef.current
    if (!el || el.clientWidth === 0) return
    const last = photos.length - 1
    const target = photoIndex + dir < 0 ? last
      : photoIndex + dir > last ? 0
      : photoIndex + dir
    // Snap instantly when wrapping the whole strip — smooth-scrolling across
    // every photo in between reads as a blur, not a loop.
    const wrapping = Math.abs(target - photoIndex) > 1
    el.scrollTo({ left: target * el.clientWidth, behavior: wrapping ? 'auto' : 'smooth' })
  }

  function decideAndClose(decision: 'interested' | 'passed') {
    if (deciding) return
    setDeciding(decision)
    decide.mutate({ targetId: card.id, decision })
    // Give the tap feedback a beat to show before the card disappears.
    setTimeout(onDecided, 180)
  }

  return (
    <section className="relative h-full w-full snap-start snap-always bg-black overflow-hidden">
      <div className="relative h-full w-full max-w-md mx-auto">
        {/* Swipeable photo strip. */}
        <div
          ref={scrollerRef}
          onScroll={onPhotoScroll}
          className="h-full w-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
        >
          {photos.map((url, i) => (
            <img
              key={`${url}-${i}`}
              src={url}
              alt=""
              // cover, not contain: a full-screen gallery card should fill the
              // frame like every other swipe-feed dating app. contain left
              // portrait/transparent images floating in a black letterbox.
              className="h-full w-full shrink-0 snap-center object-cover"
            />
          ))}
        </div>

        {/* Prev/next — the only way through a gallery with a mouse. Sits
            above the photo strip but below the identity/action rows. */}
        {photos.length > 1 && (
          <>
            {/* Both always shown — the gallery loops, so there's never a
                dead end in either direction. */}
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={t('feed.prevPhoto')}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full grid place-items-center bg-black/40 hover:bg-black/60 text-white text-xl backdrop-blur-sm transition-colors"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={t('feed.nextPhoto')}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full grid place-items-center bg-black/40 hover:bg-black/60 text-white text-xl backdrop-blur-sm transition-colors"
            >
              ›
            </button>
            {/* Photo counter, so it's obvious this is a gallery of N. */}
            <div className="absolute top-3 right-3 z-10 rounded-full bg-black/45 backdrop-blur-sm px-2.5 py-1 text-[11px] font-bold text-white"
                 style={{ marginTop: 'var(--lm-top-inset)' }}>
              {photoIndex + 1}/{photos.length}
            </div>
          </>
        )}

        {/* Photo position dots (Stories-style), only shown when there's more than one. */}
        {photos.length > 1 && (
          <div className="absolute top-2 inset-x-2 flex gap-1" style={{ marginTop: 'var(--lm-top-inset)' }}>
            {photos.map((_, i) => (
              <div key={i} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
                <div className={`h-full bg-white transition-all ${i <= photoIndex ? 'w-full' : 'w-0'}`} />
              </div>
            ))}
          </div>
        )}

        {/* Top + bottom scrims for legibility. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/70 to-transparent" />

        {/* Identity — bottom-left: avatar + name/age/flag + handle. */}
        <div className="absolute left-0 right-0 bottom-24 px-4">
          <Link to={`/profile/${card.id}`} className="flex items-center gap-3 active:opacity-70">
            <img
              src={avatar}
              alt=""
              className="w-12 h-12 rounded-full object-cover ring-2 ring-white/70 shadow-lg shrink-0"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-xl font-extrabold text-white drop-shadow truncate">
                  {name}{card.age ? <span className="font-semibold">, {card.age}</span> : null}
                </span>
                {/* Image, not emoji — Windows renders flag emoji as bare
                    letters ("NG"). Falls back to the code if it can't load. */}
                {flagSrc
                  ? <img src={flagSrc} alt={card.country_code ?? ''}
                         className="h-4 w-auto rounded-sm shadow shrink-0" loading="lazy" />
                  : flag && <span className="text-lg drop-shadow" aria-hidden>{flag}</span>}
              </span>
              {card.handle && (
                <span className="block text-sm text-white/70 drop-shadow truncate">@{card.handle}</span>
              )}
            </span>
          </Link>
        </div>

        {/* Interested / Pass — bottom action row. */}
        <div className="absolute left-0 right-0 bottom-6 px-8 flex items-center justify-center gap-6">
          <motion.button
            onClick={() => decideAndClose('passed')}
            whileTap={{ scale: 0.85 }}
            disabled={!!deciding}
            aria-label={t('feed.pass')}
            className={[
              'w-16 h-16 rounded-full grid place-items-center text-3xl glass ring-2 transition-shadow',
              deciding === 'passed' ? 'ring-rose' : 'ring-white/20',
            ].join(' ')}
          >
            ✕
          </motion.button>
          <motion.button
            onClick={() => decideAndClose('interested')}
            whileTap={{ scale: 0.85 }}
            disabled={!!deciding}
            aria-label={t('feed.interested')}
            className={[
              'w-16 h-16 rounded-full grid place-items-center text-3xl bg-gradient-brand glow-rose transition-shadow',
              deciding === 'interested' ? 'ring-2 ring-white' : '',
            ].join(' ')}
          >
            💚
          </motion.button>
        </div>
      </div>
    </section>
  )
}
