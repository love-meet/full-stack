import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../stores/auth'
import { useProfile } from '../hooks/useProfile'
import { useHasPosted, useMatchPreferences } from '../hooks/useMatchPreferences'

const POST_DISMISS = 'lm.firstPost.dismissed'
const INTERVIEW_DISMISS = 'lm.interview.dismissed'

/**
 * Two onboarding nudges that appear over the feed for new users.
 *   1. If they've finished onboarding but have ZERO posts → full-screen
 *      "share your first post" modal.
 *   2. Once they've posted but haven't completed the match interview →
 *      full-screen invite to take the 15-question interview.
 * Each can be dismissed for the current browser session via sessionStorage.
 */
export default function OnboardingPrompts() {
  const session = useAuth((s) => s.session)
  const ready = useAuth((s) => s.ready)
  const profile = useProfile()
  const myId = session?.user.id ?? null
  const onboarded = !!profile.data?.onboarded_at
  const hasPosted = useHasPosted(onboarded ? myId : null)
  const prefs = useMatchPreferences()

  // Session-scoped dismissals.
  const [dismissedPost, setDismissedPost] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem(POST_DISMISS) === '1')
  const [dismissedInterview, setDismissedInterview] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem(INTERVIEW_DISMISS) === '1')

  // Reset the post-dismissal once they've actually posted, so the interview
  // prompt can show on the same session.
  useEffect(() => {
    if (hasPosted.data === true) sessionStorage.removeItem(POST_DISMISS)
  }, [hasPosted.data])

  if (!ready || !session || !onboarded) return null

  // Decide which prompt (if any) to show — only one at a time.
  const wantPost = hasPosted.data === false && !dismissedPost
  const wantInterview =
    hasPosted.data === true && prefs.data?.completed_at == null && !dismissedInterview

  return (
    <AnimatePresence>
      {wantPost && (
        <FirstPostModal
          key="first-post"
          onSkip={() => {
            sessionStorage.setItem(POST_DISMISS, '1')
            setDismissedPost(true)
          }}
        />
      )}
      {!wantPost && wantInterview && (
        <InterviewInviteModal
          key="interview"
          onSkip={() => {
            sessionStorage.setItem(INTERVIEW_DISMISS, '1')
            setDismissedInterview(true)
          }}
        />
      )}
    </AnimatePresence>
  )
}

function FirstPostModal({ onSkip }: { onSkip: () => void }) {
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
      <button onClick={onSkip} className="mt-3 text-sm text-ink-muted hover:text-ink">
        Maybe later
      </button>
    </ModalShell>
  )
}

function InterviewInviteModal({ onSkip }: { onSkip: () => void }) {
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
      <button onClick={onSkip} className="mt-3 text-sm text-ink-muted hover:text-ink">
        Not now
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
