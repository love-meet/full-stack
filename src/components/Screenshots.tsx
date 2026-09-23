import { motion } from 'framer-motion'
import { PeopleIcon, ChatIcon, SparkIcon } from './BrandIcons'

/**
 * "Screenshots of the inside" — HS-LM-v1 §02.
 *
 * "Real screens — the feed, a chat with a game running, the tips section.
 * People install what they can already picture themselves using."
 *
 * ── ASSET SLOT FOR OLIVIA ────────────────────────────────────────────────
 * Drop three PNGs into /public/shots/ named exactly:
 *
 *     feed.png     one profile filling the screen, the three buttons visible
 *     game.png     a chat with a game board mid-turn in it
 *     tips.png     the relationship tips list
 *
 * Portrait, ideally 1170×2532 (iPhone) or anything with that aspect. They
 * appear automatically — nothing here needs editing.
 *
 * Until they exist, each frame draws a labelled placeholder rather than a
 * broken image. That is deliberate: a missing screenshot on a dating site
 * reads as an abandoned product, and a grey box with a caption does not.
 * onError falls back too, so a typo in a filename degrades instead of
 * breaking the page.
 */
const SHOTS = [
  { src: '/shots/feed.png', Icon: PeopleIcon, title: 'The feed', caption: 'One person at a time. Interested, no thanks, or send a gift.' },
  { src: '/shots/game.png', Icon: ChatIcon, title: 'A game, mid-chat', caption: 'Take your turn. They take theirs whenever they wake up.' },
  { src: '/shots/tips.png', Icon: SparkIcon, title: 'Tips and topics', caption: 'Something to read on a day nobody new has appeared.' },
]

export default function Screenshots() {
  return (
    <section className="relative overflow-hidden px-6 py-16">
      <div className="relative z-10 w-full max-w-5xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink text-center"
        >
          A look <span className="text-gradient-warm">inside</span>
        </motion.h2>

        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          {SHOTS.map((s, i) => (
            <motion.figure
              key={s.src}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: 0.07 * i }}
              className="text-center"
            >
              <div className="relative mx-auto w-full max-w-[220px] aspect-[9/19.5] rounded-[1.75rem] overflow-hidden bg-surface-2 ring-1 ring-white/10 shadow-2xl">
                <Placeholder Icon={s.Icon} title={s.title} />
                <img
                  src={s.src}
                  alt={`${s.title} — Love meet`}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              </div>
              <figcaption className="mt-3 px-2">
                <span className="block text-sm font-extrabold text-ink">{s.title}</span>
                <span className="mt-0.5 block text-xs text-ink-muted leading-relaxed">{s.caption}</span>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Sits underneath the image, so it shows only while the screenshot is absent. */
function Placeholder({ Icon, title }: { Icon: (p: { className?: string }) => React.ReactElement; title: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-white/[0.06] to-transparent text-ink-muted">
      <div className="text-center px-4">
        <Icon className="w-9 h-9 mx-auto text-rose/60" />
        <span className="mt-2 block text-[11px] font-bold uppercase tracking-[0.18em]">{title}</span>
      </div>
    </div>
  )
}
