import { motion } from 'framer-motion'

/**
 * How it works — HS-LM-v1 §02.
 *
 * "Three or four steps, in order, from joining to your first conversation."
 *
 * Four, because the fourth is the one that sells it: the first message costs
 * coins and everything after it that day does not. Leaving the price out of
 * the how-it-works and discovering it inside the app is how an install
 * becomes a one-star review.
 */
const STEPS = [
  {
    n: '1',
    title: 'Open it in Telegram',
    body:
      'No password, no email, no form. Telegram already knows who you are, ' +
      'so you are in by the time the page finishes loading.',
  },
  {
    n: '2',
    title: 'Answer a few questions',
    body:
      'Your language, where you are, your date of birth and a picture. ' +
      'That is the whole of it — everything else waits until you feel like it.',
  },
  {
    n: '3',
    title: 'Meet one person at a time',
    body:
      'A face fills the screen. Interested, no thanks, or send them ' +
      'something. Say Interested and you are on each other’s friends list.',
  },
  {
    n: '4',
    title: 'Talk, and play something',
    body:
      'Your first message of the day costs 100 coins; the rest of that day ' +
      'is free, in every chat. The games are free always — start one mid-' +
      'conversation and they can take their turn whenever they wake up.',
  },
]

export default function HowItWorks() {
  return (
    <section className="relative overflow-hidden px-6 py-20">
      <div className="relative z-10 w-full max-w-4xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink text-center"
        >
          How it <span className="text-gradient-warm">works</span>
        </motion.h2>

        <ol className="mt-10 space-y-3">
          {STEPS.map((s, i) => (
            <motion.li
              key={s.n}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: 0.05 * i }}
              className="glass rounded-3xl p-5 flex gap-4 items-start"
            >
              <span
                className="shrink-0 w-9 h-9 rounded-full grid place-items-center bg-gradient-brand text-white font-extrabold text-sm"
                aria-hidden
              >
                {s.n}
              </span>
              <span className="min-w-0">
                <span className="block font-extrabold text-ink leading-tight">{s.title}</span>
                <span className="mt-1 block text-sm text-ink-2 leading-relaxed">{s.body}</span>
              </span>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  )
}
