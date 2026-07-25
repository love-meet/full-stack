import { useLayoutEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../stores/auth'
import { useProfile, useProfileById } from '../hooks/useProfile'
import { useMySubscription, useSubscriptionPlans } from '../hooks/usePayments'
import { useStartDM } from '../hooks/useStartDM'
import { useProfileSocial, useToggleFollow, type ProfileSocial } from '../hooks/useFollow'
import { avatarFor } from '../lib/avatar'
import PresenceDot from '../components/PresenceDot'
import BlueTick from '../components/BlueTick'
import { IconShare } from '../components/icons'
import UserDetails from './profile/UserDetails'
import ProfileTabs from './profile/ProfileTabs'

// How far you have to scroll before the cinematic shrink is complete.
const ANIM_END = 380
// The shrunk-circle target size.
const FINAL_AVATAR = 96
// Hero starts at this fraction of the viewport height.
const HERO_VH_FRACTION = 0.52

export default function ProfileScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = useAuth((s) => s.session)
  // /profile/:userId? — when present, we render that user's profile.
  // Otherwise default to the signed-in user's own profile.
  const { userId: routeUserId } = useParams<{ userId?: string }>()
  const myProfileQ = useProfile()
  const otherProfileQ = useProfileById(routeUserId ?? null)
  const profileQ = routeUserId ? otherProfileQ : myProfileQ
  const profileSocial = useProfileSocial(routeUserId ?? myProfileQ.data?.id ?? null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [imageOpen, setImageOpen] = useState(false)

  // Measure the hero container so the cinematic interpolation runs in pure
  // pixels — Framer Motion can't smoothly interpolate '52vh' → '96px' or
  // '100%' → '96px', which is what caused the image to flop into the
  // top-left at scrollY=0.
  const [size, setSize] = useState(() => initialSize())
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      setSize({
        width:        el.offsetWidth,
        viewportH:    window.innerHeight,
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const heroStartH = size.viewportH * HERO_VH_FRACTION
  const heroStartW = size.width
  const heroEndLeft = Math.max(0, (size.width - FINAL_AVATAR) / 2)

  const { scrollY } = useScroll()
  const heroHeight  = useTransform(scrollY, [0, ANIM_END], [heroStartH, FINAL_AVATAR])
  const heroWidth   = useTransform(scrollY, [0, ANIM_END], [heroStartW, FINAL_AVATAR])
  const heroRadius  = useTransform(scrollY, [0, ANIM_END], [0,           FINAL_AVATAR / 2])
  const heroLeft    = useTransform(scrollY, [0, ANIM_END], [0,           heroEndLeft])
  const heroTop     = useTransform(scrollY, [0, ANIM_END], [0,           24])
  const overlayOpacity = useTransform(scrollY, [0, ANIM_END / 2], [1, 0])
  const compactOpacity = useTransform(scrollY, [50, 100], [0, 1])
  const compactPointerEvents = useTransform(
    compactOpacity,
    (value) => (value > 0.1 ? 'auto' : 'none')
  )

  if (profileQ.isLoading || !profileQ.data) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="lm-spinner" role="status" aria-label="Loading" />
      </div>
    )
  }
  const profile = profileQ.data
  const isMe = session?.user.id === profile.id
  const avatar = avatarFor(profile)
  const username = profile.handle ?? profile.display_name ?? 'you'
  const social = profileSocial.data

  return (
    <div className="relative">
      {/* === Compact header (fades in once you scroll past the hero) === */}
      <motion.div
        style={{ opacity: compactOpacity, pointerEvents: compactPointerEvents }}
        className="fixed top-0 left-0 right-0 lg:left-64 z-20 glass border-b border-white/5"
      >
        <div
          className="flex items-center justify-between px-4 pt-3"
          style={{ paddingTop: 'calc(var(--lm-top-inset) + 0.5rem)' }}
        >
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 grid place-items-center text-ink-2 hover:text-ink text-2xl"
            aria-label={t('post.back')}
          >
            ←
          </button>
          {isMe && (
            <button
              onClick={() => navigate('/profile-menu')}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-white/10 hover:bg-white/20 ring-1 ring-white/10 text-ink text-sm font-bold"
              aria-label={t('profile.openMenu')}
            >
              <span aria-hidden className="text-base leading-none">☰</span>
              <span>{t('profile.menu')}</span>
            </button>
          )}
        </div>
        <div className="flex flex-col items-center pb-3">
          <span className="relative">
            <img
              src={avatar}
              alt=""
              className="w-[130px] h-[130px] rounded-full object-cover border-[3px] border-magenta"
            />
            {/* Presence: pass lastSeenAt directly when we already have the
             *  profile in hand, falls back to userId lookup otherwise. */}
            {profile && (
              <PresenceDot
                lastSeenAt={profile.last_seen_at as string | null | undefined}
                size="md"
                ringColor="ring-black/60"
              />
            )}
          </span>
          <div className="mt-2 flex items-center gap-1.5 text-xl font-extrabold text-ink">
            @{username}
            {social?.is_subscriber && <BlueTick size={16} />}
          </div>
          {isMe && <PlanChip />}
          <div className="mt-1 flex items-center gap-4 text-sm text-ink-2">
            <span><b className="text-ink">{social?.followers ?? 0}</b> {t('profile.followers')}</span>
            <span><b className="text-ink">{social?.following ?? 0}</b> {t('profile.following')}</span>
          </div>
        </div>
      </motion.div>

      {/* === Hero container (acts as scroll runway). Height in px so the
              spacer below the image matches the start hero height exactly. === */}
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height: heroStartH || '52vh' }}
      >
        <motion.img
          src={avatar}
          alt=""
          onClick={() => setImageOpen(true)}
          // initial fallback for the very first paint (before useScroll fires)
          initial={false}
          style={{
            position: 'absolute',
            top: heroTop,
            left: heroLeft,
            width: heroWidth,
            height: heroHeight,
            borderRadius: heroRadius,
            objectFit: 'cover',
            zIndex: 1,
          }}
          className="cursor-zoom-in"
        />

        {/* === Overlay on the hero (visible at top of scroll) === */}
        <motion.div
          style={{ opacity: overlayOpacity }}
          className="absolute inset-0 z-[2] pointer-events-none"
        >
          <div
            className="flex items-center justify-between px-4 pt-3 pointer-events-auto"
            style={{ paddingTop: 'calc(var(--lm-top-inset) + 0.5rem)' }}
          >
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 grid place-items-center text-white text-2xl drop-shadow"
              aria-label={t('post.back')}
            >
              ←
            </button>
            {isMe && (
              <button
                onClick={() => navigate('/profile-menu')}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-black/45 backdrop-blur-sm ring-1 ring-white/25 text-white text-sm font-bold shadow"
                aria-label={t('profile.openMenu')}
              >
                <span aria-hidden className="text-base leading-none">☰</span>
                <span>{t('profile.menu')}</span>
              </button>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 p-5 flex items-end justify-between gap-3 pointer-events-auto bg-gradient-to-t from-black/70 via-black/10 to-transparent">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-white text-2xl font-extrabold drop-shadow truncate">
                  {username}
                </span>
                {social?.is_subscriber && <BlueTick />}
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-white drop-shadow">
                <span className="text-sm"><b className="font-extrabold">{social?.followers ?? 0}</b> <span className="text-white/80">{t('profile.followers')}</span></span>
                <span className="text-sm"><b className="font-extrabold">{social?.following ?? 0}</b> <span className="text-white/80">{t('profile.following')}</span></span>
              </div>
            </div>
            {!isMe && (
              <div className="flex items-center gap-2 shrink-0">
                <FollowButton targetId={profile.id} social={social} />
                <ChatLinkButton otherId={profile.id} />
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* === Body — details + tabs === */}
      <div className="relative z-[3] bg-surface pt-2">
        <UserDetails profile={profile} isMe={isMe} />
        <ProfileTabs userId={profile.id} isMe={isMe} />
      </div>

      {/* === Fullscreen image viewer === */}
      {imageOpen && (
        <button
          onClick={() => setImageOpen(false)}
          className="fixed inset-0 z-50 bg-black grid place-items-center"
          aria-label={t('post.close')}
        >
          <img src={avatar} alt="" className="max-w-full max-h-full" />
          <span className="absolute top-6 right-6 text-white text-3xl">×</span>
        </button>
      )}

    </div>
  )
}

function FollowButton({ targetId, social }: { targetId: string; social?: ProfileSocial }) {
  const { t } = useTranslation()
  const toggle = useToggleFollow(targetId)
  const following = social?.is_following ?? false
  return (
    <button
      onClick={() => toggle.mutate(!following)}
      disabled={toggle.isPending}
      className={[
        'inline-flex items-center justify-center px-5 h-10 rounded-full font-bold text-sm shadow-lg disabled:opacity-70 transition-colors',
        following ? 'glass text-ink' : 'bg-gradient-brand text-white glow-rose',
      ].join(' ')}
    >
      {following ? t('profile.followingState') : t('profile.follow')}
    </button>
  )
}

/** Icon-only "send message" button so it fits next to Follow. */
function ChatLinkButton({ otherId }: { otherId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const startDM = useStartDM()

  async function go() {
    if (startDM.isPending) return
    try {
      const convId = await startDM.mutateAsync(otherId)
      navigate(`/chat/${convId}`)
    } catch { /* swallow — rare; user can retry */ }
  }

  return (
    <button
      onClick={go}
      disabled={startDM.isPending}
      aria-label={t('profile.sendMessage')}
      className="w-10 h-10 grid place-items-center rounded-full bg-rose text-white shadow-lg shadow-rose/30 disabled:opacity-70"
    >
      <IconShare size={18} className="text-white" />
    </button>
  )
}

function initialSize() {
  if (typeof window === 'undefined') return { width: 0, viewportH: 800 }
  return { width: window.innerWidth, viewportH: window.innerHeight }
}

/** Small chip under the username showing the viewer's current plan. */
function PlanChip() {
  const { t } = useTranslation()
  const sub = useMySubscription()
  const plans = useSubscriptionPlans()
  const active = sub.data
  const name = active
    ? plans.data?.find((p) => p.id === active.plan_id)?.name ?? t('profile.activePlanName')
    : t('profile.freePlanName')
  const isFree = !active
  return (
    <div
      className={[
        'mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 ring-1 text-[11px] font-bold',
        isFree ? 'bg-white/5 text-ink-2 ring-white/10' : 'bg-rose/15 text-rose ring-rose/30',
      ].join(' ')}
    >
      <span aria-hidden>{isFree ? '◌' : '👑'}</span>
      <span>{t('profile.planLabel', { name })}</span>
    </div>
  )
}
