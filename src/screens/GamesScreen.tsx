import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import ScreenHeader from '../shell/ScreenHeader'
import TopIcons from '../shell/TopIcons'
import { stagger, itemUp } from '../shell/motion'
import { PopunderAd } from '../components/FeedAd'

type Game = {
  title: string
  blurb: string
  emoji: string
  players: 'Couples' | 'Group' | '1v1' | '1v1 / Group'
  accent: string
  to?: string // present = playable (no padlock)
}

const GAMES: Game[] = [
  { title: 'Pixel Rush',        blurb: 'Race to rebuild a scrambled photo. Fastest to fix it wins.', emoji: '🧩', players: '1v1 / Group', accent: 'var(--color-gold)', to: '/games/pixel-rush' },
  { title: 'Number Duel',       blurb: 'Pick a secret number; race to guess your rival’s. Higher or lower!', emoji: '🔢', players: '1v1', accent: 'var(--color-magenta)', to: '/games/number-duel' },
  { title: 'Draughts',          blurb: 'Classic checkers — jump, capture, crown your king. Best of 3 takes the trophy.', emoji: '♟', players: '1v1', accent: 'var(--color-gold)', to: '/games/draughts' },
  { title: 'Truth or Dare',     blurb: 'Spicy prompts to break the ice — your rules.',        emoji: '🎯', players: 'Couples', accent: 'var(--color-rose)' },
]

export default function GamesScreen() {
  return (
    <div className="min-h-full relative">
      <PopunderAd />
      <ScreenHeader title="Games" right={<TopIcons />} />

      <div className="px-5 sm:px-8 pb-28">
        <div className="glass rounded-2xl px-4 py-3 mb-5 text-sm text-ink-2 flex items-center gap-2">
          <span className="text-lg">🎮</span>
          <span>Pixel Rush &amp; Number Duel are live — tap to play. More games are on the way.</span>
        </div>

        <motion.div
          className="grid grid-cols-2 gap-3"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          {GAMES.map((g) => (
            <motion.div key={g.title} variants={itemUp}>
              <GameCard game={g} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

function GameCard({ game }: { game: Game }) {
  const locked = !game.to

  // A raised physical tile: gradient surface, top highlight + base shadow,
  // accent rim-light. Hover lifts + tilts in 3D; press settles it back down.
  const card = (
    <motion.div
      whileHover={locked ? undefined : { y: -7, rotateX: 7, rotateY: -3, scale: 1.03 }}
      whileTap={locked ? undefined : { y: -2, scale: 0.99, rotateX: 2 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      className="relative h-40 rounded-[20px] p-4 flex flex-col overflow-hidden"
      style={{
        transformStyle: 'preserve-3d',
        background:
          'linear-gradient(158deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 36%, rgba(0,0,0,0.16) 78%, rgba(0,0,0,0.28) 100%)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow:
          '0 14px 30px -10px rgba(0,0,0,0.6), 0 4px 10px -4px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -14px 26px -16px rgba(0,0,0,0.7)',
      }}
    >
      {/* accent rim-light glow */}
      <div
        aria-hidden
        className="absolute -top-12 -right-10 w-32 h-32 rounded-full blur-2xl opacity-40 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${game.accent} 0%, transparent 70%)` }}
      />
      {/* glossy top sheen */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1/2 rounded-t-[20px] pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.10), transparent)' }}
      />

      <div className="flex items-start justify-between" style={{ transform: 'translateZ(28px)' }}>
        {/* embossed emoji medallion */}
        <span
          className="w-12 h-12 rounded-2xl grid place-items-center text-2xl"
          style={{
            background: 'radial-gradient(circle at 32% 26%, rgba(255,255,255,0.30), rgba(0,0,0,0.25) 75%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -3px 6px rgba(0,0,0,0.45), 0 6px 12px -4px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <span style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.55))' }}>{game.emoji}</span>
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/30 text-ink-2 ring-1 ring-white/10">
          {game.players}
        </span>
      </div>

      <div className="mt-auto" style={{ transform: 'translateZ(18px)' }}>
        <div className="font-extrabold text-ink text-[15px] leading-tight flex items-center gap-1.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">
          {game.title}
          {!locked && (
            <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-success/25 text-success ring-1 ring-success/30">New</span>
          )}
        </div>
        <div className="text-[11px] text-ink-muted line-clamp-2 mt-0.5">{game.blurb}</div>
      </div>

      {/* Coming-soon padlock overlay (only for non-playable cards) */}
      {locked && (
        <div className="absolute inset-0 grid place-items-center bg-surface/55 backdrop-blur-[1.5px]" style={{ transform: 'translateZ(40px)' }}>
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-2 bg-black/55 rounded-full px-3 py-1.5 ring-1 ring-white/10 shadow-lg">
            🔒 Coming soon
          </span>
        </div>
      )}
    </motion.div>
  )

  const wrap = '[perspective:900px]'
  return game.to ? (
    <Link to={game.to} className={`block ${wrap}`}>{card}</Link>
  ) : (
    <div className={wrap}>{card}</div>
  )
}
