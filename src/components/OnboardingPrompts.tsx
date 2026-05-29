import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../stores/auth'
import { useProfile } from '../hooks/useProfile'
import { useHasPosted, useMatchPreferences } from '../hooks/useMatchPreferences'

/** Set by PlanCheckoutScreen when the user backs out of checkout without
 *  paying. Read here so we can nudge them with a "you're on Free" notice. */
const CHECKOUT_CANCELLED = 'lm.checkout.cancelled'

/**
 * Three feed nudges, in priority order:
 *   1. First-post (compulsory) — full-screen if they have zero posts.
 *   2. Interview invite (compulsory) — once they've posted, until they
 *      complete the match interview.
 *   3. Free-plan notice — fires after they cancel out of the plan checkout
 *      without paying. Has "Pick a plan" and "Skip for now" buttons.
 */
export default function OnboardingPrompts() {
  const session = useAuth((s) => s.session)
  const ready = useAuth((s) => s.ready)
  const profile = useProfile()
  const myId = session?.user.id ?? null
  const onboarded = !!profile.data?.onboarded_at
  const hasPosted = useHasPosted(onboarded ? myId : null)
  const prefs = useMatchPreferences()

  const [cancelled, setCancelled] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem(CHECKOUT_CANCELLED) === '1')

  if (!ready || !session || !onboarded) return null

  // Wait for the queries to actually resolve before deciding what to show —
  // otherwise a brief paint with undefined data flashes a stale modal.
  const postLoaded = hasPosted.status === 'success'
  const prefsLoaded = prefs.status === 'success'

  const wantPost = postLoaded && hasPosted.data === false
  // prefs.data is null when the user has no row yet (never opened the
  // interview) — that still counts as "not completed".
  const wantInterview =
    postLoaded && hasPosted.data === true &&
    prefsLoaded && prefs.data?.completed_at == null
  const wantFreeNotice =
    cancelled && !wantPost && !wantInterview

  function dismissFreeNotice() {
    sessionStorage.removeItem(CHECKOUT_CANCELLED)
    setCancelled(false)
  }

  return (
    <AnimatePresence>
      {wantPost && <FirstPostModal key="first-post" />}
      {!wantPost && wantInterview && <InterviewInviteModal key="interview" />}
      {wantFreeNotice && <FreePlanNoticeModal key="free-notice" onDismiss={dismissFreeNotice} />}
    </AnimatePresence>
  )
}

function FirstPostModal() {
  return (
    <ModalShell>
      <div className="text-5xl mb-3">📸</div>
      <h2 className="text-2xl font-extrabold text-gradient-warm">Show the world your spark</h2>
      <p className="mt-2 text-ink-2">
        Share your <b>first post</b> so people can find you. A photo, a moment, a smile — anything
        you. Profiles with posts get noticed; profiles without them stay hidden.
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-ink-2">
        <li className="flex items-center gap-2"><span>✨</span> Land on more "for you" feeds</li>
        <li className="flex items-center gap-2"><span>💞</span> Get followed by people who like your vibe</li>
        <li className="flex items-center gap-2"><span>💬</span> Start real conversations</li>
      </ul>
      <Link
        to="/post"
        className="mt-6 inline-block w-full rounded-full py-3.5 bg-gradient-brand text-white font-extrabold glow-rose text-center"
      >
        Share my first post
      </Link>
      <p className="mt-3 text-[11px] text-ink-muted">This step is required to start meeting people.</p>
    </ModalShell>
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
