/* eslint-disable react-refresh/only-export-components --
 * A game is one unit: its rules and the board that draws them. Splitting each
 * of the eight into a rules file and a component file to satisfy Fast Refresh
 * would double the file count for a dev-time convenience. The cost is that
 * editing a board reloads the chat screen instead of hot-swapping it.
 */
import { useState } from 'react'
import type { BoardProps, GameDef, Role } from './types'
import { other } from './types'
import { setGameSecret, revealRpsThrows, clearGameSecrets } from './secretApi'

export type Throw = 'rock' | 'paper' | 'scissors'

/**
 * Both players throw "at once", but a chat game has no at-once. So throws are
 * sequential and hidden: the first lands in chat_game_secrets where only its
 * owner can read it, the second player picks blind, and the server reveals
 * both together. Same information as a simultaneous throw, no waiting for
 * anyone to be online.
 *
 * Public state carries WHO has thrown, never WHAT.
 */
export type RpsState = {
  /** Roles that have thrown this round. */
  thrown: Role[]
  scores: Record<Role, number>
  /** Settled rounds, newest last. */
  history: { a: Throw; b: Throw; winner: Role | null }[]
}

export const BEST_OF = 5
const TO_WIN = Math.ceil(BEST_OF / 2)   // 3

const THROWS: { value: Throw; emoji: string; label: string }[] = [
  { value: 'rock', emoji: '✊', label: 'Rock' },
  { value: 'paper', emoji: '✋', label: 'Paper' },
  { value: 'scissors', emoji: '✌️', label: 'Scissors' },
]

const EMOJI: Record<Throw, string> = { rock: '✊', paper: '✋', scissors: '✌️' }
const BEATS: Record<Throw, Throw> = { rock: 'scissors', paper: 'rock', scissors: 'paper' }

function Board({ gameId, state, myRole, isMyTurn, finished, busy, onMove }: BoardProps<RpsState>) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const opponent = other(myRole)
  const iThrew = state.thrown.includes(myRole)
  const theyThrew = state.thrown.includes(opponent)
  const last = state.history[state.history.length - 1]

  async function throwIt(pick: Throw) {
    if (!isMyTurn || busy || pending || finished || iThrew) return
    setPending(true)
    setError(null)
    try {
      await setGameSecret(gameId, { throw: pick })

      // First to throw: hand over without revealing anything.
      if (!theyThrew) {
        onMove({
          state: { ...state, thrown: [...state.thrown, myRole] },
          summary: 'threw — your move',
        })
        return
      }

      // Second to throw: the server will now release both.
      const revealed = await revealRpsThrows(gameId)
      const mine = revealed.mine as Throw
      const theirs = revealed.theirs as Throw
      const winner: Role | null = mine === theirs ? null : BEATS[mine] === theirs ? myRole : opponent

      const scores = { ...state.scores }
      if (winner) scores[winner] += 1
      const history = [...state.history, {
        a: myRole === 'a' ? mine : theirs,
        b: myRole === 'b' ? mine : theirs,
        winner,
      }]
      const done = scores[myRole] >= TO_WIN || scores[opponent] >= TO_WIN

      // Throws are per-round; clear them so the next round starts blind.
      await clearGameSecrets(gameId)

      onMove({
        state: { thrown: [], scores, history },
        // Loser of the round throws first next, so nobody is always the one
        // throwing blind.
        nextTurn: winner ? other(winner) : myRole,
        finished: done,
        winner: done ? (scores[myRole] > scores[opponent] ? myRole : opponent) : null,
        summary: done ? 'won at rock paper scissors' : 'threw — your turn',
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-4 text-sm font-bold">
        <span className="text-rose">You {state.scores[myRole]}</span>
        <span className="text-ink-muted">—</span>
        <span className="text-gold">{state.scores[opponent]} Them</span>
      </div>

      {last && (
        <p className="text-center text-sm text-ink-2">
          {EMOJI[myRole === 'a' ? last.a : last.b]} vs {EMOJI[myRole === 'a' ? last.b : last.a]}
          {' · '}
          {last.winner === null ? 'Tie' : last.winner === myRole ? 'You took it' : 'They took it'}
        </p>
      )}

      {!finished && (
        <div className="flex justify-center gap-2">
          {THROWS.map((t) => (
            <button
              key={t.value}
              onClick={() => throwIt(t.value)}
              disabled={!isMyTurn || busy || pending || iThrew}
              aria-label={t.label}
              className="w-16 h-16 rounded-2xl glass grid place-items-center text-3xl hover:bg-white/10 disabled:opacity-40 transition-colors"
            >
              {t.emoji}
            </button>
          ))}
        </div>
      )}

      {iThrew && !finished && (
        <p className="text-center text-xs text-ink-muted">Thrown — hidden until they go.</p>
      )}
      {error && <p className="text-center text-xs text-danger">{error}</p>}
    </div>
  )
}

export const rps: GameDef<RpsState> = {
  kind: 'rock_paper_scissors',
  name: 'Rock Paper Scissors',
  emoji: '✊',
  blurb: `First to ${TO_WIN}. Throws stay hidden until you both go.`,
  initialState: () => ({ thrown: [], scores: { a: 0, b: 0 }, history: [] }),
  status: (state, myRole, isMyTurn, outcome) => {
    if (outcome) return outcome === 'won' ? 'You win the set.' : 'They win the set.'
    const opponent = other(myRole)
    if (!isMyTurn) return state.thrown.includes(myRole) ? 'They’re choosing' : 'Waiting for them'
    return state.thrown.includes(opponent) ? 'Your turn — they’ve already thrown' : 'Your turn — throw first'
  },
  Board,
}
