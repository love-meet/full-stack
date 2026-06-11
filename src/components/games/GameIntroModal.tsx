import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useCreateGame } from '../../hooks/usePixelGame'

export type GameForModal = {
  title: string
  emoji: string
  blurb: string
  players: string
  image?: string
  accent: string
  to?: string
  gameType?: 'pixel_rush' | 'number_duel' | 'draughts'
  rules?: ReactNode[]
}

type Props = {
  game: GameForModal
  onClose: () => void
}

/**
 * Modal that surfaces a game's intro (rules + CTA) over the Games screen.
 * "Got it — continue" creates a 1v1 match directly and navigates to the
 * lobby — no intermediate "Create 1 v 1 match" page. While the match is
 * being created the modal expands into a full-screen themed loading
 * overlay with the game's artwork as the backdrop.
 */
export default function GameIntroModal({ game, onClose }: Props) {
  const navigate = useNavigate()
  const createGame = useCreateGame()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Esc dismiss + body scroll-lock while open. Disabled during `creating`
  // (you shouldn't be able to bail out mid-create — the request is in flight).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !creating) onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose, creating])

  async function onContinue() {
    if (!game.gameType) return
    setCreating(true)
    setError(null)
    try {
      const g = await createGame.mutateAsync({ kind: '1v1', type: game.gameType })
      // Don't onClose() before navigate — the loading overlay should stay
      // visible right up until the lobby route mounts, so the screen doesn't
      // flash back to the Games list mid-transition.
      navigate(`/play/${g.invite_code}`)
    } catch (e) {
      setCreating(false)
      setError((e as Error).message || 'Could not create match')
    }
  }

  return (
    <AnimatePresence>
      {/* Backdrop — tap to dismiss (only when not creating) */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={creating ? undefined : onClose}
        className="fixed inset-0 bg-black/65 backdrop-blur-sm z-40"
        aria-hidden
      />

      {creating ? (
        <LoadingOverlay key="loading" game={game} error={error} />
      ) : (
        <motion.div
          key="modal"
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
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-3 right-3 w-9 h-9 grid place-items-center rounded-full bg-black/40 hover:bg-black/55 text-ink-2 hover:text-ink ring-1 ring-white/10 transition-colors"
            >
              <span className="text-lg leading-none">✕</span>
            </button>

            <h2 className="text-xl font-extrabold text-gradient-warm flex items-center gap-2 pr-10">
              <span aria-hidden>{game.emoji}</span>
              {game.title}
            </h2>
            <p className="text-sm text-ink-2 mt-1">{game.blurb}</p>

            {game.rules && game.rules.length > 0 && (
              <ol className="mt-4 space-y-2 text-sm text-ink-2 list-decimal pl-5">
                {game.rules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            )}

            <button
              onClick={onContinue}
              className="mt-5 w-full rounded-full py-3 bg-gradient-brand text-white font-bold glow-rose"
            >
              Got it — continue
            </button>

            {error && (
              <p className="mt-3 text-xs text-danger text-center">{error}</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Full-screen themed loading overlay shown between Continue and the lobby
 * route mounting. Uses the game's artwork as a blurred backdrop and the
 * game's accent as the spinner colour so the transition feels like a real
 * game engine warming up rather than a generic loading spinner.
 */
function LoadingOverlay({
  game,
  error,
}: {
  game: GameForModal
  error: string | null
}) {
  return (
    <motion.div
      key="loading-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      role="status"
      aria-live="polite"
      aria-label={`Loading ${game.title}`}
      className="fixed inset-0 z-50 overflow-hidden"
    >
      {/* Blurred backdrop image — fills the viewport, scaled up so the blur
          doesn't reveal hard edges at the corners. */}
      {game.image && (
        <img
          src={game.image}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover scale-125 blur-xl opacity-40"
          draggable={false}
        />
      )}
      {/* Darkening + colour wash so the spinner reads cleanly over any frame
          of the artwork. The accent tint matches the game's brand colour. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 60%, ${game.accent} 200%)`,
        }}
      />

      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6 text-center">
        {/* Themed spinner — concentric rings using the accent colour */}
        <div className="relative w-24 h-24 mb-8">
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              border: `3px solid ${game.accent}`,
              borderTopColor: 'transparent',
              borderRightColor: 'transparent',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          />
          <motion.div
            className="absolute inset-3 rounded-full"
            style={{
              border: `2px solid ${game.accent}`,
              borderBottomColor: 'transparent',
              borderLeftColor: 'transparent',
              opacity: 0.55,
            }}
            animate={{ rotate: -360 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
          />
          <div className="absolute inset-0 grid place-items-center text-3xl">
            <span style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))' }}>
              {game.emoji}
            </span>
          </div>
        </div>

        <h2 className="text-2xl font-extrabold text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]">
          {game.title}
        </h2>
        <p className="text-sm text-white/75 mt-2 uppercase tracking-[0.22em] font-semibold">
          {error ? 'Could not start' : 'Preparing match…'}
        </p>

        {error && (
          <p className="mt-4 text-sm text-white/85 max-w-xs">{error}</p>
        )}
      </div>
    </motion.div>
  )
}
