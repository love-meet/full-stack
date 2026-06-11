import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useClaimGameByForfeit } from '../../hooks/usePixelGame'

const FORFEIT_AFTER_SEC = 180 // 3 minutes

type Props = {
  gameId: string
  /** The local player can claim the match by forfeit; only render the banner
   *  for them. Pass false for spectators. */
  amPlayer: boolean
  /** The opponent's user id (undefined while the lobby is being filled). */
  opponentId: string | undefined
  opponentName: string
  /** True when the opponent's presence is in the realtime channel. */
  opponentOnline: boolean
  /** Game status — banner only shows while the match is active. */
  gameStatus: string
}

/**
 * Floating top banner shown while the opponent is disconnected during an
 * active 1v1 match. A rotating spinner indicates we're waiting for them to
 * come back; a countdown ticks down from 3:00. When it hits zero, the
 * client fires `claim_game_by_forfeit`, the server verifies the opponent's
 * heartbeat is genuinely stale, and the match ends with the waiting player
 * as the winner.
 *
 * The countdown resets the moment the opponent's presence reappears, so a
 * brief network blip just makes the banner flash and disappear.
 */
export default function OpponentDisconnectBanner({
  gameId,
  amPlayer,
  opponentId,
  opponentName,
  opponentOnline,
  gameStatus,
}: Props) {
  const claim = useClaimGameByForfeit()
  // Epoch ms when the opponent went offline; null when they're online.
  const [offlineSince, setOfflineSince] = useState<number | null>(null)
  // Re-render the countdown every second by bumping a tick.
  const [, setTick] = useState(0)
  // Make sure we only fire the forfeit RPC once per disconnect window.
  const claimedRef = useRef(false)

  // Track presence transitions. When the opponent goes offline, stamp the
  // moment so the countdown can compute elapsed. When they come back, clear
  // the stamp (and the claim guard, in case they drop again later).
  useEffect(() => {
    if (!amPlayer || !opponentId || gameStatus !== 'active') {
      setOfflineSince(null)
      claimedRef.current = false
      return
    }
    if (opponentOnline) {
      setOfflineSince(null)
      claimedRef.current = false
    } else if (offlineSince === null) {
      setOfflineSince(Date.now())
    }
  }, [opponentOnline, opponentId, amPlayer, gameStatus, offlineSince])

  // Tick the countdown every second while we're waiting.
  useEffect(() => {
    if (offlineSince === null) return
    const iv = window.setInterval(() => setTick((t) => t + 1), 500)
    return () => window.clearInterval(iv)
  }, [offlineSince])

  // When the countdown hits 3:00, claim the match by forfeit.
  useEffect(() => {
    if (offlineSince === null || claimedRef.current) return
    if (claim.isPending) return
    const elapsedSec = Math.floor((Date.now() - offlineSince) / 1000)
    if (elapsedSec < FORFEIT_AFTER_SEC) return
    claimedRef.current = true
    claim.mutate(gameId, {
      onError: () => {
        // Server rejected (opponent is back, etc.) — let the banner reset
        // naturally on the next presence sync.
        claimedRef.current = false
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineSince, gameId])

  // Compute display state on render.
  const visible = offlineSince !== null && amPlayer && gameStatus === 'active'
  const elapsedSec = offlineSince !== null
    ? Math.floor((Date.now() - offlineSince) / 1000)
    : 0
  const remainingSec = Math.max(0, FORFEIT_AFTER_SEC - elapsedSec)
  const mm = Math.floor(remainingSec / 60)
  const ss = remainingSec % 60
  const countdownLabel = `${mm}:${ss.toString().padStart(2, '0')}`

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="disconnect-banner"
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -24, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          role="status"
          aria-live="polite"
          className="fixed left-3 right-3 z-30 pointer-events-none"
          style={{ top: 'calc(var(--lm-top-inset) + 6.5rem + 6px)' }}
        >
          <div
            className="max-w-md mx-auto rounded-2xl px-4 py-3 flex items-center gap-3 pointer-events-auto"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,92,122,0.16), rgba(255,92,122,0.08))',
              border: '1px solid rgba(255,92,122,0.45)',
              boxShadow:
                '0 16px 32px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {/* Rotating spinner — same ring style as the loading screen */}
            <motion.span
              className="shrink-0 inline-block w-6 h-6 rounded-full"
              style={{
                border: '2.5px solid rgba(255,92,122,0.85)',
                borderTopColor: 'transparent',
                borderRightColor: 'transparent',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />

            <div className="min-w-0 flex-1">
              {claim.isPending ? (
                <>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-danger">
                    Claiming match…
                  </div>
                  <div className="text-[13px] text-ink-2 truncate">
                    {opponentName} didn't return.
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-danger">
                    Opponent reconnecting…
                  </div>
                  <div className="text-[13px] text-ink truncate">
                    <span className="font-semibold">{opponentName}</span> lost
                    connection. Match awarded in
                    <span className="font-bold tabular-nums ml-1">{countdownLabel}</span>.
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
