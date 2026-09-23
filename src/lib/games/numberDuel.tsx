/* eslint-disable react-refresh/only-export-components --
 * A game is one unit: its rules and the board that draws them. Splitting each
 * of the eight into a rules file and a component file to satisfy Fast Refresh
 * would double the file count for a dev-time convenience. The cost is that
 * editing a board reloads the chat screen instead of hot-swapping it.
 */
import { useState } from 'react'
import type { BoardProps, GameDef, Role } from './types'
import { other } from './types'
import { setGameSecret, guessDuelNumber } from './secretApi'

export const MIN = 1
export const MAX = 100

/**
 * Number Duel, rebuilt for chat.
 *
 * Each player picks a secret number; then they take turns guessing the
 * other's, with higher/lower feedback. First to land it wins.
 *
 * The numbers live in chat_game_secrets and the comparison runs server-side
 * (migration 0095) — the guess only ever comes back as higher, lower, or got
 * it. The old version was a real-time race that needed both players present;
 * this is the same idea with the waiting taken out.
 */
export type DuelState = {
  phase: 'setting' | 'playing'
  /** Roles that have locked in a number. */
  ready: Role[]
  /** Guess log per role, with the verdict each got. */
  guesses: Record<Role, { value: number; verdict: -1 | 0 | 1 }[]>
}

function Board({ gameId, state, myRole, isMyTurn, finished, busy, onMove }: BoardProps<DuelState>) {
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const opponent = other(myRole)
  const amReady = state.ready.includes(myRole)
  const mine = state.guesses[myRole] ?? []
  const last = mine[mine.length - 1]

  const value = Number(draft)
  const valid = Number.isInteger(value) && value >= MIN && value <= MAX

  async function lockIn() {
    if (!isMyTurn || !valid || busy || pending) return
    setPending(true)
    setError(null)
    try {
      await setGameSecret(gameId, { number: value })
      const ready = [...state.ready, myRole]
      const bothIn = ready.length === 2
      onMove({
        state: { ...state, ready, phase: bothIn ? 'playing' : 'setting' },
        // While setting, hand over so the other player picks. Once both are
        // in, player 'a' guesses first.
        nextTurn: bothIn ? 'a' : opponent,
        summary: bothIn ? 'locked in — game on' : 'picked a number — your turn',
      })
      setDraft('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(false)
    }
  }

  async function guess() {
    if (!valid || !isMyTurn || busy || pending || finished) return
    setPending(true)
    setError(null)
    try {
      const r = await guessDuelNumber(gameId, value)
      const guesses = {
        ...state.guesses,
        [myRole]: [...mine, { value, verdict: r.verdict }],
      }
      onMove({
        state: { ...state, guesses },
        finished: r.correct,
        winner: r.correct ? myRole : null,
        summary: r.correct ? `got it — ${value}` : `guessed ${value}`,
      })
      setDraft('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(false)
    }
  }

  const setting = state.phase === 'setting'

  return (
    <div className="space-y-3">
      {setting ? (
        amReady ? (
          <p className="text-center text-sm text-ink-muted py-4">
            Locked in. Waiting for them to pick theirs…
          </p>
        ) : (
          <>
            <p className="text-center text-sm text-ink-2">
              Pick a secret number, {MIN}–{MAX}. They'll try to guess it.
            </p>
            <NumberInput value={draft} onChange={setDraft} disabled={!isMyTurn || busy || pending} />
            <button
              onClick={lockIn}
              disabled={!isMyTurn || !valid || busy || pending}
              className="w-full rounded-full py-2.5 bg-gradient-brand text-white text-sm font-bold glow-rose disabled:opacity-50"
            >
              {pending ? 'Locking in…' : 'Lock it in'}
            </button>
          </>
        )
      ) : (
        <>
          {last && (
            <p className="text-center text-lg font-extrabold text-ink">
              {last.value} —{' '}
              {last.verdict === 0 ? (
                <span className="text-success">that's it</span>
              ) : last.verdict === -1 ? (
                <span className="text-gold">go higher</span>
              ) : (
                <span className="text-gold">go lower</span>
              )}
            </p>
          )}

          {mine.length > 0 && (
            <p className="text-center text-xs text-ink-muted">
              {mine.length} {mine.length === 1 ? 'guess' : 'guesses'} ·{' '}
              {mine.map((g) => g.value).join(', ')}
            </p>
          )}

          {!finished && isMyTurn && (
            <>
              <NumberInput value={draft} onChange={setDraft} />
              <button
                onClick={guess}
                disabled={!valid || busy || pending}
                className="w-full rounded-full py-2.5 bg-gradient-brand text-white text-sm font-bold glow-rose disabled:opacity-50"
              >
                {pending ? 'Checking…' : 'Guess'}
              </button>
            </>
          )}
        </>
      )}

      {error && <p className="text-center text-xs text-danger">{error}</p>}
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={MIN}
      max={MAX}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={`${MIN}–${MAX}`}
      className="lm-input w-full text-center text-2xl font-extrabold tabular-nums disabled:opacity-50"
      aria-label="Number"
    />
  )
}

export const numberDuel: GameDef<DuelState> = {
  kind: 'number_duel',
  name: 'Number Duel',
  emoji: '🔢',
  blurb: `Hide a number ${MIN}–${MAX}. First to guess theirs wins.`,
  initialState: () => ({ phase: 'setting', ready: [], guesses: { a: [], b: [] } }),
  status: (state, myRole, isMyTurn, outcome) => {
    if (outcome) return outcome === 'won' ? 'You got it. You win.' : 'They got yours first.'
    if (state.phase === 'setting') {
      if (state.ready.includes(myRole)) return 'Waiting for their number'
      return isMyTurn ? 'Pick your number' : 'Waiting for them to go first'
    }
    return isMyTurn ? 'Your turn — take a guess' : 'Waiting for them'
  },
  Board,
}
