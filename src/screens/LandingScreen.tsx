import { useEffect, useMemo, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { signInWithTelegram, signInWithGoogle } from '../lib/signIn'
import LoadingShell from '../shell/LoadingShell'
import { openInTelegramNow } from '../lib/telegramRedirect'
import { appRunsHere, IS_DEV } from '../lib/surface'
import GetTheApp from '../components/GetTheApp'
import WhatItIs from '../components/WhatItIs'
import Screenshots from '../components/Screenshots'
import HowItWorks from '../components/HowItWorks'
import SiteFooter from '../components/SiteFooter'
import StickyJoinBar from '../components/StickyJoinBar'
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

/** One automatic Telegram sign-in attempt per tab — see AppSignIn. */
const TG_AUTH_TRIED = 'lm_tg_auth_tried'

function alreadyTriedTelegramAuth(): boolean {
  // Storage blocked counts as "already tried": without somewhere to record the
  // attempt there is no way to stop a failed sign-in retrying for ever, so the
  // safe answer is to show the button instead.
  try { return sessionStorage.getItem(TG_AUTH_TRIED) === '1' } catch { return true }
}

/**
 * Two different screens behind one route.
 *
 * ON THE WEBSITE this is a brochure. There is no sign-in and no way into the
 * product from a desktop browser: people join on Telegram, and on the phone
 * apps once those ship. All it does is explain what Love meet is and hand
 * over the Telegram link.
 *
 * INSIDE TELEGRAM none of that renders. The Mini-App is served from this same
 * URL, so `/` is also the app's front door — a signed-in visitor is bounced to
 * the feed, and a signed-out one gets the sign-in button. Showing them
 * marketing, or an "Open in Telegram" button while they are standing inside
 * Telegram, would be absurd.
 */
export default function LandingScreen() {
  const session = useAuth((s) => s.session)
  const ready = useAuth((s) => s.ready)
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

  // ── Inside the app (Telegram), this route is never the brochure ──────────
  //
  // Three states, and all three have to be right or a Mini-App user sees a
  // marketing page inside the product:
  //
  //   auth still resolving → a loader. Rendering the brochure here would
  //     flash it at every returning user for the split second before the
  //     redirect fires.
  //   signed in            → straight to the feed.
  //   signed out           → the Telegram sign-in, not the brochure. There is
  //     no auto sign-in, so this screen is the only way in — and "Open in
  //     Telegram" is meaningless to someone already inside Telegram.
  if (inApp) {
    if (!ready) return <LoadingShell />
    if (session) return <Navigate to="/feed" replace />
    return <AppSignIn />
  }

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
        {/* Copy */}
        <div className="text-center lg:text-left order-2 lg:order-1">
          {/* "Welcome to Love meet" sits above the line rather than inside it:
              at hero size the whole sentence would wrap to four lines and the
              part worth reading — "where hearts actually meet" — would be
              buried in the middle of it. */}
          <motion.span
            variants={rise}
            className="flex items-center justify-center lg:justify-start gap-2 text-[11px] uppercase tracking-[0.22em] text-rose font-bold"
          >
            <HeartIcon filled className="w-3.5 h-3.5" />
            Welcome to Love meet
          </motion.span>

          <motion.h1
            variants={rise}
            className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight text-ink"
          >
            Where hearts{' '}
            <span className="text-gradient-warm">actually meet</span>.
          </motion.h1>

          <motion.p
            variants={rise}
            className="mt-4 text-base sm:text-lg text-ink-2 max-w-md mx-auto lg:mx-0 leading-relaxed"
          >
            Meet people near you, match with someone who gets you, chat, send
            gifts, and maybe find the one. It only takes a hello.
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
          className="relative order-1 lg:order-2 mx-auto w-full lg:max-w-none"
        >
          <div className="relative aspect-[3/2] w-full max-w-[560px] mx-auto lm-float">
            {/* A soft glow behind the artwork rather than a ring around it —
                the render has no rectangular edge to frame. */}
            <div
              aria-hidden
              className="absolute inset-6 rounded-full opacity-40 blur-3xl"
              style={{ background: 'linear-gradient(135deg, var(--color-rose), var(--color-magenta) 55%, var(--color-coral))' }}
            />
            <img
              src="/shots/together.png"
              alt="Friends chatting and playing a game together on Love meet"
              className="relative w-full h-full object-contain drop-shadow-2xl"
            />

          </div>
        </motion.div>
      </motion.div>
    </section>

    {/* The doors come straight after the hero. §02 lists them fourth, but
        that order assumes somebody reads the whole page — anyone already
        persuaded by the hero should not have to scroll past three sections
        to act on it. The explanation still follows for everyone else. */}
    <GetTheApp />
    <WhatItIs />
    <Screenshots />
    <HowItWorks />
    <SiteFooter />

    {/* The door follows you down the page once the hero button scrolls off. */}
    <StickyJoinBar />

    {/* Localhost only. Compiled out of production builds entirely. */}
    {IS_DEV && <DevSignIn />}
    </>
  )
}

/**
 * Sign-in, shown only where the app actually runs.
 *
 * Deliberately not the brochure. Someone here has already chosen Love meet and
 * is standing inside it — they need one button, not a pitch. The marketing
 * sections are for people who have not decided yet, and they are unreachable
 * from this branch.
 *
 * Telegram is the only door. Signing in locally is a separate affair —
 * see DevSignIn at the bottom of this file.
 */
function AppSignIn() {
  // Inside Telegram we sign in on arrival, so the initial state is "working",
  // not "waiting for a tap". Decided here rather than in the effect: the read
  // is pure, and computing it up front means the screen never paints a button
  // for the split second before an effect could take it away.
  const [busy, setBusy] = useState(() => !alreadyTriedTelegramAuth())
  const [error, setError] = useState<string | null>(null)

  function connect() {
    setBusy(true)
    setError(null)
    signInWithTelegram().catch((e: Error) => {
      setError(e.message)
      setBusy(false)
    })
  }

  /**
   * Sign in automatically inside Telegram.
   *
   * Telegram already put this person here and `initData` is a signed assertion
   * of who they are — our Edge Function verifies the HMAC. Asking them to tap
   * "Continue with Telegram" is asking them to confirm an identity the client
   * already proved; every Mini-App that does this well just signs you in.
   *
   * ATTEMPTED ONCE PER TAB. Sign-in ends in a full navigation to a magic link
   * that lands back on this same route, so a failure that left no session
   * would otherwise retry forever. The flag makes the failure terminal, and
   * the button below becomes the manual escape hatch with the real error on
   * screen instead of an invisible redirect loop.
   */
  useEffect(() => {
    if (!busy) return
    try { sessionStorage.setItem(TG_AUTH_TRIED, '1') } catch { /* blocked storage */ }
    signInWithTelegram().catch((e: Error) => {
      setError(e.message)
      setBusy(false)
    })
  }, [busy])

  return (
    <section className="relative min-h-screen overflow-hidden grid place-items-center px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="lm-orb lm-orb-a" />
        <div className="lm-orb lm-orb-b" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative z-10 w-full max-w-sm text-center"
      >
        <img src="/logo.png" alt="" className="h-14 w-auto mx-auto" />

        <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-ink leading-tight">
          Where hearts <span className="text-gradient-warm">actually meet</span>.
        </h1>
        <p className="mt-3 text-sm text-ink-2 leading-relaxed">
          Meet people near you, match with someone who gets you, chat, send
          gifts, and maybe find the one. It only takes a hello.
        </p>

        {/* While the automatic sign-in runs this is a splash, not a form —
            showing a button nobody needs to press invites them to press it.
            The button only appears if the automatic attempt failed. */}
        {busy ? (
          <div className="mt-9 flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-white/15 border-t-rose animate-spin" />
            <p className="text-sm text-ink-muted">Signing you in…</p>
          </div>
        ) : (
          <>
            <button
              onClick={connect}
              className="mt-8 w-full rounded-full px-9 py-3.5 bg-gradient-brand text-white font-bold tracking-wide glow-rose transition-transform active:scale-[0.98] flex items-center justify-center gap-2.5"
            >
              <TelegramLogo className="w-5 h-5" />
              Continue with Telegram
            </button>
            {error && (
              <p className="mt-3 text-sm text-danger">
                Couldn't sign you in automatically: {error}
              </p>
            )}
          </>
        )}

        <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-ink-muted">
          18+ · Free to join
        </p>
      </motion.div>
    </section>
  )
}

/**
 * A way into the app on localhost.
 *
 * There is no Telegram SDK on a laptop, so signInWithTelegram() throws and a
 * developer has no door at all. This is that door — deliberately a small
 * corner button on the brochure rather than a screen of its own, because the
 * previous arrangement replaced the entire landing page with a sign-in form
 * and made the brochure impossible to look at while working on it.
 *
 * Vite compiles import.meta.env.DEV to a literal false, so this whole
 * component is dropped from a production bundle.
 */
function DevSignIn() {
  const [busy, setBusy] = useState(false)
  return (
    <button
      onClick={() => { setBusy(true); signInWithGoogle().catch(() => setBusy(false)) }}
      disabled={busy}
      className="fixed bottom-4 right-4 z-50 rounded-full px-4 py-2 bg-black/70 text-white text-xs font-bold ring-1 ring-white/20 backdrop-blur-sm disabled:opacity-60"
    >
      {busy ? 'Opening…' : 'dev sign-in'}
    </button>
  )
}
