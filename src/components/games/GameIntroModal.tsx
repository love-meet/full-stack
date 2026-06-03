import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

export type GameForModal = {
  title: string
  emoji: string
  blurb: string
  players: string
  to?: string
  rules?: ReactNode[]
}

type Props = {
  game: GameForModal
  onClose: () => void
}

/**
 * Modal that surfaces a game's intro (rules + CTA) over the Games screen
 * instead of routing to a separate page. "Got it — continue" closes the
 * modal AND navigates to /games/<type>?skip-intro=1 so the actual game
 * screen jumps straight to mode-select (skipping its own duplicate guide).
 */
export default function GameIntroModal({ game, onClose }: Props) {
  const navigate = useNavigate()

  // Escape key closes; body scroll locked while the modal is open so the
  // games list under the backdrop doesn't scroll when the user scrolls the
  // modal contents.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  function onContinue() {
    if (!game.to) return
    onClose()
    navigate(`${game.to}?skip-intro=1`)
  }

  return (
    <>
      {/* Backdrop — tap to dismiss */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/65 backdrop-blur-sm z-40"
        aria-hidden
      />

      {/* Modal sheet */}
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`${game.title} — how to play`}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto z-50 max-h-[85vh] overflow-hidden"
        style={{ paddingTop: 'var(--lm-top-inset)' }}
      >
        <div className="glass rounded-3xl p-5 relative overflow-y-auto max-h-[85vh]">
          {/* Close (✕) */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 w-9 h-9 grid place-items-center rounded-full bg-black/40 hover:bg-black/55 text-ink-2 hover:text-ink ring-1 ring-white/10 transition-colors"
          >
            <span className="text-lg leading-none">✕</span>
          </button>

          {/* Title */}
          <h2 className="text-xl font-extrabold text-gradient-warm flex items-center gap-2 pr-10">
            <span aria-hidden>{game.emoji}</span>
            {game.title}
          </h2>
          <p className="text-sm text-ink-2 mt-1">{game.blurb}</p>

          {/* Rules */}
          {game.rules && game.rules.length > 0 && (
            <ol className="mt-4 space-y-2 text-sm text-ink-2 list-decimal pl-5">
              {game.rules.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ol>
          )}

          {/* CTA */}
          <button
            onClick={onContinue}
            className="mt-5 w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose"
          >
            Got it — continue
          </button>
        </div>
      </motion.div>
    </>
  )
}
