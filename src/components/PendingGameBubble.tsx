import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useMyPendingLobby } from '../hooks/usePixelGame'

/**
 * Floating "back to your game" bubble. Shows on every authenticated screen
 * (except /play/:code itself) whenever the viewer is the host of a lobby
 * waiting for an opponent. The moment another player joins (player count
 * goes from 1 → 2+), we automatically navigate to /play/CODE so they're
 * back in the lobby ready to start the game.
 */
export default function PendingGameBubble() {
  const pending = useMyPendingLobby().data ?? null
  const navigate = useNavigate()
  const location = useLocation()

  const code = pending?.invite_code ?? null
  const onTheGame =
    code != null && location.pathname.toLowerCase() === `/play/${code.toLowerCase()}`

  // Someone joined → take the host back to their game immediately.
  useEffect(() => {
    if (!pending) return
    if (pending.playerCount >= 2 && !onTheGame) {
      navigate(`/play/${pending.invite_code}`)
    }
  }, [pending, onTheGame, navigate])

  const visible = !!pending && !onTheGame

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key="pending-bubble"
          onClick={() => navigate(`/play/${pending!.invite_code}`)}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          aria-label="Back to your game lobby"
          // bottom-24 keeps clear of the mobile bottom-nav (h-16) on screens that
          // have it; on full-screen layouts it sits just above the safe-area inset.
          className="fixed right-4 bottom-24 lg:bottom-6 z-40 w-14 h-14 rounded-full bg-gradient-brand text-white shadow-[0_10px_24px_-8px_rgba(0,0,0,0.55)] ring-2 ring-white/20 grid place-items-center text-2xl active:scale-95"
        >
          {/* The little dot pulses so it reads as "live / waiting". */}
          <span className="relative">
            🎮
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-success ring-2 ring-white">
              <span className="absolute inset-0 rounded-full bg-success animate-ping" />
            </span>
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
