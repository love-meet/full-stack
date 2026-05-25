import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { stagger, itemUp } from '../shell/motion'

type Step = { emoji: string; title: string; body: string; to?: string; cta?: string }

const STEPS: Step[] = [
  {
    emoji: '✨',
    title: 'Complete your profile',
    body: 'Add a clear photo, your bio and what you’re looking for. Profiles that feel real get the most attention.',
    to: '/profile/edit',
    cta: 'Edit profile',
  },
  {
    emoji: '🧭',
    title: 'Explore & find your people',
    body: 'Browse the feed, search by interests, and discover groups. Like, comment and follow the people you vibe with.',
    to: '/explore',
    cta: 'Open Explore',
  },
  {
    emoji: '💬',
    title: 'Start a conversation',
    body: 'Tap someone’s profile to message them. Be warm, be yourself — a genuine hello goes a long way.',
    to: '/feed',
    cta: 'Go to feed',
  },
  {
    emoji: '🎁',
    title: 'Send & receive gifts',
    body: 'Show someone you care by sending a gift on their post. When you receive one, accept it and it becomes real earnings you can withdraw.',
  },
  {
    emoji: '💸',
    title: 'Earn while you connect',
    body: 'Gifts you receive turn into withdrawable earnings. Invite friends with your link and earn 5% of what they spend — for life.',
    to: '/affiliate',
    cta: 'Get my invite link',
  },
  {
    emoji: '👑',
    title: 'Go premium to stand out',
    body: 'Sweetheart boosts your visibility, unlocks groups, games and unlimited posts, and gives you the blue verified tick.',
    to: '/subscription',
    cta: 'See plans',
  },
  {
    emoji: '💰',
    title: 'Top up your wallet',
    body: 'Add funds in your local currency to send gifts and subscribe. Withdraw your earnings to your local bank anytime.',
    to: '/wallet/deposit',
    cta: 'Add funds',
  },
]

export default function GuideScreen() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen text-ink pb-24">
      <header
        className="sticky top-0 z-10 glass border-b border-white/5"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={() => navigate(-1)} aria-label="Back" className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold">How Love meet works</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-6">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">💕</div>
          <h1 className="text-2xl font-extrabold text-gradient-warm">Welcome to Love meet</h1>
          <p className="mt-1 text-sm text-ink-2">
            Meet, match, chat — and earn while you’re at it. Here’s how to get the most out of it.
          </p>
        </div>

        <motion.div className="space-y-3" variants={stagger} initial="hidden" animate="visible">
          {STEPS.map((s, i) => (
            <motion.div key={s.title} variants={itemUp} className="glass rounded-2xl p-4 flex gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full grid place-items-center text-xl bg-white/5">
                {s.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-ink">
                  <span className="text-ink-muted mr-1">{i + 1}.</span>{s.title}
                </div>
                <p className="text-sm text-ink-2 mt-0.5">{s.body}</p>
                {s.to && (
                  <button
                    onClick={() => navigate(s.to!)}
                    className="mt-2 text-sm font-semibold text-rose hover:underline"
                  >
                    {s.cta} →
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>

        <button
          onClick={() => navigate('/feed')}
          className="mt-6 w-full rounded-full py-3 text-sm font-bold bg-gradient-brand text-white glow-rose"
        >
          Start exploring
        </button>
      </main>
    </div>
  )
}
