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
import { errMessage, isStaleLike } from '../../hooks/useChatGames'

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

/** `set_game_secret` and `reveal_rps_throws` raise plain postgrest tokens or a
 *  client-thrown Error (secretApi.ts:55) — never render either verbatim. */
function friendlyError(e: unknown): string {
  const m = errMessage(e)
  if (m.includes('both players must throw first')) return 'Still waiting on their throw — try again in a moment.'
  if (isStaleLike(e)) return 'The board moved on — refreshing.'
  return m
}

function Board({ gameId, state, myRole, isMyTurn, finished, busy, onMove }: BoardProps<RpsState>) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The throw already written to chat_game_secrets for THIS round, once the
  // write has actually landed. set_game_secret is set-once (0095:57): a
  // retry must resend this exact value rather than whatever was just
  // clicked, or the player could end up believing they threw something the
  // server never recorded (or, worse, substituting a throw they never
  // chose). Frozen only AFTER the write succeeds — never before.
  const [committed, setCommitted] = useState<Throw | null>(null)
  const opponent = other(myRole)
  const iThrew = state.thrown.includes(myRole)
  const theyThrew = state.thrown.includes(opponent)
  const last = state.history[state.history.length - 1]

  // A settled round is the one unambiguous "this round is over" signal —
  // history.length only grows when a round's move has actually landed on
  // the server. Reset the freeze then, regardless of whether the trailing
  // clearGameSecrets below happened to succeed. Adjusted during render
  // (React's documented pattern for state that must reset when a prop
  // changes) rather than in an effect, which would cascade an extra render.
  const [seenHistoryLen, setSeenHistoryLen] = useState(state.history.length)
  if (state.history.length !== seenHistoryLen) {
    setSeenHistoryLen(state.history.length)
    if (committed !== null) setCommitted(null)
  }

  async function throwIt(pick: Throw) {
    if (!isMyTurn || busy || pending || finished || iThrew) return
    const myThrow = committed ?? pick
    setPending(true)
    setError(null)
    try {
      // First thrower of a round wipes leftovers first: set_game_secret is
      // "do nothing on conflict" (0095:57), so a secret stranded by a failed
      // trailing clear (below) would silently be reused and
      // reveal_rps_throws would hand back LAST round's pair forever. Only on
      // the very first attempt this round — once `committed` is set this IS
      // a retry of an already-saved throw, and clearing here would wipe it
      // out from under that retry.
      if (!theyThrew && committed === null) {
        await clearGameSecrets(gameId)
      }
      await setGameSecret(gameId, { throw: myThrow })
      // Only now — once the write actually landed — does this become the
      // throw of record. A later failure (onMove / reveal) must resend
      // exactly this value, never whatever gets clicked next.
      setCommitted(myThrow)

      // First to throw: hand over without revealing anything.
      if (!theyThrew) {
        await onMove({
          state: { ...state, thrown: [...state.thrown, myRole] },
          summary: 'threw — your move',
        })
        // Leave `committed` set either way: the round hasn't changed yet
        // (state.thrown grew, not state.history) — it clears itself once
        // the round actually settles, above.
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
      const matchWinner = done ? (scores[myRole] > scores[opponent] ? myRole : opponent) : null
      const nextTurn: Role = winner ? other(winner) : myRole

      // `summary` is read by the OPPONENT, from their own point of view — it
      // must describe the real outcome and agree with `nextTurn` below, not
      // just describe what this player (the mover) did.
      let summary: string
      if (done) {
        summary = matchWinner === myRole ? 'won the set' : 'lost the set'
      } else if (winner === null) {
        // nextTurn is `myRole` (the mover, who is composing this summary for
        // the opponent) — the mover throws blind again, not the opponent.
        summary = 'tied a round — throwing again'
      } else if (winner === myRole) {
        // Mover won the round; opponent lost it and throws next.
        summary = 'won a round — your turn'
      } else {
        // Mover lost the round and throws first next; opponent just waits.
        summary = 'lost a round'
      }

      await onMove({
        state: { thrown: [], scores, history },
        // Loser of the round throws first next, so nobody is always the one
        // throwing blind.
        nextTurn,
        finished: done,
        winner: matchWinner,
        summary,
      })
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setPending(false)
    }
  }

  const committedLabel = committed ? THROWS.find((t) => t.value === committed)?.label : null

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
          {committed !== null && !iThrew ? (
            <button
              onClick={() => throwIt(committed)}
              disabled={!isMyTurn || busy || pending}
              aria-label={`${committedLabel} — saved, tap to resend`}
              className="w-16 h-16 rounded-2xl glass grid place-items-center text-3xl ring-2 ring-gold hover:bg-white/10 disabled:opacity-40 transition-colors"
            >
              {EMOJI[committed]}
            </button>
          ) : (
            THROWS.map((t) => (
              <button
                key={t.value}
                onClick={() => throwIt(t.value)}
                disabled={!isMyTurn || busy || pending || iThrew}
                aria-label={t.label}
                className="w-16 h-16 rounded-2xl glass grid place-items-center text-3xl hover:bg-white/10 disabled:opacity-40 transition-colors"
              >
                {t.emoji}
              </button>
            ))
          )}
        </div>
      )}

      {committed !== null && !iThrew && !finished && (
        <p className="text-center text-xs text-ink-muted">Saved — tap to resend.</p>
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
