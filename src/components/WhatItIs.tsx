import { motion } from 'framer-motion'
import { PeopleIcon, ChatIcon, GameIcon, SparkIcon } from './BrandIcons'

/**
 * What Love meet is — HS-LM-v1 §01, in that document's own shape.
 *
 * Three pillars, then the three things that keep people here. It had been six
 * feature cards, and three of them had gone stale against the product:
 *
 *   "Gifts, free and cosmetic"     — §06 made gifts cost coins.
 *   "Friends, not just matches"    — friendship comes from Interested now,
 *                                    not from following; §04 bans following.
 *   "A feed of people … like them, save them for later"
 *                                  — §04 leaves three actions and no saving.
 *
 * A landing page that describes a product you no longer sell is worse than a
 * thin one, so this is rebuilt from the document rather than edited.
 */

const PILLARS = [
  {
    Icon: SparkIcon,
    title: 'Find love',
    body:
      'People looking for something serious tell us what they want, and we ' +
      'put them in front of each other.',
  },
  {
    Icon: PeopleIcon,
    title: 'Meet people',
    body:
      'Not everyone is here for a relationship. Some are here for company, ' +
      'conversation and a game.',
  },
  {
    Icon: ChatIcon,
    title: 'Relationship tips',
    body:
      'Advice and open topics people can read and contribute to. The reason ' +
      'to come back on a day you are not looking for anyone.',
  },
]

const KEEPERS = [
  {
    Icon: GameIcon,
    title: 'Games bring people back',
    body:
      'A turn taken is a reason to open the app tomorrow, and it costs ' +
      'nothing to play. Eight of them, inside the chat, a turn at a time — ' +
      'nobody has to be online at the same moment.',
  },
  {
    Icon: ChatIcon,
    title: 'Good conversation keeps them',
    body:
      'Chat behaves like iMessage, not like a dating-app inbox with a timer ' +
      'and a nudge. Text, voice notes, photographs, and the games sitting ' +
      'in the conversation where they belong.',
  },
  {
    Icon: SparkIcon,
    title: 'Something to do on a quiet day',
    body:
      'Tips and topics give you a reason to open Love meet on a day when ' +
      'nobody new has appeared. That is what makes it more than a dating app.',
  },
]

export default function WhatItIs() {
  return (
    <section className="relative overflow-hidden px-6 py-20">
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 opacity-50">
        <div className="lm-orb lm-orb-a" style={{ top: '20%', left: '-10%' }} />
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          className="text-center"
        >
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
            A place to find love, meet people,
            <br className="hidden sm:block" />{' '}
            <span className="text-gradient-warm">and get better at both</span>
          </h2>
          <p className="mt-3 text-sm sm:text-base text-ink-2 max-w-xl mx-auto leading-relaxed">
            Not a feed to scroll for hours, and not a swipe game. Somewhere you
            go to meet one person, and then stay because it is actually
            enjoyable.
          </p>
        </motion.div>

        {/* The three pillars. */}
        <div className="mt-10 grid sm:grid-cols-3 gap-4">
          {PILLARS.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: 0.05 * i }}
              className="glass rounded-3xl p-6"
            >
              <span className="w-12 h-12 rounded-2xl grid place-items-center bg-white/6 text-rose">
                <f.Icon className="w-6 h-6" />
              </span>
              <h3 className="mt-4 font-extrabold text-ink leading-tight">{f.title}</h3>
              <p className="mt-2 text-sm text-ink-2 leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>

        {/* Why anyone stays. */}
        <motion.h3
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-16 text-center text-2xl sm:text-3xl font-extrabold tracking-tight text-ink"
        >
          The three things that keep people here
        </motion.h3>

        <div className="mt-8 grid sm:grid-cols-3 gap-4">
          {KEEPERS.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: 0.05 * i }}
              className="rounded-3xl p-6 border border-white/8"
            >
              <span className="text-rose"><f.Icon className="w-6 h-6" /></span>
              <h4 className="mt-3 font-extrabold text-ink leading-tight">{f.title}</h4>
              <p className="mt-2 text-sm text-ink-2 leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>

        {/* Coins, stated plainly — §06, and §01's "no money language". */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-12 glass rounded-3xl p-6 sm:p-8 text-center max-w-2xl mx-auto"
        >
          <h3 className="font-extrabold text-ink">Free to join. Coins for talking.</h3>
          <p className="mt-2 text-sm text-ink-2 leading-relaxed">
            You start with <b className="text-ink">1,000 coins</b> — about ten
            days of conversation. The first message you send on any day costs
            100; everything after it that day is free, in every chat. A day you
            do not message costs nothing, and the games never cost a coin.
          </p>
          <p className="mt-3 text-xs text-ink-muted leading-relaxed">
            You must be 18 or over. Coins buy messaging inside Love meet — they
            have no cash value and cannot be withdrawn, transferred or
            exchanged.
          </p>
        </motion.div>

        {/* Olivia s coins and gifts renders. Each carries its own title in
            the artwork, so nothing is captioned here. Missing files simply
            do not render — this is decoration, and a gap is better than a
            placeholder pretending to be art. */}
        <div className="mt-10 grid sm:grid-cols-2 gap-6 items-center max-w-4xl mx-auto">
          {[
            { src: "/shots/coins.png", alt: "Coins on Love meet" },
            { src: "/shots/gifts.png", alt: "Sending a gift" },
            { src: "/shots/friends.png", alt: "Two profiles on each other's friends list" },
          ].map((g) => (
            <motion.img
              key={g.src}
              src={g.src}
              alt={g.alt}
              loading="lazy"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              className="w-full h-auto object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
