import { motion } from 'framer-motion'
import { openInTelegramNow } from '../lib/telegramRedirect'
import { TelegramLogo, AppleLogo, PlayLogo, TELEGRAM_BLUE } from './BrandIcons'

/**
 * "Get the app" — the three surfaces, honestly labelled.
 *
 * Ship order is Telegram → website → mobile (§1), so only Telegram is a real
 * destination today. iOS and Android are marked coming soon rather than given
 * App Store / Play badges that lead nowhere: a dead store button on a dating
 * site reads as a broken product, and Apple's badge guidelines do not allow
 * the badge before the listing exists.
 *
 * The Telegram card is deliberately the loud one — it is the surface we are
 * actually pushing people to, and the other two are placeholders. Making all
 * three equal weight would bury the only one that works.
 *
 * ASSET SLOTS FOR OLIVIA — the art here is CSS, not images, so nothing is
 * broken-looking while we wait. Drop-in replacements welcome:
 *   1. Telegram tile art        ~240×240 transparent PNG, replaces the glyph
 *   2. App Store / Play badges  official badges, once the listings exist
 *   3. Three in-app screenshots feed · a chat mid-game · credits
 */

export default function GetTheApp() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-4">
      {/* Same ambient orb language as the hero, so this reads as one page
          rather than a plain block bolted underneath a rich one. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 opacity-60">
        <div className="lm-orb lm-orb-b" style={{ top: '10%', left: '70%' }} />
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          className="text-center"
        >
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
            Get it on <span className="text-gradient-warm">your phone</span>
          </h2>
          <p className="mt-3 text-sm sm:text-base text-ink-2 max-w-md mx-auto leading-relaxed">
            Love meet runs inside Telegram today — nothing to install. The
            phone apps are on the way.
          </p>
        </motion.div>

        <div className="mt-9 grid sm:grid-cols-3 gap-4 items-stretch">
          {/* ── Telegram: live, and the one we want tapped ── */}
          <motion.button
            onClick={() => void openInTelegramNow()}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className="group relative sm:col-span-1 text-left rounded-3xl p-6 overflow-hidden glow-rose"
            style={{
              background:
                'linear-gradient(145deg, rgba(255,61,142,0.16), rgba(155,77,255,0.12) 55%, rgba(255,138,92,0.10))',
              border: '1px solid rgba(255,61,142,0.35)',
            }}
          >
            {/* Glow that answers the pointer, same trick as the wallet deck. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -top-16 -right-10 w-44 h-44 rounded-full opacity-40 blur-2xl transition-opacity group-hover:opacity-70"
              style={{ background: 'radial-gradient(circle, var(--color-rose), transparent 70%)' }}
            />
            <span className="relative flex items-center gap-2.5">
              {/* Telegram blue, not our gradient — it is their mark. */}
              <span
                className="w-12 h-12 rounded-2xl grid place-items-center shrink-0 text-white"
                style={{ background: TELEGRAM_BLUE }}
              >
                <TelegramLogo className="w-7 h-7" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] uppercase tracking-[0.18em] text-rose font-bold">
                  Available now
                </span>
                <span className="block font-extrabold text-ink leading-tight">
                  Telegram Mini-App
                </span>
              </span>
            </span>
            <span className="relative mt-4 block text-sm text-ink-2 leading-relaxed">
              Opens straight inside Telegram. Nothing to install, and it keeps
              you signed in to the same account.
            </span>
            <span className="relative mt-5 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 bg-gradient-brand text-white text-sm font-bold">
              Open in Telegram
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </span>
          </motion.button>

          {/* ── iOS / Android: honest placeholders ── */}
          {[
            // Each platform in its own colour: Apple's mark is white on black
            // (their guidelines allow solid black or solid white and nothing
            // else), Google Play keeps its four colours. Tinting either to
            // match our palette would be using someone's logo wrong.
            {
              key: 'ios', Logo: AppleLogo, name: 'iOS', store: 'App Store',
              tile: 'bg-black text-white',
            },
            {
              key: 'android', Logo: PlayLogo, name: 'Android', store: 'Google Play',
              tile: 'bg-white',
            },
          ].map((s, i) => (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.08 * (i + 1) }}
              className="relative rounded-3xl p-6 glass border border-dashed border-white/12"
            >
              <span className="flex items-center gap-2.5">
                <span className={`w-12 h-12 rounded-2xl grid place-items-center shrink-0 ring-1 ring-white/10 ${s.tile}`}>
                  <s.Logo className="w-6 h-6" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">
                    Coming soon
                  </span>
                  <span className="block font-extrabold text-ink-2 leading-tight">{s.name}</span>
                </span>
              </span>
              <p className="mt-4 text-sm text-ink-muted leading-relaxed">
                On the {s.store} soon. Use Telegram in the meantime — when the
                app lands it's the same account.
              </p>
              <span className="mt-5 inline-block rounded-full px-5 py-2.5 bg-white/5 text-ink-muted text-sm font-bold ring-1 ring-white/10">
                Coming soon
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
