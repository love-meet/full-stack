import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useMySubscription } from '../../hooks/usePayments'
import { useCreateGame } from '../../hooks/usePixelGame'
import { PopunderAd } from '../../components/FeedAd'
import MembersOnlyGate from '../../components/games/MembersOnlyGate'

/** Intro + create flow for Draughts (English Checkers). 1v1, best of 3. */
export default function DraughtsScreen() {
  const navigate = useNavigate()
  const isSubscriber = !!useMySubscription().data
  const createGame = useCreateGame()
  const [err, setErr] = useState<string | null>(null)
  // If reached via the Games-list modal (which already showed the rules),
  // hide the rules block here so the user lands on a focused Host card.
  const skipIntro = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('skip-intro') === '1'

  async function host() {
    setErr(null)
    try {
      const g = await createGame.mutateAsync({ kind: '1v1', type: 'draughts' })
      navigate(`/play/${g.invite_code}`)
    } catch (e) { setErr((e as Error).message) }
  }

  if (!isSubscriber) {
    return <Shell onBack={() => navigate(-1)}><MembersOnlyGate headline="Want to host a Draughts match?" /></Shell>
  }

  return (
    <Shell onBack={() => navigate(-1)}>
      <Step>
        <h2 className="text-xl font-extrabold text-gradient-warm">♟ Draughts</h2>
        {!skipIntro && (
          <>
            <p className="text-sm text-ink-2 mt-1">Classic English Checkers, head-to-head.</p>
            <ol className="mt-4 space-y-2 text-sm text-ink-2 list-decimal pl-5">
              <li>You and your opponent get <b>12 pieces each</b> on an 8×8 board.</li>
              <li>Pieces move <b>diagonally forward</b> one square at a time.</li>
              <li><b>Jump</b> an opponent's piece to capture it. Multiple jumps in a row are allowed and <b>captures are forced</b>.</li>
              <li>Reach the far row to become a <b>👑 King</b> — moves diagonally in any direction.</li>
              <li>Win the board when the other side has <b>no pieces left or no legal move</b>.</li>
              <li><b>Best of 3</b> boards takes the trophy. 🏆</li>
            </ol>
          </>
        )}
        <button onClick={host} disabled={createGame.isPending}
          className="mt-5 w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose disabled:opacity-60">
          {createGame.isPending ? 'Creating…' : 'Create 1 v 1 match'}
        </button>
        <p className="mt-2 text-[11px] text-ink-muted text-center">You'll get an invite link — no account needed to join.</p>
        {err && <p className="mt-3 text-xs text-danger text-center">{err}</p>}
      </Step>
    </Shell>
  )
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="min-h-screen text-ink pb-24">
      <PopunderAd />
      <header className="sticky top-0 z-10 glass border-b border-white/5" style={{ paddingTop: 'var(--lm-top-inset)' }}>
        <div className="max-w-2xl mx-auto h-14 px-3 flex items-center">
          <button onClick={onBack} aria-label="Back" className="text-ink-2 hover:text-ink text-2xl leading-none px-2 py-2">←</button>
          <div className="flex-1 text-center text-ink font-bold">Draughts</div>
          <div className="w-10" aria-hidden />
        </div>
      </header>
      <main className="max-w-md mx-auto px-5 py-6">{children}</main>
    </div>
  )
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="glass rounded-3xl p-5">
      {children}
    </motion.div>
  )
}
