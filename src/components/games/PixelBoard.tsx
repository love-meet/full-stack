import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const GRID = 5
const N = GRID * GRID
const PREVIEW_MS = 5000

/**
 * Shared 5x5 picture-race board. All clients pass the same `seed` (game+round)
 * so everyone scrambles identically without streaming moves — they simply race
 * to restore it. `startedAt` (epoch ms) gives a synced 5s preview. Calls
 * onSolve(timeMs) once when this client solves; `locked` freezes the board when
 * the round is already decided.
 */
export default function PixelBoard({
  image, seed, startedAt, locked, onSolve, onProgress,
}: {
  image: string
  seed: number
  startedAt: number
  locked: boolean
  onSolve: (timeMs: number) => void
  /** Fired whenever the tile order changes, so progress can be broadcast. */
  onProgress?: (order: number[], done: boolean) => void
}) {
  const raceStart = startedAt + PREVIEW_MS
  const [order, setOrder] = useState<number[]>(() => identity())
  const [phase, setPhase] = useState<'preview' | 'play' | 'solved'>('preview')
  const [selected, setSelected] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const solvedRef = useRef(false)

  // Broadcast progress on every order change while racing.
  useEffect(() => {
    if (phase === 'preview') return
    onProgress?.(order, isSolved(order))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, phase])

  // Preview → scatter at raceStart (synced across clients).
  useEffect(() => {
    if (phase !== 'preview') return
    const delay = raceStart - Date.now()
    if (delay <= 0) { setOrder(seededShuffle(seed)); setPhase('play'); return }
    const iv = window.setInterval(() => setNow(Date.now()), 250)
    const to = window.setTimeout(() => { setOrder(seededShuffle(seed)); setPhase('play') }, delay)
    return () => { window.clearInterval(iv); window.clearTimeout(to) }
  }, [phase, raceStart, seed])

  const countdown = Math.max(0, Math.ceil((raceStart - now) / 1000))

  function tap(slot: number) {
    if (phase !== 'play' || locked) return
    if (selected === null) { setSelected(slot); return }
    if (selected === slot) { setSelected(null); return }
    setOrder((prev) => {
      const next = [...prev]
      ;[next[selected], next[slot]] = [next[slot], next[selected]]
      if (!solvedRef.current && isSolved(next)) {
        solvedRef.current = true
        setPhase('solved')
        onSolve(Math.max(0, Date.now() - raceStart))
      }
      return next
    })
    setSelected(null)
  }

  const showWhole = phase === 'preview' || phase === 'solved'

  return (
    <div className="relative aspect-square w-full max-w-sm mx-auto select-none">
      <div className="grid grid-cols-5 gap-[3px] w-full h-full">
        {order.map((tile, slot) => {
          const row = Math.floor(tile / GRID)
          const col = tile % GRID
          return (
            <motion.button
              key={tile}
              layout
              transition={{ type: 'spring', stiffness: 600, damping: 40 }}
              onClick={() => tap(slot)}
              className={[
                'relative rounded-[5px] overflow-hidden',
                selected === slot ? 'ring-2 ring-gold z-10' : '',
                showWhole || locked ? 'pointer-events-none' : '',
              ].join(' ')}
              style={{
                backgroundImage: `url(${image})`,
                backgroundSize: '500% 500%',
                backgroundPosition: `${col * 25}% ${row * 25}%`,
              }}
              aria-label={`tile ${tile + 1}`}
            />
          )
        })}
      </div>

      <AnimatePresence>
        {phase === 'preview' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 grid place-items-center pointer-events-none"
          >
            <motion.span key={countdown} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="text-6xl font-extrabold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              {countdown}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---- helpers ----
function identity(): number[] { return Array.from({ length: N }, (_, i) => i) }
function isSolved(a: number[]): boolean { return a.every((v, i) => v === i) }

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle(seed: number): number[] {
  const rand = mulberry32(seed)
  const a = identity()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return isSolved(a) ? seededShuffle(seed + 1) : a
}

/** Read-only board for spectators — renders a given tile order, no interaction. */
export function MiniBoard({ image, order }: { image: string; order?: number[] }) {
  const o = order && order.length === N ? order : identity()
  return (
    <div className="grid grid-cols-5 gap-[2px] w-full aspect-square">
      {o.map((tile) => {
        const row = Math.floor(tile / GRID)
        const col = tile % GRID
        return (
          <motion.div
            key={tile}
            layout
            transition={{ type: 'spring', stiffness: 600, damping: 40 }}
            className="rounded-[3px] overflow-hidden"
            style={{
              backgroundImage: `url(${image})`,
              backgroundSize: '500% 500%',
              backgroundPosition: `${col * 25}% ${row * 25}%`,
            }}
          />
        )
      })}
    </div>
  )
}

export function seedFor(gameId: string, round: number): number {
  let h = 0
  const s = `${gameId}:${round}`
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h >>> 0
}

/** The shared starting scramble for a round (so spectators show it before a
 *  player has made a move). */
export function scrambleFor(gameId: string, round: number): number[] {
  return seededShuffle(seedFor(gameId, round))
}

/** How many tiles are already in their correct place (0..25). */
export function solvedCount(order?: number[]): number {
  if (!order) return 0
  return order.reduce((n, v, i) => n + (v === i ? 1 : 0), 0)
}
