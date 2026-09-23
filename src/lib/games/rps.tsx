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
 *
 * RPC ORDERING (D12 of the client plan). The naive order —
 * `setGameSecret -> reveal -> clearGameSecrets -> play_chat_move` — loses
 * BOTH throws if the move fails after the clear: the state still says both
 * players threw, but the secrets are gone, so nobody can ever reveal again.
 * This module instead:
 *   1. The FIRST thrower of a round clears any leftover secrets before
 *      writing their own (a previous round's secrets that a failed clear
 *      left behind would otherwise be silently reused — `set_game_secret`
 *      is "on conflict do nothing").
 *   2. `setGameSecret` — once this resolves, the throw is committed and
 *      cannot be un-sent, so `onMove` is called with `secretSaved: true`.
 *   3. The SECOND thrower reveals and computes the round result.
 *   4. `play_chat_move` (via `onMove`) is sent BEFORE the secrets are
 *      cleared, not after.
 *   5. Secrets are cleared only once `onMove` resolves `true` — and that
 *      clear is best-effort: if it fails, the leftovers are harmless, since
 *      step 1 of the next round wipes them before that round's first secret
 *      is written.
 * A player's chosen throw is frozen in `lockedThrow` the moment
 * `setGameSecret` succeeds, so a retry after a failed `onMove` re-sends the
 * exact same throw rather than whatever button happens to be tapped next.
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

/** postgrest RPC errors are plain `{message, code, ...}` objects, not `Error`
 *  instances (see `useChatGames.ts`'s `errMessage`); our own client-side
 *  check in `secretApi.revealRpsThrows` throws a real `Error`. Duck-type
 *  both. */
function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message)
  return ''
}

function Board({ gameId, state, myRole, isMyTurn, finished, busy, onMove, onError }: BoardProps<RpsState>) {
  const [pending, setPending] = useState(false)
  const [lockedThrow, setLockedThrow] = useState<Throw | null>(null)
  const [resetNeeded, setResetNeeded] = useState(false)
  const opponent = other(myRole)
  const iThrew = state.thrown.includes(myRole)
  const theyThrew = state.thrown.includes(opponent)
  const last = state.history[state.history.length - 1]

  async function throwIt(pick: Throw) {
    if (!isMyTurn || busy || pending || finished || iThrew || resetNeeded) return
    const commit = lockedThrow ?? pick
    setPending(true)
    try {
      if (lockedThrow === null) {
        // First thrower of the round: wipe any leftover secrets before
        // writing a new one (D12 step 1).
        if (!theyThrew) {
          try {
            await clearGameSecrets(gameId)
          } catch (e) {
            onError(e)
            return
          }
        }
        try {
          await setGameSecret(gameId, { throw: commit })
        } catch (e) {
          onError(e)
          return
        }
        setLockedThrow(commit)
      }

      if (!theyThrew) {
        // Hand over without revealing anything yet.
        await onMove(
          { state: { ...state, thrown: [...state.thrown, myRole] }, summary: 'threw — your move' },
          { secretSaved: true },
        )
        return
      }

      // Second to throw: the server will now release both.
      let revealed: { mine: string; theirs: string }
      try {
        revealed = await revealRpsThrows(gameId)
      } catch (e) {
        if (messageOf(e).includes('both players must throw first')) setResetNeeded(true)
        onError(e)
        return
      }
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
      const matchWinner: Role | null = done ? (scores[myRole] > scores[opponent] ? myRole : opponent) : null

      // `summary` is delivered to the RECIPIENT (the opponent) as their
      // notification text, "{mover} {summary}". The mover here is just
      // whoever happened to be the second thrower this round — that has no
      // relation to who won the round or the match, so the copy must be
      // derived from `winner`/`matchWinner`, never hardcoded to "won".
      let summary: string
      if (done) {
        summary = matchWinner === myRole ? 'won at rock paper scissors' : 'lost at rock paper scissors'
      } else if (winner === null) {
        summary = 'tied the round — throwing again'
      } else if (winner === myRole) {
        summary = 'took the round — your turn'
      } else {
        summary = 'lost the round — throwing blind first'
      }

      const ok = await onMove(
        {
          state: { thrown: [], scores, history },
          // Loser of the round throws first next, so nobody is always the
          // one throwing blind.
          nextTurn: winner ? other(winner) : myRole,
          finished: done,
          winner: matchWinner,
          summary,
        },
        { secretSaved: true },
      )
      if (ok) {
        // Best effort: if this fails, the next round's first thrower (D12
        // step 1) wipes the leftovers before writing a new throw.
        try {
          await clearGameSecrets(gameId)
        } catch {
          // tolerated — see the module doc comment
        }
      }
    } finally {
      setPending(false)
    }
  }

  async function resetRound() {
    if (busy || pending) return
    setPending(true)
    try {
      try {
        await clearGameSecrets(gameId)
      } catch (e) {
        onError(e)
        return
      }
      // The clear just deleted our own secret too, so whatever was frozen no
      // longer exists server-side; a future throw must commit fresh.
      setLockedThrow(null)
      const ok = await onMove({
        state: { ...state, thrown: [] },
        nextTurn: other(myRole),
        summary: 'reset the round — throw again',
      })
      if (ok) setResetNeeded(false)
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

      {!finished && resetNeeded && (
        <div className="text-center space-y-2">
          <p className="text-xs text-ink-muted">Their throw went missing — reset and try again.</p>
          <button
            onClick={resetRound}
            disabled={busy || pending}
            className="rounded-full px-4 py-2 bg-white/10 text-sm font-bold text-ink hover:bg-white/15 disabled:opacity-50 transition-colors"
          >
            {pending ? 'Resetting…' : 'Reset round'}
          </button>
        </div>
      )}

      {!finished && !resetNeeded && !iThrew && (
        <div className="flex justify-center gap-2">
          {THROWS.filter((t) => lockedThrow === null || t.value === lockedThrow).map((t) => (
            <button
              key={t.value}
              onClick={() => throwIt(t.value)}
              disabled={!isMyTurn || busy || pending}
              aria-label={t.label}
              className="w-16 h-16 rounded-2xl glass grid place-items-center text-3xl hover:bg-white/10 disabled:opacity-40 transition-colors"
            >
              {t.emoji}
            </button>
          ))}
        </div>
      )}

      {!finished && !resetNeeded && lockedThrow && !iThrew && (
        <p className="text-center text-xs text-ink-muted">Saved — tap to send.</p>
      )}

      {iThrew && !finished && (
        <p className="text-center text-xs text-ink-muted">Thrown — hidden until they go.</p>
      )}
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
