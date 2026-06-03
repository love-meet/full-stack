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
  { title: 'Pixel Rush',    blurb: 'Race to rebuild a scrambled photo. Fastest to fix it wins.',           emoji: '🧩', players: '1v1 / Group', accent: 'var(--color-gold)',    to: '/games/pixel-rush' },
  { title: 'Number Duel',   blurb: "Pick a secret number; race to guess your rival's. Higher or lower!",   emoji: '🔢', players: '1v1',         accent: 'var(--color-magenta)', to: '/games/number-duel' },
  { title: 'Draughts',      blurb: 'Classic checkers — jump, capture, crown your king. Best of 3 takes the trophy.', emoji: '♟', players: '1v1', accent: 'var(--color-gold)',    to: '/games/draughts' },
  { title: 'Truth or Dare', blurb: 'Spicy prompts to break the ice — your rules.',                          emoji: '🎯', players: 'Couples',     accent: 'var(--color-rose)' },
]

export default function GamesScreen() {
  return (
    <div className="min-h-full relative">
      <PopunderAd />
      <ScreenHeader title="Games" right={<TopIcons />} />

      <div className="max-w-xl mx-auto px-5 sm:px-8 pt-5 pb-28">
        <motion.div
          className="flex flex-col gap-3.5"
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

  const card = (
    <motion.div
      whileHover={locked ? undefined : { y: -3, scale: 1.01 }}
      whileTap={locked ? undefined : { scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      className="relative rounded-[22px] p-4 sm:p-5 flex items-center gap-4 overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 50%, rgba(0,0,0,0.18) 100%)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow:
          '0 14px 32px -14px rgba(0,0,0,0.55), 0 2px 6px -2px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.20)',
      }}
    >
      {/* Accent rim-light glow (top-right corner) */}
      <div
        aria-hidden
        className="absolute -top-10 -right-14 w-48 h-48 rounded-full blur-3xl opacity-55 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${game.accent} 0%, transparent 65%)` }}
      />
      {/* Glossy top sheen */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.08), transparent)' }}
      />

      {/* Embossed emoji medallion. Wiggles on hover for playable games. */}
      <motion.div
        className="relative w-16 h-16 rounded-2xl grid place-items-center text-[28px] flex-shrink-0"
        style={{
          background: 'radial-gradient(circle at 32% 26%, rgba(255,255,255,0.32), rgba(0,0,0,0.28) 75%)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.42), inset 0 -3px 6px rgba(0,0,0,0.45), 0 6px 14px -4px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.14)',
        }}
        whileHover={
          locked
            ? undefined
            : { rotate: [0, -6, 6, -3, 0], transition: { duration: 0.5 } }
        }
      >
        <span style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.55))' }}>
          {game.emoji}
        </span>
      </motion.div>

      {/* Title + meta + blurb */}
      <div className="flex-1 min-w-0 relative">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-extrabold text-ink text-lg leading-tight drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]">
            {game.title}
          </span>
          {!locked && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-success/25 text-success ring-1 ring-success/30">
              Live
            </span>
          )}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted mt-0.5">
          {game.players}
        </div>
        <div className="text-[13px] text-ink-2 mt-1 line-clamp-2 leading-snug">
          {game.blurb}
        </div>
      </div>

      {/* CTA — gentle horizontal nudge animation draws attention without being noisy */}
      <div className="flex-shrink-0 relative">
        {locked ? (
          <span className="grid place-items-center w-11 h-11 rounded-full bg-black/40 text-ink-muted ring-1 ring-white/10 text-lg">
            🔒
          </span>
        ) : (
          <motion.span
            className="grid place-items-center w-11 h-11 rounded-full text-white font-bold text-base"
            style={{
              background: `linear-gradient(135deg, ${game.accent} 0%, rgba(0,0,0,0.55) 100%)`,
              boxShadow:
                '0 6px 14px -4px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.32)',
            }}
            animate={{ x: [0, 3, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            ▶
          </motion.span>
        )}
      </div>

      {/* Locked overlay (only for non-playable cards) */}
      {locked && (
        <div className="absolute inset-0 bg-surface/45 backdrop-blur-[2px] grid place-items-center">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-2 bg-black/60 rounded-full px-3 py-1.5 ring-1 ring-white/10 shadow-lg">
            🔒 Coming soon
          </span>
        </div>
      )}
    </motion.div>
  )

  return game.to ? (
    <Link to={game.to} className="block">
      {card}
    </Link>
  ) : (
    <div>{card}</div>
  )
}
