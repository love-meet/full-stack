import { useEffect, useMemo, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { getSurface } from '../lib/surface'
import { signInWithGoogle, signInWithTelegram } from '../lib/signIn'

// Deterministic heart positions so re-renders don't reshuffle them. Kept
// light (10 total) so the landing paints fast.
function useHeartParticles() {
  return useMemo(() => {
    const seed = (n: number) => {
      const x = Math.sin(n * 12.9898) * 43758.5453
      return x - Math.floor(x)
    }
    return Array.from({ length: 10 }).map((_, i) => ({
      left: seed(i + 1) * 92 + 2,
      top: seed(i + 100) * 90 + 3,
      size: 9 + seed(i + 200) * 8,
      duration: 5 + seed(i + 300) * 4,
      delay: seed(i + 400) * 4,
      pink: seed(i + 500) > 0.45,
    }))
  }, [])
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
}
const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
}

export default function LandingScreen() {
  const navigate = useNavigate()
  const session = useAuth((s) => s.session)
  const ready = useAuth((s) => s.ready)
  const [surface] = useState(getSurface())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const particles = useHeartParticles()

  // Capture a referral code so we can attribute it once the user finishes
  // onboarding. Two sources:
  //   • Web/PWA invite link:  /?ref=LM-XXXXXX
  //   • Telegram Mini App deep link:  t.me/<bot>/<app>?startapp=LM-XXXXXX
  //     (surfaced as Telegram.WebApp.initDataUnsafe.start_param)
  // Stored in localStorage so it survives the URL changing through login +
  // onboarding before /feed.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('ref')
    const fromTelegram = window.Telegram?.WebApp?.initDataUnsafe?.start_param ?? null
    const ref = fromUrl || fromTelegram
    if (ref && /^LM-[A-Za-z0-9]{4,}$/i.test(ref)) {
      localStorage.setItem('lm_ref', ref.toUpperCase())
    }
  }, [])

  useEffect(() => {
    if (ready && session) navigate('/feed', { replace: true })
  }, [ready, session, navigate])

  // Telegram sign-in is triggered ONLY by the button (onTelegramClick) —
  // never automatically — so users tap to connect.

  async function onGoogleClick() {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  function onTelegramClick() {
    setBusy(true)
    setError(null)
    signInWithTelegram().catch((e: Error) => {
      setError(e.message)
      setBusy(false)
    })
  }

  return (
    <section className="relative min-h-screen overflow-hidden grid place-items-center px-6 py-12">
      {/* Ambient drifting orbs — pure CSS transforms, cheap */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="lm-orb lm-orb-a" />
        <div className="lm-orb lm-orb-b" />
      </div>

      {/* Light heart particles */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        {particles.map((p, i) => (
          <span
            key={i}
            className="absolute"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              fontSize: `${p.size}px`,
              color: 'var(--color-rose)',
              opacity: p.pink ? 0.35 : 0.22,
              filter: p.pink ? 'drop-shadow(0 0 5px rgba(255,61,142,0.5))' : undefined,
              animation: `floatParticles ${p.duration}s ease-in-out infinite ${p.delay}s`,
            }}
          >
            {p.pink ? '💖' : '♥'}
          </span>
        ))}
      </div>

      {/* Main */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 w-full max-w-5xl grid lg:grid-cols-2 gap-10 lg:gap-12 items-center"
      >
        {/* Copy + auth */}
        <div className="text-center lg:text-left order-2 lg:order-1">
          <motion.h1
            variants={rise}
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight text-ink"
          >
            Find your{' '}
            <span className="text-gradient-warm">person</span>.
          </motion.h1>

          <motion.p
            variants={rise}
            className="mt-4 text-base sm:text-lg text-ink-2 max-w-md mx-auto lg:mx-0 leading-relaxed"
          >
            Love meet is the free dating app to meet new people, find your love
            match, chat in real time, play love games and get relationship
            advice — on the web or inside Telegram.
          </motion.p>

          {/* Glass auth card */}
          <motion.div
            variants={rise}
            className="mt-8 glass rounded-3xl p-5 sm:p-6 max-w-md mx-auto lg:mx-0"
          >
            <CtaStack
              surface={surface}
              busy={busy}
              error={error}
              onGoogle={onGoogleClick}
              onTelegram={onTelegramClick}
            />
            <p className="mt-3 text-center text-[11px] uppercase tracking-[0.2em] text-ink-muted">
              18+ · No spam · Free to join
            </p>
          </motion.div>
        </div>

        {/* Hero visual */}
        <motion.div
          variants={rise}
          className="relative order-1 lg:order-2 mx-auto w-full max-w-sm lg:max-w-none"
        >
          <div className="relative aspect-square w-full max-w-[420px] mx-auto lm-float">
            {/* gradient glow ring behind the photo */}
            <div
              aria-hidden
              className="absolute -inset-4 rounded-[2rem] opacity-60 blur-2xl"
              style={{ background: 'linear-gradient(135deg, var(--color-rose), var(--color-magenta) 55%, var(--color-coral))' }}
            />
            <img
              src="/hero.jpeg"
              alt="Two people connecting on Love meet"
              className="relative w-full h-full object-cover rounded-[2rem] border border-white/10 shadow-2xl"
            />

            {/* Floating glass social-proof chips */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="absolute -left-3 top-8 glass rounded-2xl px-3 py-2 shadow-xl"
            >
              <div className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">Today</div>
              <div className="text-sm font-extrabold text-ink">2,418 new chats</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, duration: 0.5 }}
              className="absolute -right-2 bottom-10 glass rounded-2xl px-3 py-2 shadow-xl flex items-center gap-2"
            >
              <span className="text-lg">❤</span>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">Matches</div>
                <div className="text-sm font-extrabold text-gradient-brand">12k+ and counting</div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  )
}

type CtaProps = {
  surface: 'telegram' | 'web'
  busy: boolean
  error: string | null
  onGoogle: () => void
  onTelegram: () => void
}

function CtaStack({ surface, busy, error, onGoogle, onTelegram }: CtaProps) {
  return (
    <div className="flex flex-col gap-3 w-full">
      {surface === 'telegram' ? (
        <button
          onClick={onTelegram}
          disabled={busy}
          className="w-full rounded-full px-9 py-3.5 bg-gradient-brand text-white font-bold tracking-wide glow-rose transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <span className="text-lg leading-none">✈</span>
          {busy ? 'Opening…' : 'Continue with Telegram'}
        </button>
      ) : (
        <button
          onClick={onGoogle}
          disabled={busy}
          className="w-full rounded-full px-9 py-3.5 bg-gradient-brand text-white font-bold tracking-wide glow-rose transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <span className="text-lg leading-none">◉</span>
          {busy ? 'Opening…' : 'Continue with Google'}
        </button>
      )}
      {error && <p className="text-sm text-danger text-center">{error}</p>}
      <p className="text-center text-[11px] text-ink-muted">
        New here?{' '}
        <Link to="/blog" className="text-rose hover:underline font-semibold">
          Read love games, dating tips &amp; relationship advice
        </Link>
      </p>
    </div>
  )
}
