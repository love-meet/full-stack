import { useLayoutEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { useProfile, useProfileById } from '../hooks/useProfile'
import { useStartDM } from '../hooks/useStartDM'
import { avatarFor } from '../lib/avatar'
import UserDetails from './profile/UserDetails'
import ProfileTabs from './profile/ProfileTabs'

// How far you have to scroll before the cinematic shrink is complete.
const ANIM_END = 380
// The shrunk-circle target size.
const FINAL_AVATAR = 96
// Hero starts at this fraction of the viewport height.
const HERO_VH_FRACTION = 0.52

export default function ProfileScreen() {
  const navigate = useNavigate()
  const session = useAuth((s) => s.session)
  // /profile/:userId? — when present, we render that user's profile.
  // Otherwise default to the signed-in user's own profile.
  const { userId: routeUserId } = useParams<{ userId?: string }>()
  const myProfileQ = useProfile()
  const otherProfileQ = useProfileById(routeUserId ?? null)
  const profileQ = routeUserId ? otherProfileQ : myProfileQ
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

  return (
    <div className="relative">
      {/* === Compact header (fades in once you scroll past the hero) === */}
      <motion.div
        style={{ opacity: compactOpacity }}
        className="fixed top-0 left-0 right-0 lg:left-64 z-20 glass border-b border-white/5"
      >
        <div
          className="flex items-center justify-between px-4 pt-3"
          style={{ paddingTop: 'calc(var(--lm-top-inset) + 0.5rem)' }}
        >
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 grid place-items-center text-ink-2 hover:text-ink text-2xl"
            aria-label="Back"
          >
            ←
          </button>
          {isMe && (
            <button
              onClick={() => navigate('/profile-menu')}
              className="w-10 h-10 grid place-items-center text-ink-2 hover:text-ink text-xl"
              aria-label="Settings"
            >
              ⋮
            </button>
          )}
        </div>
        <div className="flex flex-col items-center pb-3">
          <img
            src={avatar}
            alt=""
            className="w-[130px] h-[130px] rounded-full object-cover border-[3px] border-magenta"
          />
          <div className="mt-2 text-xl font-extrabold text-ink">@{username}</div>
          <div className="mt-1 text-sm font-bold text-ink">Online</div>
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
              aria-label="Back"
            >
              ←
            </button>
            {isMe && (
              <button
                onClick={() => navigate('/profile-menu')}
                className="w-10 h-10 grid place-items-center text-white text-xl drop-shadow"
                aria-label="Settings"
              >
                ⋮
              </button>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 p-5 flex items-end justify-between pointer-events-auto bg-gradient-to-t from-black/70 via-black/10 to-transparent">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white text-2xl font-extrabold drop-shadow">
                  {username}
                </span>
                {/* verified badge placeholder */}
              </div>
              <div className="text-white text-sm font-bold mt-1">
                Online
              </div>
            </div>
            {!isMe && <ChatLinkButton otherId={profile.id} />}
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
          aria-label="Close"
        >
          <img src={avatar} alt="" className="max-w-full max-h-full" />
          <span className="absolute top-6 right-6 text-white text-3xl">×</span>
        </button>
      )}

    </div>
  )
}

function ChatLinkButton({ otherId }: { otherId: string }) {
  const navigate = useNavigate()
  const startDM = useStartDM()
  const [err, setErr] = useState<string | null>(null)

  async function go() {
    if (startDM.isPending) return
    try {
      const convId = await startDM.mutateAsync(otherId)
      navigate(`/chat/${convId}`)
    } catch (e) {
      setErr((e as Error).message)
      window.setTimeout(() => setErr(null), 2400)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={go}
        disabled={startDM.isPending}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose text-white font-bold text-sm shadow-lg shadow-rose/30 disabled:opacity-70"
      >
        <span aria-hidden>➤</span>
        <span>{startDM.isPending ? 'Opening…' : 'Send Message'}</span>
      </button>
      {err && <span className="text-xs text-danger drop-shadow">{err}</span>}
    </div>
  )
}

function initialSize() {
  if (typeof window === 'undefined') return { width: 0, viewportH: 800 }
  return { width: window.innerWidth, viewportH: window.innerHeight }
}
