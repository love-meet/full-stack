import { motion } from 'framer-motion'
import { FeedMock, GameMock, TipsMock } from './ScreenMockups'

/**
 * "Screenshots of the inside" — HS-LM-v1 §02.
 *
 * "Real screens — the feed, a chat with a game running, the tips section.
 * People install what they can already picture themselves using."
 *
 * ── OLIVIA'S GRAPHICS ────────────────────────────────────────────────────
 * Drop the renders into /public/shots as feed.png, chat.png and games.png —
 * see the README in that folder. They appear automatically.
 *
 * Those renders carry their own titles in the artwork ("A Feed of People",
 * "Chat that stays yours", "Games"), so no caption is drawn beside them. A
 * heading next to a graphic that already has one reads as a mistake.
 *
 * Until a file exists, each slot draws the real screen in CSS instead — see
 * ScreenMockups. An empty frame with an icon in the middle advertises that
 * there is nothing to show; a drawing built from the same card shape and the
 * same three buttons shows the product. The swap is per-file, so the three
 * graphics can arrive one at a time.
 */
const SHOTS = [
  { src: '/shots/feed.png', Mock: FeedMock, alt: 'A feed of people on Love meet' },
  { src: '/shots/chat.png', Mock: GameMock, alt: 'A chat with a game running inside it' },
  { src: '/shots/games.png', Mock: TipsMock, alt: 'The eight games, inside a chat' },
]

export default function Screenshots() {
  return (
    <section className="relative overflow-hidden px-6 py-16">
      <div className="relative z-10 w-full max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink text-center"
        >
          A look <span className="text-gradient-warm">inside</span>
        </motion.h2>

        <div className="mt-10 grid sm:grid-cols-3 gap-6 items-center">
          {SHOTS.map((s, i) => (
            <motion.figure
              key={s.src}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: 0.07 * i }}
            >
              <Shot src={s.src} alt={s.alt} Mock={s.Mock} />
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * One slot: the render if it is there, the drawn screen if it is not.
 *
 * The image is NOT layered over the mock-up. Olivia's renders are wider than
 * a phone and carry their own transparent backgrounds, so overlaying would
 * crop them into a phone-shaped box and throw away most of the artwork. The
 * drawing is revealed only once the image has actually failed, which also
 * means the browser never paints both.
 */
function Shot({
  src, alt, Mock,
}: {
  src: string
  alt: string
  Mock: () => React.ReactElement
}) {
  return (
    <>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="lm-art w-full h-auto object-contain"
        onError={(e) => {
          const img = e.currentTarget
          img.style.display = 'none'
          img.nextElementSibling?.classList.remove('hidden')
        }}
      />
      <div className="hidden">
        <Mock />
      </div>
    </>
  )
}
