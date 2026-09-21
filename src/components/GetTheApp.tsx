import { motion } from 'framer-motion'
import { openInTelegramNow } from '../lib/telegramRedirect'

/**
 * "Get the app" — the three surfaces, honestly labelled.
 *
 * Ship order is Telegram → website → mobile (§1), so only Telegram is a real
 * download today. iOS and Android are marked coming soon rather than dressed
 * up as store badges that go nowhere: a dead App Store button on a dating
 * site reads as a broken product, and Apple's badge guidelines do not allow
 * it before the listing exists.
 *
 * ASSET SLOTS FOR OLIVIA — each card below renders an emoji placeholder via
 * `icon`. Swap for real artwork by dropping files in /public and replacing
 * the icon prop with an <img>. Wanted, in rough priority:
 *   1. Telegram tile art          ~240×240, transparent PNG
 *   2. App Store / Play badges    official badges, for when the listings go
 *                                 live — not before
 *   3. Three in-app screenshots   feed, a chat with a game, credits
 */

type Surface = {
  key: string
  icon: string
  name: string
  blurb: string
  live: boolean
}

const SURFACES: Surface[] = [
  {
    key: 'telegram',
    icon: '✈️',
    name: 'Telegram Mini-App',
    blurb: 'Open it straight inside Telegram. No download.',
    live: true,
  },
  { key: 'ios', icon: '', name: 'iOS', blurb: 'Coming soon to the App Store.', live: false },
  { key: 'android', icon: '🤖', name: 'Android', blurb: 'Coming soon to Google Play.', live: false },
]

export default function GetTheApp() {
  return (
    <section className="relative z-10 w-full max-w-5xl mx-auto px-6 pb-16">
      <h2 className="text-center text-[10px] uppercase tracking-[0.22em] text-ink-muted font-bold">
        Get the app
      </h2>
      <p className="mt-2 text-center text-sm text-ink-2 max-w-md mx-auto">
        Love meet runs in your browser right now. It's also a Telegram Mini-App,
        with phone apps on the way.
      </p>

      <div className="mt-6 grid sm:grid-cols-3 gap-3">
        {SURFACES.map((s, i) => (
          <motion.div
            key={s.key}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06 }}
          >
            {s.live ? (
              <button
                onClick={() => void openInTelegramNow()}
                className="w-full h-full glass rounded-2xl p-5 text-left ring-1 ring-rose/30 hover:ring-rose/60 transition-shadow glow-rose"
              >
                <SurfaceBody s={s} />
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-gradient-brand text-white text-xs font-bold">
                  Open in Telegram →
                </span>
              </button>
            ) : (
              <div className="w-full h-full glass rounded-2xl p-5 opacity-70">
                <SurfaceBody s={s} />
                <span className="mt-3 inline-block rounded-full px-3 py-1.5 bg-white/8 text-ink-muted text-xs font-bold">
                  Coming soon
                </span>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function SurfaceBody({ s }: { s: Surface }) {
  return (
    <>
      <div className="flex items-center gap-2.5">
        {/* Placeholder — replace with Olivia's artwork when it lands. */}
        <span className="w-10 h-10 rounded-xl bg-white/8 grid place-items-center text-xl shrink-0" aria-hidden>
          {s.icon}
        </span>
        <span className="font-extrabold text-ink">{s.name}</span>
      </div>
      <p className="mt-2 text-xs text-ink-muted leading-relaxed">{s.blurb}</p>
    </>
  )
}
