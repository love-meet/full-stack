import { motion } from 'framer-motion'
import { CloseIcon } from './FeedIcons'

/**
 * What is deliberately absent — HS-LM-v1 §04.
 *
 * This was the sharpest thing in the document and it was nowhere on the page.
 * Every dating app claims to help you meet someone; almost none of them will
 * say what they have refused to build. A list of absences is more convincing
 * than a list of features, because anybody can add a feature and only a
 * product with a point of view leaves things out.
 *
 * It is also the honest counterweight to the screenshots above: somebody
 * scrolling has just seen a feed of faces and may reasonably assume this is
 * another swipe-and-scroll app. This is the paragraph that says it is not.
 */
const ABSENT = [
  {
    title: 'No likes, no comments',
    body: 'Nothing public to perform for. Nobody is counting.',
  },
  {
    title: 'No followers',
    body: 'Friends, and only friends. There is nothing else to collect here.',
  },
  {
    title: 'No popularity',
    body: 'No view totals, no counts on anybody’s profile. Not on yours either.',
  },
  {
    title: 'No swiping',
    body: 'It scrolls. One person at a time, and then the next person.',
  },
]

export default function NothingToPerformFor() {
  return (
    <section className="relative overflow-hidden px-6 py-20">
      <div className="relative z-10 w-full max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          className="text-center"
        >
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
            What you <span className="text-gradient-warm">will not find</span>
          </h2>
          <p className="mt-3 text-sm sm:text-base text-ink-2 max-w-lg mx-auto leading-relaxed">
            Some of this was built and taken out again. Love meet is for
            meeting one person, not for being seen by a hundred.
          </p>
        </motion.div>

        <div className="mt-10 grid sm:grid-cols-2 gap-3">
          {ABSENT.map((a, i) => (
            <motion.div
              key={a.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: 0.05 * i }}
              className="flex items-start gap-3 rounded-2xl p-5 border border-white/8"
            >
              <span className="shrink-0 w-8 h-8 rounded-full grid place-items-center bg-white/6 text-ink-muted">
                <CloseIcon className="w-4 h-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-extrabold text-ink leading-tight">{a.title}</span>
                <span className="mt-1 block text-sm text-ink-2 leading-relaxed">{a.body}</span>
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
