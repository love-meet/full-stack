import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import ScreenHeader from '../shell/ScreenHeader'
import TopIcons from '../shell/TopIcons'
import { stagger, itemUp } from '../shell/motion'
import { PopunderAd } from '../components/FeedAd'

type Game = {
  title: string
  /** Wide banner artwork (~4:1). Contains title, blurb, badges, play button —
   *  React only needs to display it + add motion. */
  image?: string
  /** Used only by the synthetic-banner fallback for games without artwork. */
  emoji: string
  players: 'Couples' | 'Group' | '1v1' | '1v1 / Group'
  accent: string
  to?: string // present = playable (no padlock)
}

const GAMES: Game[] = [
  { title: 'Pixel Rush',    image: '/pixel-rush.png',  emoji: '🧩', players: '1v1 / Group', accent: 'var(--color-gold)',    to: '/games/pixel-rush' },
  { title: 'Number Duel',   image: '/number-duel.png', emoji: '🔢', players: '1v1',         accent: 'var(--color-magenta)', to: '/games/number-duel' },
  { title: 'Draughts',      image: '/draughts.png',    emoji: '♟',  players: '1v1',         accent: 'var(--color-gold)',    to: '/games/draughts' },
  { title: 'Truth or Dare',                            emoji: '🎯', players: 'Couples',     accent: 'var(--color-rose)' },
]

export default function GamesScreen() {
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
              <GameCard game={g} index={i} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

function GameCard({ game, index }: { game: Game; index: number }) {
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
      className="relative w-full aspect-[4/1] rounded-[20px] overflow-hidden"
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

      {/* Idle shine sweep — a diagonal translucent gradient slides across the
          card every ~5s. Subtle, draws the eye to the play button baked
          into the artwork without competing with it. Skipped on locked
          cards (no draw needed when there's nothing to tap). */}
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

  return game.to ? (
    <Link to={game.to} className="block">
      {banner}
    </Link>
  ) : (
    <div>{banner}</div>
  )
}

/**
 * Synthetic banner for games that don't have artwork yet — keeps the
 * 4:1 rhythm so the screen reads as a coherent list. Replace with a real
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
