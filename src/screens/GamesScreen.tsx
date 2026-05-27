import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import ScreenHeader from '../shell/ScreenHeader'
import { stagger, itemUp } from '../shell/motion'

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
  { title: 'Truth or Dare',     blurb: 'Spicy prompts to break the ice — your rules.',        emoji: '🎯', players: 'Couples', accent: 'var(--color-rose)' },
  { title: 'Would You Rather',  blurb: 'Reveal what you really want, one choice at a time.',   emoji: '🤔', players: 'Group',   accent: 'var(--color-magenta)' },
  { title: 'Love Quiz',         blurb: 'How well do you really know each other?',              emoji: '💞', players: 'Couples', accent: 'var(--color-rose)' },
  { title: 'Never Have I Ever', blurb: 'Confessions get the conversation flowing.',           emoji: '🙈', players: 'Group',   accent: 'var(--color-coral)' },
  { title: 'Two Truths & a Lie',blurb: 'Spot the bluff and learn something new.',             emoji: '🎭', players: 'Group',   accent: 'var(--color-magenta)' },
  { title: 'Date Night Roulette',blurb: 'Spin for your next move together.',                  emoji: '🎡', players: 'Couples', accent: 'var(--color-rose)' },
  { title: 'Compliment Battle', blurb: 'Out-charm each other, sweetest line wins.',           emoji: '💌', players: 'Group',   accent: 'var(--color-coral)' },
  { title: 'Guess the Vibe',    blurb: 'Read the room and match the mood.',                    emoji: '🎶', players: 'Group',   accent: 'var(--color-gold)' },
  { title: 'Couple Goals',      blurb: 'Tiny challenges to do together this week.',            emoji: '🏆', players: 'Couples', accent: 'var(--color-rose)' },
]

export default function GamesScreen() {
  return (
    <div className="min-h-full relative">
      <ScreenHeader
        title="Games"
        subtitle="Play, flirt and bond — with your match or the whole room."
        tone="brand"
      />

      <div className="px-5 sm:px-8 pb-28">
        <div className="glass rounded-2xl px-4 py-3 mb-5 text-sm text-ink-2 flex items-center gap-2">
          <span className="text-lg">🎮</span>
          <span>Pixel Rush is live — tap to play. More games are on the way.</span>
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
  const inner = (
    <>
      {/* tinted glow */}
      <div
        aria-hidden
        className="absolute -top-10 -right-8 w-28 h-28 rounded-full blur-2xl opacity-30 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${game.accent} 0%, transparent 70%)` }}
      />
      <div className="flex items-start justify-between">
        <span className="text-3xl drop-shadow">{game.emoji}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-ink-muted">
          {game.players}
        </span>
      </div>
      <div className="mt-auto">
        <div className="font-extrabold text-ink text-[15px] leading-tight flex items-center gap-1.5">
          {game.title}
          {game.to && (
            <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-success/20 text-success">New</span>
          )}
        </div>
        <div className="text-[11px] text-ink-muted line-clamp-2 mt-0.5">{game.blurb}</div>
      </div>

      {/* Coming-soon padlock overlay (only for non-playable cards) */}
      {!game.to && (
        <div className="absolute inset-0 grid place-items-center bg-surface/55 backdrop-blur-[1px]">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-2 bg-black/45 rounded-full px-3 py-1.5">
            🔒 Coming soon
          </span>
        </div>
      )}
    </>
  )

  const cls = 'relative overflow-hidden rounded-2xl glass p-4 h-40 flex flex-col'
  return game.to ? (
    <Link to={game.to} className={`${cls} block hover:ring-1 hover:ring-gold/40 transition-shadow`}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}
