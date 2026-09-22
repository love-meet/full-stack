import { motion } from 'framer-motion'
import {
  PeopleIcon, ChatIcon, GameIcon, GiftBoxIcon, FriendsIcon, SparkIcon,
} from './BrandIcons'

/**
 * What the app actually is.
 *
 * The website's whole job is this section. Everything else on the page is
 * atmosphere; this is the part that has to answer "what am I downloading and
 * why" for someone who has never heard of us.
 *
 * Every claim here is true of the shipped app today. Nothing is aspirational
 * and nothing is a number we cannot stand behind — a dating site that invents
 * its traction is the one thing an app store reliably pulls a listing over.
 *
 * ASSET SLOT FOR OLIVIA: each card has room for a screenshot above the text
 * (feed · a chat mid-game · credits). Until then the glyph carries it, so
 * nothing looks broken while we wait.
 */

const FEATURES = [
  {
    Icon: PeopleIcon,
    title: 'A feed of people',
    body:
      'One person per screen — their picture, their age, where they are. ' +
      'Like them, save them for later, or start talking. No swiping through ' +
      'a deck you cannot get back.',
  },
  {
    Icon: ChatIcon,
    title: 'Chat that stays yours',
    body:
      'Real-time messages, photos and voice notes. Nobody can message you ' +
      'out of nowhere for free, so the inbox stays worth opening.',
  },
  {
    Icon: GameIcon,
    title: 'Eight games, inside the chat',
    body:
      'Draughts, Number Duel, word games and more — played a turn at a time, ' +
      'right in the conversation. Free to play, always. Far easier than ' +
      'thinking of something to say.',
  },
  {
    Icon: GiftBoxIcon,
    title: 'Gifts, free and cosmetic',
    body:
      'Send someone a rose because you want to. No price, no cash value, ' +
      'nothing to cash out. It is a nice thing to send, and that is all it is.',
  },
  {
    Icon: FriendsIcon,
    title: 'Friends, not just matches',
    body:
      'Follow someone; if they follow you back you are friends, and you see ' +
      'what they post. Only people you both chose — no strangers, no ranking.',
  },
  {
    Icon: SparkIcon,
    title: 'Credits, not a subscription',
    body:
      'The first message you send on any day costs credits; after that, ' +
      'message as much as you like until tomorrow. A day you do not message ' +
      'costs nothing, and credits never expire.',
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
            What you get
          </h2>
          <p className="mt-3 text-sm sm:text-base text-ink-2 max-w-lg mx-auto leading-relaxed">
            Love meet is a dating app you actually spend time in — not a deck of
            faces you burn through in five minutes.
          </p>
        </motion.div>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: 0.05 * (i % 3) }}
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

        {/* The honest small print. A dating app that is vague about money is
            one people assume is hiding something. */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-10 text-center text-xs text-ink-muted max-w-xl mx-auto leading-relaxed"
        >
          You must be 18 or over. Credits buy messaging inside Love meet — they
          have no cash value and cannot be transferred, exchanged or withdrawn.
          Games are free and pay out nothing.
        </motion.p>
      </div>
    </section>
  )
}
