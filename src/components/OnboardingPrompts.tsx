import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../stores/auth'
import { useProfile } from '../hooks/useProfile'
import {
  useBackfillMatchPreferencesComplete,
  useMatchPreferences,
} from '../hooks/useMatchPreferences'

/** Set by PlanCheckoutScreen when the user backs out of checkout without
 *  paying. Read here so we can nudge them with a "you're on Free" notice. */
const CHECKOUT_CANCELLED = 'lm.checkout.cancelled'

/**
 * Feed nudges, in priority order:
 *   1. Interview invite (compulsory) — until they complete the match
 *      interview. (The old "first post" nudge is gone: the gallery pivot
 *      made onboarding's mandatory 5-photo gallery the feed content, so
 *      there's no post to demand — and steering users into the compose
 *      flow would create content the gallery feed never shows.)
 *   2. Free-plan notice — fires after they cancel out of the plan checkout
 *      without paying. Has "Pick a plan" and "Skip for now" buttons.
 */
export default function OnboardingPrompts() {
  const session = useAuth((s) => s.session)
  const ready = useAuth((s) => s.ready)
  const profile = useProfile()
  const onboarded = !!profile.data?.onboarded_at
  const prefs = useMatchPreferences()
  const backfill = useBackfillMatchPreferencesComplete()

  const [cancelled, setCancelled] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem(CHECKOUT_CANCELLED) === '1')

  // Defensive backfill — if the user has clearly already done the interview
  // (answers exist in both partner and self maps) but completed_at didn't
  // persist for whatever reason, stamp it now in the background so they're
  // never re-prompted. Fires once per mount; the success invalidates the
  // prefs query and flips wantInterview to false on the next render.
  const backfillRef = useRef(false)
  useEffect(() => {
    if (backfillRef.current || backfill.isPending) return
    const p = prefs.data
    if (!p) return
    if (p.completed_at) return
    const partnerAnswered = p.partner && Object.keys(p.partner).length > 0
    const selfAnswered = p.self && Object.keys(p.self).length > 0
    if (partnerAnswered && selfAnswered) {
      backfillRef.current = true
      backfill.mutate(undefined, {
        onError: () => { backfillRef.current = false },
      })
    }
  }, [prefs.data, backfill])

  if (!ready || !session || !onboarded) return null

  // Wait for the query to actually resolve before deciding what to show —
  // otherwise a brief paint with undefined data flashes a stale modal.
  const prefsLoaded = prefs.status === 'success'

  // Treat the interview as completed if the timestamp is set OR if the
  // answers are clearly already filled (the backfill above will stamp the
  // timestamp shortly). This collapses the window where a returning user
  // would otherwise see the modal flash before the backfill resolves.
  const interviewDone = (() => {
    const p = prefs.data
    if (!p) return false
    if (p.completed_at) return true
    const partnerAnswered = p.partner && Object.keys(p.partner).length > 0
    const selfAnswered = p.self && Object.keys(p.self).length > 0
    return !!(partnerAnswered && selfAnswered)
  })()

  const wantInterview = prefsLoaded && !interviewDone
  const wantFreeNotice = cancelled && !wantInterview

  function dismissFreeNotice() {
    sessionStorage.removeItem(CHECKOUT_CANCELLED)
    setCancelled(false)
  }

  return (
    <AnimatePresence>
      {wantInterview && <InterviewInviteModal key="interview" />}
      {wantFreeNotice && <FreePlanNoticeModal key="free-notice" onDismiss={dismissFreeNotice} />}
    </AnimatePresence>
  )
}

function InterviewInviteModal() {
  return (
    <ModalShell>
      <div className="text-5xl mb-3">💞</div>
      <h2 className="text-2xl font-extrabold text-gradient-warm">Help us match you</h2>
      <p className="mt-2 text-ink-2">
        15 quick questions about the person you want — and you. We'll use it to surface people
        you'll actually click with, instead of random profiles.
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-ink-2">
        <li className="flex items-center gap-2"><span>🌍</span> Where they're from · career · character</li>
        <li className="flex items-center gap-2"><span>🎨</span> Favourite colour · faith · lifestyle</li>
        <li className="flex items-center gap-2"><span>💞</span> Love language · travel · money style</li>
      </ul>
      <Link
        to="/interview"
        className="mt-6 inline-block w-full rounded-full py-3.5 bg-gradient-brand text-white font-extrabold glow-rose text-center"
      >
        Take the 2-minute interview
      </Link>
      <p className="mt-3 text-[11px] text-ink-muted">This step is required before you can use the feed.</p>
    </ModalShell>
  )
}

function FreePlanNoticeModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <ModalShell>
      <div className="text-5xl mb-3">😌</div>
      <h2 className="text-2xl font-extrabold text-gradient-warm">You're on the Free plan</h2>
      <p className="mt-2 text-ink-2">
        You can still post, chat and join groups — but boosted visibility, hosting your own
        games, the blue tick and meeting verified VIPs are members-only.
      </p>
      <Link
        to="/subscription"
        onClick={onDismiss}
        className="mt-6 inline-block w-full rounded-full py-3.5 bg-gradient-brand text-white font-extrabold glow-rose text-center"
      >
        Pick a plan
      </Link>
      <button onClick={onDismiss} className="mt-3 text-sm text-ink-muted hover:text-ink">
        Skip for now
      </button>
    </ModalShell>
  )
}

function ModalShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm grid place-items-end sm:place-items-center px-5 py-6 overflow-y-auto"
      style={{ paddingTop: 'max(var(--lm-top-inset), 2rem)' }}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="w-full max-w-md glass rounded-3xl p-7 text-center"
      >
        {children}
      </motion.div>
    </motion.div>
  )
}
