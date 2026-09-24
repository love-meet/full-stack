import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * The hero artwork, cycling.
 *
 * Two renders that say different halves of the same thing — a room full of
 * people playing, and a game running inside a chat. Neither one alone carries
 * "social connections and games together in one place", which is what the
 * headline now claims, so the hero shows both.
 *
 * A crossfade rather than a slide: these are transparent PNGs with irregular
 * edges, and sliding one out past the other reveals the page behind them in a
 * hard-edged rectangle. Fading has no edge to betray.
 *
 * Three things it is careful about:
 *
 *   It stops when the tab is hidden. An interval left running in a background
 *   tab wakes the CPU to swap images nobody is looking at.
 *
 *   It respects prefers-reduced-motion by not auto-advancing at all. For
 *   somebody with vestibular sensitivity an unrequested change every few
 *   seconds is exactly the thing that setting exists to stop; the dots still
 *   work, so no content is lost.
 *
 *   A slide whose file is missing is dropped rather than shown as a broken
 *   image, and if only one survives the dots and the timer do not appear.
 */
type Slide = { src: string; alt: string }

const SLIDES: Slide[] = [
  {
    src: '/shots/together.png',
    alt: 'Friends chatting and playing a game together on Love meet',
  },
  {
    src: '/shots/draughts.png',
    alt: 'A game of draughts running inside a Love meet chat',
  },
]

const INTERVAL_MS = 5000

export default function HeroCarousel() {
  const [ok, setOk] = useState<boolean[]>(() => SLIDES.map(() => true))
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = useRef(false)

  useEffect(() => {
    reduced.current =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  }, [])

  const live = SLIDES.map((s, n) => ({ ...s, n })).filter((s) => ok[s.n])

  useEffect(() => {
    if (live.length < 2 || paused || reduced.current) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      setI((n) => (n + 1) % live.length)
    }, INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [live.length, paused])

  // A slide failing to load can leave the index past the end of the list.
  const index = live.length ? i % live.length : 0
  const current = live[index]
  if (!current) return null

  return (
    <div
      className="relative aspect-[3/2] w-full max-w-[560px] mx-auto"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* A soft glow behind the artwork rather than a ring around it — these
          renders have no rectangular edge to frame. */}
      <div
        aria-hidden
        className="absolute inset-6 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            'linear-gradient(135deg, var(--color-rose), var(--color-magenta) 55%, var(--color-coral))',
        }}
      />

      <div className="relative w-full h-full lm-float">
        <AnimatePresence mode="wait">
          <motion.img
            key={current.src}
            src={current.src}
            alt={current.alt}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 w-full h-full object-contain drop-shadow-2xl"
            onError={() =>
              setOk((prev) => {
                const next = [...prev]
                next[current.n] = false
                return next
              })
            }
          />
        </AnimatePresence>
      </div>

      {live.length > 1 && (
        <div className="absolute -bottom-2 inset-x-0 flex justify-center gap-2">
          {live.map((s, n) => (
            <button
              key={s.src}
              onClick={() => setI(n)}
              aria-label={`Show image ${n + 1} of ${live.length}`}
              aria-current={n === index}
              className={[
                'h-1.5 rounded-full transition-all',
                n === index ? 'w-6 bg-rose' : 'w-1.5 bg-white/25 hover:bg-white/45',
              ].join(' ')}
            />
          ))}
        </div>
      )}
    </div>
  )
}
