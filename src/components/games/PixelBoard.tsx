import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const PREVIEW_MS = 5000

/**
 * Progressive difficulty: the picture is cut into a small grid early on and a
 * bigger one as rounds advance, so the game eases players in (3x3) and ramps to
 * hard (5x5). Derived purely from the round number so every client computes the
 * same size for the shared scramble.
 *   rounds 1–5   → 3x3  (easy)
 *   rounds 6–12  → 4x4  (medium)
 *   rounds 13+   → 5x5  (hard)
 */
export function gridForRound(round: number): number {
  if (round <= 5) return 3
  if (round <= 12) return 4
  return 5
}

export function difficultyLabel(grid: number): string {
  if (grid <= 3) return 'Easy'
  if (grid === 4) return 'Medium'
  return 'Hard'
}

/**
 * Shared picture-race board. All clients pass the same `seed` (game+round) and
 * the same `grid` size so everyone scrambles identically without streaming
 * moves — they simply race to restore it. `startedAt` (epoch ms) gives a synced
 * 5s preview. Calls onSolve(timeMs) once when this client solves; `locked`
 * freezes the board when the round is already decided.
 */
export default function PixelBoard({
  image, seed, grid, startedAt, locked, onSolve, onProgress,
}: {
  image: string
  seed: number
  grid: number
  startedAt: number
  locked: boolean
  onSolve: (timeMs: number) => void
  /** Fired whenever the tile order changes, so progress can be broadcast. */
  onProgress?: (order: number[], done: boolean) => void
}) {
  const n = grid * grid
  const raceStart = startedAt + PREVIEW_MS
  const [order, setOrder] = useState<number[]>(() => identity(n))
  const [phase, setPhase] = useState<'preview' | 'play' | 'solved'>('preview')
  const [selected, setSelected] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const solvedRef = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)

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
    if (delay <= 0) { setOrder(seededShuffle(seed, n)); setPhase('play'); return }
    const iv = window.setInterval(() => setNow(Date.now()), 250)
    const to = window.setTimeout(() => { setOrder(seededShuffle(seed, n)); setPhase('play') }, delay)
    return () => { window.clearInterval(iv); window.clearTimeout(to) }
  }, [phase, raceStart, seed, n])

  const countdown = Math.max(0, Math.ceil((raceStart - now) / 1000))

  const canPlay = phase === 'play' && !locked

  // Swap the tiles at two slots (the dragged one and wherever it was dropped).
  function swapSlots(from: number, to: number) {
    if (!canPlay || from === to) return
    setOrder((prev) => {
      const next = [...prev]
      ;[next[from], next[to]] = [next[to], next[from]]
      if (!solvedRef.current && isSolved(next)) {
        solvedRef.current = true
        setPhase('solved')
        onSolve(Math.max(0, Date.now() - raceStart))
      }
      return next
    })
  }

  // Tap to pick a tile (it animates as "ready to move"), tap another to place
  // it — an alternative to dragging, both available at once.
  function tap(slot: number) {
    if (!canPlay) return
    if (selected === null) { setSelected(slot); return }
    if (selected === slot) { setSelected(null); return }
    swapSlots(selected, slot)
    setSelected(null)
  }

  // Which slot a tile was dropped over, from its drag offset + grid geometry.
  function dropTarget(slot: number, offX: number, offY: number): number {
    const el = gridRef.current
    if (!el) return slot
    const rect = el.getBoundingClientRect()
    const cellW = rect.width / grid
    const cellH = rect.height / grid
    const col = clamp((slot % grid) + Math.round(offX / cellW), 0, grid - 1)
    const row = clamp(Math.floor(slot / grid) + Math.round(offY / cellH), 0, grid - 1)
    return row * grid + col
  }

  const showWhole = phase === 'preview' || phase === 'solved'
  const bgSize = `${grid * 100}% ${grid * 100}%`

  return (
    <div className="relative aspect-square w-full max-w-sm mx-auto select-none">
      <div
        ref={gridRef}
        className="grid gap-[3px] w-full h-full"
        style={{ gridTemplateColumns: `repeat(${grid}, minmax(0, 1fr))` }}
      >
        {order.map((tile, slot) => {
          const row = Math.floor(tile / grid)
          const col = tile % grid
          return (
            <motion.button
              key={tile}
              layout
              drag={canPlay}
              dragSnapToOrigin
              dragElastic={0.12}
              whileDrag={{ scale: 1.1, zIndex: 30, boxShadow: '0 10px 28px rgba(0,0,0,0.45)' }}
              onDragEnd={(_e, info) => { swapSlots(slot, dropTarget(slot, info.offset.x, info.offset.y)); setSelected(null) }}
              onClick={() => tap(slot)}
              animate={selected === slot ? { rotate: [-2.5, 2.5, -2.5], scale: 1.07 } : { rotate: 0, scale: 1 }}
              transition={selected === slot
                ? { rotate: { repeat: Infinity, duration: 0.42, ease: 'easeInOut' }, scale: { type: 'spring', stiffness: 500, damping: 26 }, layout: { type: 'spring', stiffness: 600, damping: 40 } }
                : { type: 'spring', stiffness: 600, damping: 40 }}
              className={[
                'relative rounded-[5px] overflow-hidden touch-none',
                selected === slot ? 'ring-2 ring-gold z-20 shadow-[0_8px_22px_rgba(0,0,0,0.45)]' : '',
                showWhole || locked ? 'pointer-events-none' : 'cursor-grab active:cursor-grabbing',
              ].join(' ')}
              style={{
                backgroundImage: `url(${image})`,
                backgroundSize: bgSize,
                backgroundPosition: `${(col * 100) / (grid - 1)}% ${(row * 100) / (grid - 1)}%`,
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
function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)) }
function identity(n: number): number[] { return Array.from({ length: n }, (_, i) => i) }
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

function seededShuffle(seed: number, n: number): number[] {
  const rand = mulberry32(seed)
  const a = identity(n)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return isSolved(a) ? seededShuffle(seed + 1, n) : a
}

/** Read-only board for spectators — renders a given tile order, no interaction. */
export function MiniBoard({ image, order, grid }: { image: string; order?: number[]; grid: number }) {
  const n = grid * grid
  const o = order && order.length === n ? order : identity(n)
  const bgSize = `${grid * 100}% ${grid * 100}%`
  return (
    <div
      className="grid gap-[2px] w-full aspect-square"
      style={{ gridTemplateColumns: `repeat(${grid}, minmax(0, 1fr))` }}
    >
      {o.map((tile) => {
        const row = Math.floor(tile / grid)
        const col = tile % grid
        return (
          <motion.div
            key={tile}
            layout
            transition={{ type: 'spring', stiffness: 600, damping: 40 }}
            className="rounded-[3px] overflow-hidden"
            style={{
              backgroundImage: `url(${image})`,
              backgroundSize: bgSize,
              backgroundPosition: `${(col * 100) / (grid - 1)}% ${(row * 100) / (grid - 1)}%`,
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
export function scrambleFor(gameId: string, round: number, grid: number): number[] {
  return seededShuffle(seedFor(gameId, round), grid * grid)
}

/** How many tiles are already in their correct place. */
export function solvedCount(order?: number[]): number {
  if (!order) return 0
  return order.reduce((n, v, i) => n + (v === i ? 1 : 0), 0)
}
