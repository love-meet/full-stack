import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { Game, GamePlayer } from '../../hooks/usePixelGame'
import { playerLabel } from '../../hooks/usePixelGame'
import { useDuelState, useSetDuelSecret, useSubmitDuelGuess, useAdvanceDuel, type DuelGuess } from '../../hooks/useNumberDuel'
import NumberKeyboard from './NumberKeyboard'
import { InlineAd } from '../FeedAd'

/** The Number Duel round area (everything below the shared VS header). */
export default function DuelArena({
  g, players, myId, amPlayer,
}: {
  g: Game
  players: GamePlayer[]
  myId: string | null
  amPlayer: boolean
}) {
  const round = g.current_round
  const { round: dr, secrets, guesses, isPending } = useDuelState(g.id, round)
  const setSecret = useSetDuelSecret()
  const guess = useSubmitDuelGuess()
  const advance = useAdvanceDuel()
  const [input, setInput] = useState('')

  const opponent = players.find((p) => p.user_id !== myId)
  const mySecret = secrets.find((s) => s.user_id === myId)?.secret ?? null
  const myGuesses = guesses.filter((x) => x.guesser_id === myId)
  const oppGuesses = guesses.filter((x) => x.guesser_id !== myId)

  // Fresh keypad each round/phase change.
  useEffect(() => { setInput('') }, [round, dr?.status])

  // Players auto-advance a won round after a brief celebration (server no-ops
  // all but the first caller).
  useEffect(() => {
    if (!amPlayer || g.status !== 'active' || dr?.status !== 'done') return
    const t = window.setTimeout(() => advance.mutate({ gameId: g.id, round }), 3500)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amPlayer, g.status, g.id, round, dr?.status])

  if (isPending || !dr) return <div className="py-10 text-center text-ink-muted text-sm">Loading round…</div>

  // ── Picking phase ──────────────────────────────────────────────────────
  if (dr.status === 'picking') {
    if (!amPlayer) {
      return (
        <Centered icon="🤫">
          <p className="font-bold text-ink">Players are picking secret numbers…</p>
          <p className="text-sm text-ink-muted mt-1">{secrets.length}/{players.length} locked in</p>
          <InlineAd />
        </Centered>
      )
    }
    if (mySecret == null) {
      return (
        <div className="py-4 text-center">
          <p className="text-sm text-ink-2 mb-1">Round {round} · Pick a <b>secret number</b></p>
          <p className="text-[12px] text-ink-muted mb-3">Any figure — e.g. 2.4, 17 or 90. Up to 2 decimal places (0.22 ok, 0.999 not).</p>
          <div className="text-4xl font-extrabold text-gradient-warm tabular-nums min-h-[3rem] mb-3">{input || '—'}</div>
          <NumberKeyboard
            value={input}
            onChange={setInput}
            onSubmit={() => setSecret.mutate({ gameId: g.id, round, secret: Number(input) })}
            actionLabel={setSecret.isPending ? 'Locking…' : '🔒 Lock in my number'}
            disabled={setSecret.isPending}
          />
        </div>
      )
    }
    return (
      <Centered icon="🔒">
        <p className="font-bold text-ink">Your number is locked in</p>
        <p className="text-2xl font-extrabold text-gradient-warm tabular-nums mt-1">{mySecret}</p>
        <p className="text-sm text-ink-muted mt-2 flex items-center justify-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          Waiting for {opponent ? playerLabel(opponent) : 'opponent'} to pick…
        </p>
        <InlineAd />
      </Centered>
    )
  }

  // ── Done phase ─────────────────────────────────────────────────────────
  if (dr.status === 'done') {
    const iWon = dr.winner_player === myId
    const winner = players.find((p) => p.user_id === dr.winner_player)
    const oppSecret = secrets.find((s) => s.user_id === opponent?.user_id)?.secret
    return (
      <Centered icon="🎉">
        <p className="text-lg font-extrabold text-ink">
          {amPlayer ? (iWon ? 'You guessed it!' : 'Round lost') : `${winner ? playerLabel(winner) : 'Someone'} guessed it!`}
        </p>
        {oppSecret != null && mySecret != null && amPlayer && (
          <p className="text-sm text-ink-muted mt-1">Their number was <b className="text-ink">{oppSecret}</b> · yours was <b className="text-ink">{mySecret}</b></p>
        )}
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-ink-muted">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          <span>{g.current_round >= g.rounds_total ? 'Tallying final results…' : 'Next round starting…'}</span>
        </div>
        <InlineAd />
      </Centered>
    )
  }

  // ── Guessing phase ─────────────────────────────────────────────────────
  if (!amPlayer) {
    // Spectator: both numbers + the guesses aimed at each.
    return (
      <div className="grid grid-cols-2 gap-3">
        {players.map((p) => {
          const secret = secrets.find((s) => s.user_id === p.user_id)?.secret
          const incoming = guesses.filter((x) => x.guesser_id !== p.user_id) // guesses AT p
          return (
            <div key={p.id} className="glass rounded-2xl p-3">
              <div className="text-[11px] text-ink-2 truncate font-bold">{playerLabel(p)}</div>
              <div className="text-2xl font-extrabold text-gradient-warm tabular-nums">{secret ?? '🔒'}</div>
              <div className="mt-2 text-[10px] uppercase tracking-wide text-ink-muted">Guesses</div>
              <GuessList guesses={incoming} />
            </div>
          )
        })}
      </div>
    )
  }

  // Player guessing their opponent's number.
  return (
    <div>
      {/* Top: your number + the opponent's guesses at it. */}
      <div className="glass rounded-2xl p-3 mb-4 flex items-stretch gap-3">
        <div className="text-center px-1">
          <div className="text-[10px] uppercase tracking-wide text-ink-muted">Your number</div>
          <div className="text-2xl font-extrabold text-gradient-warm tabular-nums">{mySecret ?? '—'}</div>
        </div>
        <div className="w-px bg-white/10" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-ink-muted mb-1">Their guesses at you</div>
          <GuessList guesses={oppGuesses} />
        </div>
      </div>

      {/* Main: guess their number. Only your LATEST guess shows — previous
          ones vanish, so you have to remember your own higher/lower trail. */}
      <div className="text-center">
        <p className="text-sm text-ink-2 mb-1">Guess <b>{opponent ? playerLabel(opponent) : 'their'}</b> number</p>
        {(() => {
          const last = myGuesses[myGuesses.length - 1]
          if (!last) return <p className="text-[11px] text-ink-muted mb-2">Previous guesses won’t be shown — keep them in your head 🧠</p>
          const label = last.feedback === 'higher' ? 'go higher' : last.feedback === 'lower' ? 'go lower' : 'correct!'
          return (
            <div className="mb-2 flex items-center justify-center gap-2 text-sm">
              <span className="text-ink-muted">Last guess</span>
              <GuessChip guess={last} />
              <span className={last.feedback === 'higher' ? 'text-coral font-bold' : last.feedback === 'lower' ? 'text-rose font-bold' : 'text-success font-bold'}>{label}</span>
            </div>
          )
        })()}
        <div className="text-4xl font-extrabold text-gradient-warm tabular-nums min-h-[3rem] mb-3">{input || '—'}</div>
        <NumberKeyboard
          value={input}
          onChange={setInput}
          onSubmit={() => { guess.mutate({ gameId: g.id, round, value: Number(input) }); setInput('') }}
          actionLabel={guess.isPending ? 'Guessing…' : 'Guess'}
          disabled={guess.isPending}
        />
      </div>
    </div>
  )
}

/** A guess with its higher/lower arrow. */
function GuessChip({ guess }: { guess: DuelGuess }) {
  const arrow = guess.feedback === 'correct' ? '✅' : guess.feedback === 'higher' ? '↑' : '↓'
  const tint = guess.feedback === 'correct' ? 'text-success'
    : guess.feedback === 'higher' ? 'text-coral' : 'text-rose'
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
      className={['inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-sm font-bold tabular-nums shrink-0', tint].join(' ')}
    >
      {guess.value}<span aria-hidden>{arrow}</span>
    </motion.span>
  )
}

/** Guesses laid out as a single horizontally-scrolling line. */
function GuessList({ guesses }: { guesses: DuelGuess[] }) {
  if (guesses.length === 0) return <span className="text-[12px] text-ink-muted">—</span>
  // newest first so the latest attempt is easy to see
  const ordered = [...guesses].reverse()
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 -mx-1 px-1">
      {ordered.map((x) => <GuessChip key={x.id} guess={x} />)}
    </div>
  )
}

function Centered({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="text-center py-8">
      <div className="text-4xl">{icon}</div>
      <div className="mt-2">{children}</div>
    </div>
  )
}
