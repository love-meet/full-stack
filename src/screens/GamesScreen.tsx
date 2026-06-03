import { useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ScreenHeader from '../shell/ScreenHeader'
import TopIcons from '../shell/TopIcons'
import { stagger, itemUp } from '../shell/motion'
import { PopunderAd } from '../components/FeedAd'
import GameIntroModal from '../components/games/GameIntroModal'

type Game = {
  title: string
  blurb: string
  /** Wide banner artwork (~4:1). Contains title, blurb, badges, play button —
   *  React only needs to display it + add motion. */
  image?: string
  /** Used by the modal title + the synthetic-banner fallback. */
  emoji: string
  players: 'Couples' | 'Group' | '1v1' | '1v1 / Group'
  accent: string
  to?: string // present = playable (no padlock)
  /** Rules shown in the GameIntroModal (numbered list). */
  rules?: ReactNode[]
}

const GAMES: Game[] = [
  {
    title: 'Pixel Rush',
    blurb: 'Race to rebuild a scrambled photo. Fastest to fix it wins.',
    image: '/pixel-rush.png',
    emoji: '🧩',
    players: '1v1 / Group',
    accent: 'var(--color-gold)',
    to: '/games/pixel-rush',
    rules: [
      <>A photo is shown for <b>5 seconds</b> — study it.</>,
      <>It scatters into a grid — easy <b>3×3</b> early rounds, building up to a hard <b>5×5</b>.</>,
      <><b>Drag a tile onto another, or tap two tiles, to swap them</b> and rebuild the original.</>,
      <>Beat the clock — fewest seconds (and moves) wins the round.</>,
      <>In multiplayer, first to finish takes the round; best of 9 takes the trophy. 🏆</>,
    ],
  },
  {
    title: 'Number Duel',
    blurb: "Pick a secret number; race to guess your rival's. Higher or lower!",
    image: '/number-duel.png',
    emoji: '🔢',
    players: '1v1',
    accent: 'var(--color-magenta)',
    to: '/games/number-duel',
    rules: [
      <>You each secretly pick a number from <b>0 to 100</b> (e.g. 17, 42, 90).</>,
      <>Race to guess your opponent's number on the keypad.</>,
      <>After each guess an arrow says <b>↑ higher</b> or <b>↓ lower</b>.</>,
      <>First to guess the <b>exact</b> number takes the round.</>,
      <>Difficulty ramps up: <b>6 Easy</b> rounds (whole numbers), <b>4 Medium</b> (1 decimal), <b>2 Hard</b> (2 decimals).</>,
      <>Best of 12 takes the trophy. 🏆 Viewers watch both numbers live.</>,
    ],
  },
  {
    title: 'Draughts',
    blurb: 'Classic checkers — jump, capture, crown your king. Best of 3 takes the trophy.',
    image: '/draughts.png',
    emoji: '♟',
    players: '1v1',
    accent: 'var(--color-gold)',
    to: '/games/draughts',
    rules: [
      <>You and your opponent get <b>12 pieces each</b> on an 8×8 board.</>,
      <>Pieces move <b>diagonally forward</b> one square at a time.</>,
      <><b>Jump</b> an opponent's piece to capture it. Multiple jumps in a row are allowed and <b>captures are forced</b>.</>,
      <>Reach the far row to become a <b>👑 King</b> — moves diagonally in any direction.</>,
      <>Win the board when the other side has <b>no pieces left or no legal move</b>.</>,
      <><b>Best of 3</b> boards takes the trophy. 🏆</>,
    ],
  },
  {
    title: 'Truth or Dare',
    blurb: 'Spicy prompts to break the ice — your rules.',
    emoji: '🎯',
    players: 'Couples',
    accent: 'var(--color-rose)',
  },
]

export default function GamesScreen() {
  const [openGame, setOpenGame] = useState<Game | null>(null)

  return (
    <div className="min-h-full relative">
      <PopunderAd />
      <ScreenHeader title="Games" right={<TopIcons />} />

      <div className="max-w-xl mx-auto px-5 sm:px-8 pt-5 pb-28">
        <motion.div
          className="flex flex-col gap-4"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          {GAMES.map((g, i) => (
            <motion.div key={g.title} variants={itemUp}>
              <GameCard
                game={g}
                index={i}
                onOpen={() => g.to && setOpenGame(g)}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>

      <AnimatePresence>
        {openGame && (
          <GameIntroModal
            key={openGame.title}
            game={{
              title: openGame.title,
              emoji: openGame.emoji,
              blurb: openGame.blurb,
              players: openGame.players,
              to: openGame.to,
              rules: openGame.rules,
            }}
            onClose={() => setOpenGame(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function GameCard({
  game,
  index,
  onOpen,
}: {
  game: Game
  index: number
  onOpen: () => void
}) {
  const locked = !game.to

  // Stagger the idle shine sweep across cards so they don't all shine in
  // unison (would feel mechanical). Each card waits a bit longer before
  // its first sweep + between sweeps.
  const shineDelay = 1.6 + index * 0.4

  const banner = (
    <motion.div
      whileHover={locked ? undefined : { y: -4, scale: 1.012 }}
      whileTap={locked ? undefined : { scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      className="relative w-full aspect-[3/1] rounded-[22px] overflow-hidden"
      style={{
        boxShadow:
          '0 16px 36px -16px rgba(0,0,0,0.65), 0 4px 10px -4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.16)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {game.image ? (
        <img
          src={game.image}
          alt={game.title}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <FallbackBanner game={game} />
      )}

      {/* Idle shine sweep — diagonal translucent gradient slides across
          every ~5s. Skipped on locked cards. */}
      {!locked && (
        <motion.div
          aria-hidden
          className="absolute inset-y-0 pointer-events-none"
          style={{
            width: '38%',
            left: 0,
            background:
              'linear-gradient(105deg, transparent 22%, rgba(255,255,255,0.20) 50%, transparent 78%)',
          }}
          initial={{ x: '-110%' }}
          animate={{ x: '380%' }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            repeatDelay: 4.5,
            ease: 'easeInOut',
            delay: shineDelay,
          }}
        />
      )}

      {/* Locked overlay */}
      {locked && (
        <div className="absolute inset-0 bg-surface/55 backdrop-blur-[2px] grid place-items-center">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-2 bg-black/65 rounded-full px-3 py-1.5 ring-1 ring-white/10 shadow-lg">
            🔒 Coming soon
          </span>
        </div>
      )}
    </motion.div>
  )

  // Playable cards open the GameIntroModal instead of navigating to a page.
  return locked ? (
    <div>{banner}</div>
  ) : (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${game.title} — how to play`}
      className="block w-full text-left appearance-none"
    >
      {banner}
    </button>
  )
}

/**
 * Synthetic banner for games that don't have artwork yet — keeps the
 * 3:1 rhythm so the screen reads as a coherent list. Replace with a real
 * banner image (drop /<slug>.png in public/) once it's designed.
 */
function FallbackBanner({ game }: { game: Game }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center gap-5 px-6"
      style={{
        background: `linear-gradient(135deg, ${game.accent} 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.88) 100%)`,
      }}
    >
      <span
        className="text-[44px]"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.55))' }}
      >
        {game.emoji}
      </span>
      <div className="text-left">
        <div className="font-extrabold text-white text-2xl tracking-tight drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)]">
          {game.title}
        </div>
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/75 mt-1">
          {game.players}
        </div>
      </div>
    </div>
  )
}
