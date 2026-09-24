import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { SUPPORTED_LANGUAGES } from '../i18n/languages'

/**
 * Safety, language and the anonymous option — HS-LM-v1 §03 and §07.
 *
 * Three things the document argues for at length and the page never
 * mentioned:
 *
 *   §03 language — "People will arrive from Asia, from across Africa and from
 *       the diaspora… it decides whether someone stays past the first
 *       minute." A page that only ever speaks English does not say that.
 *
 *   §03 the anonymous option — a suggested illustrated avatar, "a real,
 *       dignified choice rather than a penalty". On a dating app, whether you
 *       must show your face is one of the first questions a cautious person
 *       asks, and the answer here is a good one.
 *
 *   §07 safety — block, report, photo review, 18+. These exist and they are
 *       what a store reviewer and a nervous first-time user both look for.
 *       They were reachable only as small links in the footer.
 *
 * Every claim is true of the shipped app: the languages are the ones actually
 * bundled, the avatars are the ones offered at signup, and each safety line
 * names something that is built.
 */
const SAFETY = [
  {
    title: 'Block anyone, instantly',
    body: 'They disappear from your feed, your friends, your chats and search. They are not told.',
  },
  {
    title: 'Report a person, a photo or a message',
    body: 'Each one reaches a moderator, not an inbox nobody reads.',
  },
  {
    title: 'Profile pictures are reviewed',
    body: 'Explicit images are removed and the account goes with them.',
  },
  {
    title: '18 and over, always',
    body: 'Date of birth is asked at signup, and it is a gate rather than a profile field.',
  },
]

export default function SafeAndYours() {
  return (
    <section className="relative overflow-hidden px-6 py-20">
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 opacity-40">
        <div className="lm-orb lm-orb-b" style={{ top: '30%', left: '75%' }} />
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          className="text-center"
        >
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
            Yours, and <span className="text-gradient-warm">on your terms</span>
          </h2>
        </motion.div>

        <div className="mt-10 grid lg:grid-cols-2 gap-4">
          {/* Language */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            className="glass rounded-3xl p-6"
          >
            <h3 className="font-extrabold text-ink">In your language, from the first screen</h3>
            <p className="mt-2 text-sm text-ink-2 leading-relaxed">
              Love meet detects the language your phone is set to and opens in
              it. You are never made to hunt through settings to be understood,
              and you can change it any time in one tap.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {SUPPORTED_LANGUAGES.map((l) => (
                <span
                  key={l.code}
                  className="rounded-full px-2.5 py-1 bg-white/6 text-[11px] font-semibold text-ink-2"
                >
                  {l.nativeName}
                </span>
              ))}
            </div>
          </motion.div>

          {/* The anonymous option */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ delay: 0.06 }}
            className="glass rounded-3xl p-6"
          >
            <h3 className="font-extrabold text-ink">You do not have to show your face</h3>
            <p className="mt-2 text-sm text-ink-2 leading-relaxed">
              A good photograph is the single thing that decides whether anyone
              taps you, and we will say so plainly. But if you would rather not
              have your face online, pick one of the illustrated avatars — a
              real choice, not a penalty, and nobody is told which you used.
            </p>
            <div className="mt-4 flex items-center gap-2">
              {['/female.jpg', '/male.jpg', '/default-profile.jpg'].map((src) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  loading="lazy"
                  className="w-11 h-11 rounded-full object-cover ring-2 ring-white/15"
                />
              ))}
            </div>
          </motion.div>
        </div>

        {/* Safety */}
        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SAFETY.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: 0.04 * i }}
              className="rounded-2xl p-5 border border-white/8"
            >
              <h4 className="text-sm font-extrabold text-ink leading-tight">{s.title}</h4>
              <p className="mt-1.5 text-xs text-ink-2 leading-relaxed">{s.body}</p>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-6 text-center text-xs text-ink-muted"
        >
          Read our{' '}
          <Link to="/legal/safety" className="text-rose font-semibold hover:underline">safety guidance</Link>,{' '}
          <Link to="/legal/guidelines" className="text-rose font-semibold hover:underline">community guidelines</Link>{' '}
          and{' '}
          <Link to="/legal/child-safety" className="text-rose font-semibold hover:underline">child-safety standards</Link>.
        </motion.p>
      </div>
    </section>
  )
}
