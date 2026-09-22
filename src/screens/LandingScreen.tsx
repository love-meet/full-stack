import { useEffect, useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { openInTelegramNow } from '../lib/telegramRedirect'
import { appRunsHere } from '../lib/surface'
import GetTheApp from '../components/GetTheApp'
import WhatItIs from '../components/WhatItIs'
import { TelegramLogo } from '../components/BrandIcons'
import { HeartIcon } from '../components/FeedIcons'

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

/**
 * The website.
 *
 * It is a brochure, not the app. There is no sign-in here and no way into the
 * product from a desktop browser: people join on Telegram, and on the phone
 * apps once those ship. Everything this page does is explain what Love meet
 * is and hand you the Telegram link.
 *
 * The one exception is the Mini-App itself, which is served from this same
 * URL inside Telegram's webview — there, a signed-in visitor is bounced
 * straight to /feed and never sees any of this.
 */
export default function LandingScreen() {
  const session = useAuth((s) => s.session)
  const particles = useHeartParticles()
  // Only true inside Telegram (or `npm run dev`). On the public website the
  // app is not reachable at all, so there is nothing to sign into.
  const inApp = appRunsHere()

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

  // Inside Telegram a signed-in visitor goes straight to the app and never
  // sees the brochure. On the website there is nothing to redirect to, so the
  // page renders immediately rather than waiting on auth to resolve.
  if (inApp && session) return <Navigate to="/feed" replace />

  return (
    <>
    <section className="relative min-h-screen overflow-hidden grid place-items-center px-6 py-12">
      {/* Ambient drifting orbs — pure CSS transforms, cheap */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="lm-orb lm-orb-a" />
        <div className="lm-orb lm-orb-b" />
      </div>

      {/* Drifting hearts. Drawn, not 💖 — the emoji is a different picture on
          every platform and brings its own colours, which is exactly wrong for
          something meant to be a faint tint of the brand pink. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        {particles.map((p, i) => (
          <span
            key={i}
            className="absolute text-rose"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              opacity: p.pink ? 0.35 : 0.22,
              filter: p.pink ? 'drop-shadow(0 0 5px rgba(255,61,142,0.5))' : undefined,
              animation: `floatParticles ${p.duration}s ease-in-out infinite ${p.delay}s`,
            }}
          >
            <HeartIcon filled className="w-full h-full" />
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
            match, chat in real time and play games together — right inside
            Telegram.
          </motion.p>

          {/* One destination, because there is only one. The app runs in
              Telegram; the website exists to say so. */}
          <motion.div variants={rise} className="mt-8 flex flex-col items-center lg:items-start gap-3">
            <button
              onClick={() => void openInTelegramNow()}
              className="rounded-full px-8 py-4 bg-gradient-brand text-white font-extrabold tracking-wide glow-rose transition-transform hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2.5"
            >
              <TelegramLogo className="w-5 h-5" />
              Open in Telegram
            </button>
            <p className="text-[11px] uppercase tracking-[0.2em] text-ink-muted">
              18+ · Free to join · iOS &amp; Android coming soon
            </p>
            <Link to="/blog" className="text-sm text-rose hover:underline font-semibold">
              Dating tips &amp; relationship advice →
            </Link>
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

            {/* Floating glass chips.
                These used to read "2,418 new chats today" and "12k+ matches"
                against 173 real users. Invented traction is the kind of claim
                an app store pulls a listing over, and it is not needed: what
                the product actually does is the more interesting thing to say
                on a dating site, and it is true today. */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="absolute -left-3 top-8 glass rounded-2xl px-3 py-2 shadow-xl"
            >
              <div className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">In every chat</div>
              <div className="text-sm font-extrabold text-ink">8 games to play</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, duration: 0.5 }}
              className="absolute -right-2 bottom-10 glass rounded-2xl px-3 py-2 shadow-xl flex items-center gap-2"
            >
              <HeartIcon filled className="w-4 h-4 text-rose" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">No subscription</div>
                <div className="text-sm font-extrabold text-gradient-brand">Free to join</div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </section>

    {/* Where to get it. Telegram is live; the phone apps are honestly marked
        coming soon rather than given store badges that lead nowhere. */}
    {/* What the app is. This is the website's actual job. */}
    <WhatItIs />

    {/* Where to get it. Telegram is live; the phone apps are honestly marked
        coming soon rather than given store badges that lead nowhere. */}
    <GetTheApp />
    </>
  )
}
