import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { openInTelegramNow } from '../lib/telegramRedirect'
import { TelegramLogo, AppleLogo, PlayLogo, TELEGRAM_BLUE } from './BrandIcons'

/**
 * The three doors — HS-LM-v1 §02.
 *
 * "The three download buttons, with the right one emphasised for the device
 * visiting."
 *
 * Telegram is live; the two stores are not. They are marked coming soon
 * rather than given App Store / Play badges, because Apple's guidelines do
 * not permit the badge before a listing exists and a dead store button on a
 * dating site reads as a broken product.
 *
 * Emphasis is per device: an iPhone gets the iOS card lifted, an Android the
 * Play one. Telegram stays the loud one regardless, because it is the only
 * door that opens today — emphasising a coming-soon card over a working one
 * would be pointing people at a wall.
 *
 * ASSET SLOT FOR OLIVIA: a ~240×240 transparent PNG can replace the Telegram
 * glyph tile. Everything else here is the official mark and should not be
 * redrawn.
 */

type Device = 'ios' | 'android' | 'other'

function detectDevice(): Device {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  // iPadOS 13+ reports itself as a Mac, so touch points are the tell.
  const iPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1
  if (/iPhone|iPod|iPad/.test(ua) || iPadOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

export default function GetTheApp() {
  const device = useMemo(() => detectDevice(), [])

  const stores = [
    {
      key: 'android' as const,
      Logo: PlayLogo,
      name: 'Android',
      sub: 'APK · alt stores',
      body: 'On Google Play soon, with a direct APK before that.',
      tile: 'bg-white',
    },
    {
      key: 'ios' as const,
      Logo: AppleLogo,
      name: 'iOS',
      sub: 'App Store',
      body: 'On the App Store soon. Sign in with Apple will be there.',
      tile: 'bg-black text-white',
    },
  ]

  return (
    <section className="relative overflow-hidden px-6 pb-16 pt-4">
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
            Three ways <span className="text-gradient-warm">in</span>
          </h2>
          <p className="mt-3 text-sm sm:text-base text-ink-2 max-w-md mx-auto leading-relaxed">
            Telegram works today — nothing to install, and no password. The
            phone apps are on the way, and it is the same account either way.
          </p>
        </motion.div>

        <div className="mt-9 grid sm:grid-cols-3 gap-4 items-stretch">
          {/* Telegram — the only one that opens. */}
          <motion.button
            onClick={() => void openInTelegramNow()}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className="group relative text-left rounded-3xl p-6 overflow-hidden glow-rose"
            style={{
              background:
                'linear-gradient(145deg, rgba(255,61,142,0.16), rgba(155,77,255,0.12) 55%, rgba(255,138,92,0.10))',
              border: '1px solid rgba(255,61,142,0.35)',
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-16 -right-10 w-44 h-44 rounded-full opacity-40 blur-2xl transition-opacity group-hover:opacity-70"
              style={{ background: 'radial-gradient(circle, var(--color-rose), transparent 70%)' }}
            />
            <span className="relative flex items-center gap-2.5">
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
                <span className="block font-extrabold text-ink leading-tight">Telegram Mini-App</span>
              </span>
            </span>
            <span className="relative mt-4 block text-sm text-ink-2 leading-relaxed">
              Your credentials come straight from Telegram. No password, no
              email, no form — the fastest door by far.
            </span>
            <span className="relative mt-5 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 bg-gradient-brand text-white text-sm font-bold">
              Open in Telegram
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </span>
          </motion.button>

          {stores.map((s, i) => {
            const mine = device === s.key
            return (
              <motion.div
                key={s.key}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.08 * (i + 1) }}
                className={[
                  'relative rounded-3xl p-6 glass border',
                  // The card for the device you are actually holding gets a
                  // solid border and a note; the other stays dashed.
                  mine ? 'border-rose/40 ring-1 ring-rose/20' : 'border-dashed border-white/12',
                ].join(' ')}
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
                    <span className="block text-[11px] text-ink-muted">{s.sub}</span>
                  </span>
                </span>

                <p className="mt-4 text-sm text-ink-muted leading-relaxed">{s.body}</p>

                <span className="mt-5 inline-block rounded-full px-5 py-2.5 bg-white/5 text-ink-muted text-sm font-bold ring-1 ring-white/10">
                  Coming soon
                </span>

                {mine && (
                  <p className="mt-3 text-[11px] font-semibold text-rose">
                    This is your device — use Telegram until it lands.
                  </p>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
